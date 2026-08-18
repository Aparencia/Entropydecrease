//! 术语表自动构建（REQ-046 / v0.5.0 M2，头脑风暴 C3；v0.6.0 M1 REQ-061 精化）。
//!
//! @ai-context: 网课档案支撑——OCR 高频词 × ASR 低频词交叉出术语候选：
//!              画面反复出现的生僻词（板书/课件）在语音中少出现 → 用户大概率
//!              不认识 → 术语候选 → 用户确认后反哺 hotwords（复用 REQ-040 词表）。
//! @ai-context: REQ-061 精化（v0.6.0）：① TF-IDF 文档权重（跨会话文档频率降通用词，
//!              调用方传 df/total_docs；缺省退化为单会话计数=现状行为零回归）；
//!              ② 缩略词模式（全大写序列 SGD/CNN、字母数字混合 ResNet50/B2B）
//!              独立低阈值召回；③ 水印词排除（REQ-059 输出，角标台标词不进候选）。
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
    /// 精化候选分（REQ-061：ocr_count × idf；无 df 时 = ocr_count，零回归）
    pub score: f32,
}

/// 术语发现精化选项（REQ-061）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GlossaryOptions {
    /// 水印词排除表（REQ-059 输出；精确匹配排除）
    pub watermark_exclude: Vec<String>,
    /// 跨会话文档频率（term → 包含该 term 的文档数；None = 单会话退化）
    pub df: Option<HashMap<String, usize>>,
    /// 文档总数（df 生效时需 ≥1；idf = ln((1+total)/(1+df)) + 1）
    pub total_docs: usize,
    /// 缩略词最低 OCR 次数（低阈值召回，默认 2）
    pub acronym_min_ocr: usize,
    /// 缩略词 ASR 上限（默认 1）
    pub acronym_max_asr: usize,
}

impl GlossaryOptions {
    fn acronym_thresholds(&self) -> (usize, usize) {
        let min = if self.acronym_min_ocr == 0 { 2 } else { self.acronym_min_ocr };
        let max = if self.acronym_max_asr == 0 { 1 } else { self.acronym_max_asr };
        (min, max)
    }
}

/// 术语候选检测（纯函数，向后兼容入口）：OCR 高频 × ASR 低频交叉。
///
/// @ai-context: 等价于 glossary_candidates_opt(..., &GlossaryOptions::default())
///              ——v0.5.0 行为零回归（无 df、无水印排除、缩略词低阈值生效）。
/// @ai-context: 分析编排层已切精化入口（glossary_candidates_opt）；本入口保留
///              供测试与外部调用方，登记豁免 dead_code。
#[allow(dead_code)]
pub fn glossary_candidates(
    ocr_texts: &[&str],
    asr_texts: &[&str],
    ocr_min: usize,
    asr_max: usize,
) -> Vec<GlossaryCandidate> {
    glossary_candidates_opt(ocr_texts, asr_texts, ocr_min, asr_max, &GlossaryOptions::default())
}

/// 术语候选检测（精化版）：阈值交叉 + TF-IDF 加权 + 水印排除 + 缩略词召回。
///
/// @ai-context: 普通候选：非缩略词 token，OCR ≥ ocr_min × ASR ≤ asr_max；
///              缩略词候选：独立低阈值（acronym_min_ocr × acronym_max_asr）；
///              两者都按 score 降序输出（score = ocr_count × idf）。
pub fn glossary_candidates_opt(
    ocr_texts: &[&str],
    asr_texts: &[&str],
    ocr_min: usize,
    asr_max: usize,
    opts: &GlossaryOptions,
) -> Vec<GlossaryCandidate> {
    let ocr = count_tokens(ocr_texts);
    let asr_freq = count_tokens(asr_texts).freq;
    let (acr_min, acr_max) = opts.acronym_thresholds();
    let excluded = |term: &str| opts.watermark_exclude.iter().any(|w| w == term);
    let idf = |term: &str| -> f32 {
        match &opts.df {
            Some(df) if opts.total_docs > 0 => {
                let d = df.get(term).copied().unwrap_or(0);
                ((1.0 + opts.total_docs as f32) / (1.0 + d as f32)).ln() + 1.0
            }
            _ => 1.0,
        }
    };

    let mut out: Vec<GlossaryCandidate> = Vec::new();
    // 普通候选（非缩略词 token）
    for (term, ocr_count) in &ocr.freq {
        if excluded(term) || is_acronym(term) {
            continue;
        }
        let asr_count = asr_freq.get(term).copied().unwrap_or(0);
        if *ocr_count >= ocr_min && asr_count <= asr_max {
            out.push(GlossaryCandidate {
                term: term.clone(),
                ocr_count: *ocr_count,
                asr_count,
                score: *ocr_count as f32 * idf(term),
            });
        }
    }
    // 缩略词候选（低阈值召回："SGD/CNN/ResNet50" 等）
    for (term, ocr_count) in &ocr.acronyms {
        if excluded(term) {
            continue;
        }
        let asr_count = asr_freq.get(term).copied().unwrap_or(0);
        if *ocr_count >= acr_min && asr_count <= acr_max {
            out.push(GlossaryCandidate {
                term: term.clone(),
                ocr_count: *ocr_count,
                asr_count,
                score: *ocr_count as f32 * idf(term),
            });
        }
    }
    // 确定性排序：score 降序 → 长度降序 → 字典序（HashMap 迭代序随机）
    out.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.term.chars().count().cmp(&a.term.chars().count()))
            .then_with(|| a.term.cmp(&b.term))
    });
    out
}

