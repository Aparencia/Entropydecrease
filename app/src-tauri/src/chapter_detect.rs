//! 章节检测（REQ-044 / v0.5.0 M2，头脑风暴 C1：三信号投票）。
//!
//! @ai-context: 网课档案支撑机制——三信号（画面切换 / 长静音 / n-gram 话题重合度下降）
//!              同刻投票 → 章节边界；信号全部来自管线现状（帧 diff / VAD / ASR 文本）。
//! @ai-context: 纯函数无 IO：输入为按时间排序的信号样本，输出章节边界列表，
//!              投票阈值可调（min_votes=2 默认：≥2 信号同刻命中才判定边界）。
//! @ai-context: 边界处由产物层（M7）自动插"本章小结"占位；本模块只产出边界。

use std::collections::HashSet;

/// 单个时间窗口的信号样本（由编排层从会话数据聚合）。
#[derive(Debug, Clone, PartialEq)]
pub struct ChapterSignal {
    /// 窗口起始时间（相对会话起点，ms）
    pub time_ms: u64,
    /// 窗口内是否发生画面切换（帧 diff 事件）
    pub frame_switched: bool,
    /// 窗口内是否出现长静音（VAD 信号）
    pub long_silence: bool,
    /// 窗口文本（ASR 段文本拼接；n-gram 话题重合度输入）
    pub text: String,
}

/// 检测出的章节边界。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ChapterBoundary {
    /// 边界时刻（ms）
    pub time_ms: u64,
    /// 命中信号数（2=双信号，3=三信号）
    pub votes: u32,
    /// 话题重合度下降幅度（0.0-1.0；越大话题切换越明显）
    pub topic_drop: f32,
}

/// 默认阈值：≥2 信号同刻命中判定边界（单信号噪声大，双信号稳妥）。
pub const DEFAULT_MIN_VOTES: u32 = 2;
/// 相邻边界最小间隔（ms）：连续命中窗口视为同一章节过渡，取首个（时间最早）。
const BOUNDARY_MIN_GAP_MS: u64 = 10_000;
/// 话题相似度下降超过该值视为话题切换（n-gram Jaccard 差）。
const TOPIC_DROP_THRESHOLD: f32 = 0.35;
/// n-gram 长度（2-3 字滑窗对中文话题词敏感）。
const NGRAM_MIN: usize = 2;
const NGRAM_MAX: usize = 3;

/// 章节检测（纯函数）：对按时间排序的信号窗口做三信号投票。
///
/// @ai-context: 相邻窗口话题重合度 = n-gram Jaccard 相似度；当前窗口与前一窗口
///              相似度低于阈值 → 话题切换信号（topic_switched）。
/// @ai-context: 三信号（frame_switched/long_silence/topic_switched）计数 ≥ min_votes
///              → 章节边界。连续命中窗口（间隔 < BOUNDARY_MIN_GAP_MS）合并取首个，
///              避免一次章节过渡产生多重边界。
pub fn detect_chapters(signals: &[ChapterSignal], min_votes: u32) -> Vec<ChapterBoundary> {
    let min_votes = min_votes.max(1);
    let mut boundaries = Vec::new();
    let mut prev_ngrams: Option<HashSet<String>> = None;
    let mut prev_boundary_ms: Option<u64> = None;

    for sig in signals {
        let ngrams = extract_ngrams(&sig.text);
        // 话题切换信号：与前一窗口的 Jaccard 相似度骤降
        let topic_switched = match &prev_ngrams {
            Some(prev) => {
                let sim = jaccard(prev, &ngrams);
                sim < 1.0 - TOPIC_DROP_THRESHOLD
            }
            None => false,
        };
        prev_ngrams = if ngrams.is_empty() { prev_ngrams } else { Some(ngrams) };

        let votes = [sig.frame_switched, sig.long_silence, topic_switched]
            .iter()
            .filter(|v| **v)
            .count() as u32;
        if votes >= min_votes {
            // 相邻窗口去重：与上一边界间隔 ≥ BOUNDARY_MIN_GAP_MS 才算新边界
            let is_new = prev_boundary_ms
                .is_none_or(|t| sig.time_ms.saturating_sub(t) >= BOUNDARY_MIN_GAP_MS);
            if is_new {
                boundaries.push(ChapterBoundary {
                    time_ms: sig.time_ms,
                    votes,
                    topic_drop: 0.0, // 占位：编排层可回填精确幅度（纯函数不保留历史）
                });
                prev_boundary_ms = Some(sig.time_ms);
            }
        }
    }
    boundaries
}

/// 提取文本 n-gram 集合（2-3 字滑窗 + ASCII 词；空文本返回空集）。
///
/// @ai-context: 中文无空格，n-gram 滑窗是话题重合度近似（与 vocab 分词同思路）；
///              纯函数，供 jaccard 相似度计算使用。
pub fn extract_ngrams(text: &str) -> HashSet<String> {
    let mut grams = HashSet::new();
    let chars: Vec<char> = text.chars().collect();
    for len in NGRAM_MIN..=NGRAM_MAX {
        if chars.len() < len {
            break;
        }
        for start in 0..=(chars.len() - len) {
            let g: String = chars[start..start + len].iter().collect();
            grams.insert(g);
        }
    }
    // ASCII 词（≥3 字符）也作为 gram（代码/英文术语话题）
    for word in text.split(|c: char| !c.is_ascii_alphanumeric()) {
        if word.chars().count() >= 3 {
            grams.insert(word.to_string());
        }
    }
    grams
}

/// 两个 n-gram 集合的 Jaccard 相似度（空集对返回 0）。
fn jaccard(a: &HashSet<String>, b: &HashSet<String>) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(b).count();
    let union = a.union(b).count();
    inter as f32 / union as f32
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "chapter_detect_tests.rs"]
mod tests;
