//! ASR 重打分决策（ADR-012 F1-1/F2-1）：纯函数，可单测。
//!
//! @ai-context: 端点断句后 SenseVoice 整句复核的取舍规则（ADR-003 §5 质量兜底的
//!              决策层）。2026-08-19 取证（ADR-012）：原项目 Jaccard ≥0.35 门限
//!              能修复句尾截断（"结果" vs "结"），Rust 移植的编辑距离 40% 门限
//!              在截断场景（短文本大差异）拒绝替换——重打分兜底失效。
//! @ai-context: 本模块实现三层决策：① 前缀扩展接受（流式文本是 SenseVoice 前缀
//!              → 尾部被链路丢弃的字补回；仅尾静音端点启用，防 rule3 硬切时
//!              修复文本与下一段重复）；② 短句放宽（≤4 字编辑距离 ≤1）；③ 原
//!              编辑距离 ≤40% 规则（保留）。比较统一去标点/空白（SenseVoice
//!              use_itn 带标点而 Zipformer 无标点，带标点比较会高估差异）。

/// 前缀扩展接受：扩展长度上限 = max(8, 流式文本长度)（防 SenseVoice 幻觉续写；
/// 与 asr_dedupe 重叠上限一致；灌水型幻觉（"就是就是"）由 asr_clean 层兜底过滤）。
const EXTENSION_CAP_BASE: usize = 8;

/// 短句判定阈值（字符数 ≤ 该值按短句放宽门限）。
const SHORT_SENTENCE_CHARS: usize = 4;

/// 短句放宽门限：编辑距离 ≤ 1 接受。
const SHORT_SENTENCE_MAX_DIST: usize = 1;

/// 原规则门限：编辑距离 ≤ 较短文本的 40% 接受。
const ORIGINAL_DIST_RATIO: f32 = 0.4;

/// 重打分一致性置信度（REQ-098 CORE-O1，v0.7.0 M1）。
///
/// @ai-context: 置信度体系真实化——ASR 段置信度不再硬编码 0.9，改用 SenseVoice
///              重打分与 Zipformer 流式文本的**一致性相似度**作代理：相似度高
///              = 两路独立识别互相印证 = 可信；相似度低 = 两路分歧 = 低置信。
///              公式：1 - dist / max(len(zip), len(sense))（strip_punct 后按字符），
///              与 pick_rescored_with 的距离口径一致（决策与置信度同源不打架）。
/// @ai-context: 返回 None 表示**无法产出置信度**（输入为空）——调用方落 None
///              （诚实表达未知，不再用假 0.9 掩盖）。
pub fn consistency_confidence(zipformer_text: &str, sensevoice_text: &str) -> Option<f32> {
    let zip: Vec<char> = strip_punct(zipformer_text);
    let sense: Vec<char> = strip_punct(sensevoice_text);
    if zip.is_empty() || sense.is_empty() {
        return None;
    }
    let distance = levenshtein_chars(&zip, &sense);
    let max_len = zip.len().max(sense.len()) as f32;
    Some(1.0 - distance as f32 / max_len)
}

/// 重打分决策（完整版）。
///
/// @ai-context: allow_extension=允许前缀扩展接受——2026-08-19 取优整合：**所有端点
///              启用**（原仅尾静音端点）——rule3 硬切段的尾字丢失（13.wav 取证
///              4/16 段尾字真实丢失）同样需要 SenseVoice 补回；扩展造成的跨段重复
///              由 F3-2 跨 final 去重（asr_dedupe）+ F4-1 合并尾首重叠跳过
///              （asr_merge）承担，扩展上限（max(8, 流式长度)）防幻觉续写。
pub fn pick_rescored_with(
    zipformer_text: &str,
    sensevoice_text: &str,
    allow_extension: bool,
) -> Option<String> {
    let zip: Vec<char> = strip_punct(zipformer_text);
    let sense: Vec<char> = strip_punct(sensevoice_text);
    if zip.is_empty() || sense.is_empty() {
        return None;
    }
    // ① 前缀扩展接受：流式 = SenseVoice 前缀 → 尾字被链路丢弃，补回 SenseVoice
    if allow_extension
        && zip.len() < sense.len()
        && is_prefix(&zip, &sense)
        && sense.len() - zip.len() <= EXTENSION_CAP_BASE.max(zip.len())
    {
        return Some(sensevoice_text.trim().to_string());
    }
    // ② 短句放宽：流式 ≤4 字且编辑距离 ≤1 → 整句上下文更准的 SenseVoice 胜出
    if zip.len() <= SHORT_SENTENCE_CHARS && levenshtein_chars(&zip, &sense) <= SHORT_SENTENCE_MAX_DIST {
        return Some(sensevoice_text.trim().to_string());
    }
    // ③ 原规则：编辑距离 ≤ 较短文本 40%（长句微差异修正）
    let distance = levenshtein_chars(&zip, &sense);
    let shorter = zip.len().min(sense.len()) as f32;
    if distance as f32 <= shorter * ORIGINAL_DIST_RATIO {
        return Some(sensevoice_text.trim().to_string());
    }
    None
}