/// 停用词（常见虚词/口语词，过滤噪声 gram）。
const STOP_WORDS: &[&str] = &[
    "这个", "那个", "我们", "你们", "他们", "一个", "没有", "什么", "怎么", "这样", "那样",
    "可以", "就是", "因为", "所以", "但是", "如果", "然后", "现在", "今天", "大家", "老师",
    "同学", "时候", "一下", "一些", "这里", "那里", "自己", "知道", "觉得", "认为",
];

/// 分词计数结果（普通词频 + 缩略词频，两者独立统计）。
#[derive(Default)]
struct TokenCounts {
    freq: HashMap<String, usize>,
    acronyms: HashMap<String, usize>,
}

/// 分词并计数（CJK 连续段 2-4 字滑窗 + ASCII 词；停用词/纯数字过滤）。
///
/// @ai-context: 滑窗只作用于 CJK 连续段（与 vocab::split_runs 同思路）——ASCII 词
///              若被滑窗也会切出 "Bet"/"eta" 等噪声 gram 且与整词重复计数。
/// @ai-context: REQ-061：ASCII 词 ≥3 字符计数；缩略词（全大写/字母数字混合）
///              ≥2 字符独立计数（"3D/B2B" 等短缩略词召回）。
fn count_tokens(texts: &[&str]) -> TokenCounts {
    let mut out = TokenCounts::default();
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
                        *out.freq.entry(token).or_insert(0) += 1;
                    }
                }
            }
        }
        // ASCII 词（≥3 字符；缩略词 ≥2 字符）
        for word in text.split(|c: char| !c.is_ascii_alphanumeric()) {
            let n = word.chars().count();
            let word_acronym = is_acronym(word);
            if (n >= 3 && is_valid(word)) || (word_acronym && n >= 2) {
                *out.freq.entry(word.to_string()).or_insert(0) += 1;
                if word_acronym {
                    *out.acronyms.entry(word.to_string()).or_insert(0) += 1;
                }
            }
        }
    }
    out
}

/// 文档频率统计用分词（REQ-061）：与 count_tokens 同口径的 token 列表。
///
/// @ai-context: 分析编排层用"文档 = 单条 OCR 块"做会话内 TF-IDF 代理——
///              df 键必须与候选 term 完全一致（同一分词口径），否则 idf 失效。
pub fn tokens_of(text: &str) -> Vec<String> {
    let mut out = Vec::new();
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
                    out.push(token);
                }
            }
        }
    }
    // ASCII 词（≥3 字符；缩略词 ≥2 字符）
    for word in text.split(|c: char| !c.is_ascii_alphanumeric()) {
        let n = word.chars().count();
        if (n >= 3 && is_valid(word)) || (is_acronym(word) && n >= 2) {
            out.push(word.to_string());
        }
    }
    out
}

/// 缩略词判定（REQ-061）：全大写序列（SGD/CNN）或字母数字混合（ResNet50/B2B/3D）。
///
/// @ai-context: 混合大小写普通词（Gradient/Alpha）不算缩略词——走常规阈值；
///              纯数字（12345）不算（is_valid 已排除纯数字）。
fn is_acronym(token: &str) -> bool {
    let n = token.chars().count();
    if !(2..=12).contains(&n) {
        return false;
    }
    let has_letter = token.chars().any(|c| c.is_ascii_alphabetic());
    if !has_letter {
        return false;
    }
    let has_digit = token.chars().any(|c| c.is_ascii_digit());
    let all_upper = token.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());
    all_upper || has_digit
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
