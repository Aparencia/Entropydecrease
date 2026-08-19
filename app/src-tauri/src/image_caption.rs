//! 关键图图注生成（REQ-088 / v0.7.0 M3：本地规则，影子层基础设施）。

// 机制先行（v0.7.0 M3 登记）：本模块为影子层/面板数据源（命令层已接线或
// 供后续接线），部分函数无生产调用——dead_code 豁免（接线时移除）。
#![allow(dead_code)]
//!
//! @ai-context: 关键图一句话图注——OCR 高频词 × 转写摘要交叉（无 LLM）：
//!              图注 = 图内 OCR 高频词（去停用词）+ 附近转写段主题词交集。
//!              产出写入影子表（v0.7.0 只做 schema 预留 + 生成纯函数，
//!              REQ-094 影子 schema 正式落地后接线）。
//! @ai-context: 纯函数可单测（合成 OCR 块 + 段文本 → 图注断言）。

/// 停用词（图注交叉时过滤——通用高频词不构成图注信息）。
const STOP_WORDS: &[&str] = &[
    "的", "了", "是", "在", "和", "有", "就", "不", "都", "这", "那", "个", "也", "很", "到",
    "说", "要", "去", "会", "着", "没有", "可以", "我们", "你们", "他们", "这个", "那个",
    "the", "a", "an", "of", "to", "in", "and", "is", "for",
];

/// 高频词提取（纯函数）：文本词频 Top N（2-4 字短语 + 英文词）。
///
/// @ai-context: 中文按 2-4 字滑窗计数；**长短语加权**（×len/2——4 字短语
///              权重 2、2 字权重 1）——"梯度下降"（4 字×3 次=权重 6）压过
///              碎片 2-gram（"下降"×3=权重 3），避免同频碎片挤占。
pub fn frequent_terms(texts: &[&str], top_n: usize) -> Vec<String> {
    let mut freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for t in texts {
        let chars: Vec<char> = t.chars().collect();
        // 英文词（含数字）整体计数
        for word in t.split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| w.len() >= 2) {
            let w = word.to_lowercase();
            if !STOP_WORDS.contains(&w.as_str()) {
                *freq.entry(w).or_insert(0) += 1;
            }
        }
        // 中文 2-4 字滑窗（长短语加权）
        for len in 2..=4.min(chars.len()) {
            let weight = len.div_ceil(2); // 2字=1, 3字=2, 4字=2
            for w in chars.windows(len) {
                let s: String = w.iter().collect();
                if !STOP_WORDS.contains(&s.as_str()) {
                    *freq.entry(s).or_insert(0) += weight;
                }
            }
        }
    }
    let mut sorted: Vec<(String, usize)> = freq.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    sorted.into_iter().take(top_n).map(|(k, _)| k).collect()
}

/// 生成一句话图注（纯函数，REQ-088）：OCR 高频词 × 转写摘要交集。
///
/// @ai-context: 图注 = 图内高频词 ∩ 附近转写段词频的 Top 词拼接；
///              交集为空 → 退化为图内最高频词（诚实——图注仍反映画面内容）；
///              全部为空 → "（无文字画面）"（诚实降级）。
pub fn generate_caption(ocr_texts: &[&str], transcript_texts: &[&str]) -> String {
    let ocr_terms = frequent_terms(ocr_texts, 8);
    let transcript_terms = frequent_terms(transcript_texts, 8);
    if ocr_terms.is_empty() {
        return "（无文字画面）".to_string();
    }
    // 交叉：图内高频 ∩ 转写高频（OCR 词在转写中复现 = 讲者强调 = 图注核心）
    let mut intersect: Vec<String> = ocr_terms
        .iter()
        .filter(|t| transcript_terms.contains(t))
        .cloned()
        .collect();
    // 交集不足 2 词 → 补图内高频词（保持图注信息量）
    for t in &ocr_terms {
        if intersect.len() >= 2 {
            break;
        }
        if !intersect.contains(t) {
            intersect.push(t.clone());
        }
    }
    intersect.join("、")
}

/// 影子表 schema（REQ-094 预留）：图注影子行——正式 schema 落地前的数据契约。
///
/// @ai-context: 本版只定义类型（影子层基础设施），落库随 REQ-094。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ImageCaptionShadow {
    pub session_id: i64,
    pub timestamp_ms: u64,
    pub caption: String,
    /// 生成方式（"local-rule"——影子层透明度：用户可知图注非 AI）
    pub method: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frequent_terms_finds_repeated_phrase() {
        // Arrange：OCR 文本中"梯度下降"出现 3 次
        let texts = ["梯度下降算法", "梯度下降详解", "梯度下降实践"];
        // Act
        let terms = frequent_terms(&texts, 5);
        // Assert："梯度下降"高频居前
        assert!(terms.contains(&"梯度下降".to_string()), "terms={:?}", terms);
    }

    #[test]
    fn stop_words_filtered() {
        // Arrange：全停用词文本
        let texts = ["的的的", "我们我们"];
        // Act
        let terms = frequent_terms(&texts, 5);
        // Assert：停用词不出现（或长度不足 2 的滑窗天然排除）
        assert!(!terms.iter().any(|t| t == "我们"));
    }

    #[test]
    fn caption_crosses_ocr_and_transcript() {
        // Arrange：图内"卷积神经网络" + 转写复现"卷积"
        let ocr = ["卷积神经网络结构", "卷积层参数"];
        let transcript = ["卷积神经网络是重点", "今天讲卷积层"];
        // Act
        let caption = generate_caption(&ocr, &transcript);
        // Assert：交叉词入图注
        assert!(caption.contains("卷积"), "caption={}", caption);
    }

    #[test]
    fn caption_falls_back_to_ocr_terms() {
        // Arrange：转写与图无交集
        let ocr = ["矩阵特征值", "特征向量"];
        let transcript = ["今天讲牛顿定律"];
        // Act
        let caption = generate_caption(&ocr, &transcript);
        // Assert：退化为图内高频词（非空）
        assert!(!caption.is_empty());
        assert!(caption.contains("特征"), "caption={}", caption);
    }

    #[test]
    fn caption_empty_ocr_honest() {
        // 无文字画面 → 诚实标注
        assert_eq!(generate_caption(&[], &["讲内容"]), "（无文字画面）");
    }
}