/// 前缀判断（纯函数）：a 是 b 的前缀（含相等）。
pub fn is_prefix(a: &[char], b: &[char]) -> bool {
    a.len() <= b.len() && a.iter().zip(b.iter()).all(|(x, y)| x == y)
}

/// 剥离标点与空白（纯函数；中文标点 + ASCII 标点 + 空白）。
pub fn strip_punct(s: &str) -> Vec<char> {
    s.chars()
        .filter(|c| !c.is_whitespace() && !"，。！？；：、,.!?;:'\"“”‘’（）()…—《》【】[]".contains(*c))
        .collect()
}

/// 编辑距离（DP，纯函数；按字符计）。
pub fn levenshtein(a: &str, b: &str) -> usize {
    levenshtein_chars(&a.chars().collect::<Vec<_>>(), &b.chars().collect::<Vec<_>>())
}

/// 编辑距离（字符切片版，避免重复 collect）。
fn levenshtein_chars(a: &[char], b: &[char]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0usize; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        curr[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            curr[j + 1] = if ca == cb {
                prev[j]
            } else {
                1 + prev[j].min(curr[j]).min(prev[j + 1])
            };
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── 前缀扩展接受（截断修复）──

    #[test]
    fn prefix_extension_repairs_tail_drop() {
        // Arrange：流式"结"（尾字被静音跳过丢弃），SenseVoice"结果"（音频完整）
        // Act/Assert：尾静音端点 → 前缀扩展接受，补回尾字
        assert_eq!(pick_rescored_with("结", "结果", true).as_deref(), Some("结果"));
    }

    #[test]
    fn prefix_extension_repairs_multichar_tail() {
        // Arrange：取证样本——"从头" → "从头到尾的过一遍"（丢 5 字）
        assert_eq!(pick_rescored_with("从头", "从头到尾的过一遍", true).as_deref(), Some("从头到尾的过一遍"));
    }

    #[test]
    fn prefix_extension_skipped_when_disabled() {
        // Arrange：allow_extension=false（策略禁用）——保留流式结果
        // Act/Assert：拒绝扩展（保留流式结果），原 40% 门限也不通过
        // @ai-context: 2026-08-19 取优整合后生产路径恒传 true（rule3 段也补尾字，
        //              跨段重复由 F3-2 去重 + F4-1 合并重叠跳过防护）；本用例
        //              验证策略开关本身有效（未来收紧时可回退）
        assert_eq!(pick_rescored_with("那今天晚上我", "那今天晚上我会用三个阶段来做分享", false), None);
    }

    #[test]
    fn prefix_extension_capped_against_hallucination() {
        // Arrange：SenseVoice 幻觉续写超上限（扩展 > max(8, zip_len)）
        // zip_len=2 → 上限 8；扩展 9 字 → 拒绝
        assert_eq!(pick_rescored_with("结果", "结果一二三四五六七八九", true), None);
    }

    #[test]
    fn prefix_extension_accepts_extension_up_to_cap() {
        // 扩展恰好等于上限（zip_len=2 → 8）→ 接受（真实句尾短语场景）
        assert_eq!(
            pick_rescored_with("从头", "从头到尾的过一遍", true).as_deref(),
            Some("从头到尾的过一遍")
        );
    }

    #[test]
    fn prefix_extension_allows_large_zip_with_moderate_extension() {
        // Arrange：长句 + 中等扩展（zip_len=10 → 上限 10；扩展 3 字）→ 接受
        assert_eq!(
            pick_rescored_with("读书也是学习对吧听", "读书也是学习对吧听别人分享也是学习", true).as_deref(),
            Some("读书也是学习对吧听别人分享也是学习")
        );
    }

    #[test]
    fn equal_texts_accepted() {
        // 完全一致 → SenseVoice（无变化替换，保持原行为）
        assert_eq!(pick_rescored_with("熵减的概念", "熵减的概念", true).as_deref(), Some("熵减的概念"));
    }

    // ── 短句放宽 ──

    #[test]
    fn short_sentence_one_edit_accepted() {
        // Arrange：2 字句 1 字差异（流式"物理" vs SenseVoice"无理"）——原 40% 门限
        // 拒绝（1/2=50%>40%），短句放宽后接受
        assert_eq!(pick_rescored_with("物理", "无理", true).as_deref(), Some("无理"));
    }

    #[test]
    fn short_sentence_two_edits_rejected() {
        // 2 字句 2 字全异 → 拒绝（短句放宽上限 1 字）
        assert_eq!(pick_rescored_with("好的", "可以", true), None);
    }

    // ── 原规则保留 ──

    #[test]
    fn long_sentence_small_diff_still_accepted() {
        // 长句微差异（1/20=5% ≤ 40%）→ 接受（原行为）
        assert_eq!(
            pick_rescored_with("今天讲熵减的概念和原理", "今天讲熵减的概念和原理了", true).as_deref(),
            Some("今天讲熵减的概念和原理了")
        );
    }

    #[test]
    fn far_texts_rejected() {
        // 语义差异大 → 保留 Zipformer（原行为）
        assert_eq!(pick_rescored_with("今天讲牛顿定律", "明天考试加油", true), None);
    }

    #[test]
    fn empty_inputs_rejected() {
        assert_eq!(pick_rescored_with("", "有内容", true), None);
        assert_eq!(pick_rescored_with("有内容", "", true), None);
        assert_eq!(pick_rescored_with("", "", true), None);
    }

    #[test]
    fn punctuation_does_not_block_consistency() {
        // SenseVoice 带标点而 Zipformer 无标点：去标点比较后一致（距离 0）→ 接受
        assert_eq!(pick_rescored_with("熵减", "熵减。", true).as_deref(), Some("熵减。"));
    }

    #[test]
    fn levenshtein_basics() {
        assert_eq!(levenshtein("今天讲熵减", "今天讲熵减"), 0);
        assert_eq!(levenshtein("熵减", "熵减概念"), 2);
        assert_eq!(levenshtein("物理", "无理"), 1);
        assert_eq!(levenshtein("", "abc"), 3);
    }

    #[test]
    fn strip_punct_removes_chinese_and_ascii() {
        assert_eq!(strip_punct("你好，世界！Hello, world!"), vec!['你', '好', '世', '界', 'H', 'e', 'l', 'l', 'o', 'w', 'o', 'r', 'l', 'd']);
        assert_eq!(strip_punct("  空白  "), vec!['空', '白']);
    }

    // ── REQ-098 一致性置信度（v0.7.0 M1）──

    #[test]
    fn consistency_identical_texts_full_confidence() {
        // 双源完全一致（去标点后）→ 置信度 1.0
        assert_eq!(consistency_confidence("熵减的概念", "熵减的概念").unwrap(), 1.0);
    }

    #[test]
    fn consistency_small_diff_high_confidence() {
        // 1 字差异 / 6 字 → 1 - 1/6 ≈ 0.833
        let c = consistency_confidence("今天讲熵减", "今天讲熵减了").unwrap();
        assert!((c - 0.8333).abs() < 0.01, "got {}", c);
    }

    #[test]
    fn consistency_far_texts_low_confidence() {
        // 语义完全无关 → 低置信（距离接近 max_len）
        let c = consistency_confidence("今天讲牛顿定律", "明天考试加油").unwrap();
        assert!(c < 0.5, "got {}", c);
    }

    #[test]
    fn consistency_empty_inputs_is_none() {
        // 空输入无法产出置信度 → None（诚实未知，不硬编码假值）
        assert_eq!(consistency_confidence("", "有内容"), None);
        assert_eq!(consistency_confidence("有内容", ""), None);
        assert_eq!(consistency_confidence("", ""), None);
    }

    #[test]
    fn consistency_punctuation_ignored() {
        // 标点差异不计入距离（与决策层 strip_punct 同口径）
        assert_eq!(consistency_confidence("熵减。", "熵减").unwrap(), 1.0);
    }
}
