//! 术语表自动构建（REQ-046 / v0.5.0 M2，头脑风暴 C3）。
//!
//! @ai-context: 网课档案支撑——OCR 高频词 × ASR 低频词交叉出术语候选：
//!              画面反复出现的生僻词（板书/课件）在语音中少出现 → 用户大概率
//!              不认识 → 术语候选 → 用户确认后反哺 hotwords（复用 REQ-040 词表）。
//! @ai-context: 纯函数可单测；候选只是"提名人"，加入词表需用户确认
//!              （OCR 误识别词不得自动进热词——与 vocab 建议同语义）。

use std::collections::HashMap;

/// 术语候选。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct GlossaryCandidate {
    pub term: String,
    /// OCR 出现次数（画面高频）
    pub ocr_count: usize,
    /// ASR 出现次数（语音低频）
    pub asr_count: usize,
}

/// 术语候选检测（纯函数）：OCR 高频（≥ocr_min）× ASR 低频（≤asr_max）交叉。
///
/// @ai-context: OCR 文本与 ASR 文本均为逐条输入；分词用 2-4 字 CJK 滑窗 + ASCII 词
///              （与 vocab::collect_tokens 同思路，此处独立实现保持模块内聚）。
/// @ai-context: 输出按 OCR 频率降序（画面越常出现越可能是重要术语）。
pub fn glossary_candidates(
    ocr_texts: &[&str],
    asr_texts: &[&str],
    ocr_min: usize,
    asr_max: usize,
) -> Vec<GlossaryCandidate> {
    let ocr_freq = count_tokens(ocr_texts);
    let asr_freq = count_tokens(asr_texts);
    let mut out: Vec<GlossaryCandidate> = ocr_freq
        .into_iter()
        .filter_map(|(term, ocr_count)| {
            let asr_count = asr_freq.get(&term).copied().unwrap_or(0);
            if ocr_count >= ocr_min && asr_count <= asr_max {
                Some(GlossaryCandidate { term, ocr_count, asr_count })
            } else {
                None
            }
        })
        .collect();
    // OCR 频率降序 → 长度降序 → 字典序（确定性排序，HashMap 迭代序随机）
    out.sort_by_key(|c| {
        (
            std::cmp::Reverse(c.ocr_count),
            std::cmp::Reverse(c.term.chars().count()),
            c.term.clone(),
        )
    });
    out
}

/// 停用词（常见虚词/口语词，过滤噪声 gram）。
const STOP_WORDS: &[&str] = &[
    "这个", "那个", "我们", "你们", "他们", "一个", "没有", "什么", "怎么", "这样", "那样",
    "可以", "就是", "因为", "所以", "但是", "如果", "然后", "现在", "今天", "大家", "老师",
    "同学", "时候", "一下", "一些", "这里", "那里", "自己", "知道", "觉得", "认为",
];

/// 分词并计数（CJK 连续段 2-4 字滑窗 + ASCII 词 ≥3 字符；停用词/纯数字过滤）。
///
/// @ai-context: 滑窗只作用于 CJK 连续段（与 vocab::split_runs 同思路）——ASCII 词
///              若被滑窗也会切出 "Bet"/"eta" 等噪声 gram 且与整词重复计数。
fn count_tokens(texts: &[&str]) -> HashMap<String, usize> {
    let mut freq: HashMap<String, usize> = HashMap::new();
    for text in texts {
        let chars: Vec<char> = text.chars().collect();
        // CJK 连续段：2-4 字滑窗
        let mut i = 0;
        while i < chars.len() {
            if !is_cjk(chars[i]) {
                i += 1;
                continue;
            }
            let start = i;
            while i < chars.len() && is_cjk(chars[i]) {
                i += 1;
            }
            let run: Vec<char> = chars[start..i].to_vec();
            for len in 2..=4 {
                if run.len() < len {
                    break;
                }
                for s in 0..=(run.len() - len) {
                    let token: String = run[s..s + len].iter().collect();
                    if is_valid(&token) {
                        *freq.entry(token).or_insert(0) += 1;
                    }
                }
            }
        }
        // ASCII 词（≥3 字符，独立计数）
        for word in text.split(|c: char| !c.is_ascii_alphanumeric()) {
            if word.chars().count() >= 3 && is_valid(word) {
                *freq.entry(word.to_string()).or_insert(0) += 1;
            }
        }
    }
    freq
}

/// CJK 统一表意文字区段（含扩展 A）。
fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x4E00..=0x9FFF).contains(&u) || (0x3400..=0x4DBF).contains(&u)
}

/// 候选合法性：非停用词、非纯数字、含 CJK 或 ASCII 字母。
fn is_valid(token: &str) -> bool {
    if STOP_WORDS.contains(&token) {
        return false;
    }
    if token.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    token.chars().any(|c| c.is_alphabetic())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "glossary_tests.rs"]
mod tests;
