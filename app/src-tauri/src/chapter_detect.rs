//! 章节检测（REQ-044 / v0.5.0 M2，头脑风暴 C1：三信号投票；
//! v0.6.0 M2 REQ-064 时序状态机平滑）。
//!
//! @ai-context: 网课档案支撑机制——三信号（画面切换 / 长静音 / n-gram 话题重合度下降）
//!              同刻投票 → 章节边界；信号全部来自管线现状（帧 diff / VAD / ASR 文本）。
//! @ai-context: REQ-064 升级：硬决策 → 时序状态机（章节内 → 边界候选 → 确认 →
//!              最短章节时长抑制）。抖动抑制：候选需在确认窗口内再次命中
//!              （默认关闭=单窗口确认，v0.5.0 行为零回归；严格档供校准）；
//!              边界抑制：确认后 min_chapter_ms 内不再产新边界（防误切抖动）。
//! @ai-context: 纯函数无 IO；输出仍为 ChapterBoundary 事件（下游零改动）；
//!              边界处由产物层（M7）自动插"本章小结"占位。

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
    /// 话题重合度下降幅度（0.0-1.0；越大话题切换越明显；无话题依据时 0.0）
    pub topic_drop: f32,
}

/// 章节检测配置（REQ-064 状态机参数）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ChapterDetectConfig {
    /// 候选确认需在候选窗口内再次命中（默认 false=单窗口确认，v0.5.0 行为）
    pub confirm_requires_repeat: bool,
    /// 候选确认窗口（ms）：候选后该窗口内再次命中才确认
    pub candidate_window_ms: u64,
    /// 最短章节时长（ms）：边界确认后该时长内不再产新边界（误切抑制）
    pub min_chapter_ms: u64,
}

impl Default for ChapterDetectConfig {
    fn default() -> Self {
        Self {
            confirm_requires_repeat: false,
            candidate_window_ms: 30_000,
            // 与 v0.5.0 BOUNDARY_MIN_GAP_MS 同值——相邻边界最小间隔语义不变
            min_chapter_ms: 10_000,
        }
    }
}

/// 默认阈值：≥2 信号同刻命中判定边界（单信号噪声大，双信号稳妥）。
pub const DEFAULT_MIN_VOTES: u32 = 2;
/// 话题相似度下降超过该值视为话题切换（n-gram Jaccard 差）。
const TOPIC_DROP_THRESHOLD: f32 = 0.35;
/// n-gram 长度（2-3 字滑窗对中文话题词敏感）。
const NGRAM_MIN: usize = 2;
const NGRAM_MAX: usize = 3;

/// 状态机内部状态。
enum State {
    /// 章节内（无候选）
    InChapter,
    /// 边界候选（等待确认窗口内再次命中）
    Candidate { time_ms: u64, votes: u32, topic_drop: f32 },
    /// 边界抑制期（最短章节时长内不产新边界）
    Inhibit { until_ms: u64 },
}

/// 章节检测（纯函数，默认配置）：对按时间排序的信号窗口做三信号投票 + 状态机平滑。
pub fn detect_chapters(signals: &[ChapterSignal], min_votes: u32) -> Vec<ChapterBoundary> {
    detect_chapters_with(signals, min_votes, &ChapterDetectConfig::default())
}

/// 章节检测（可配置版本，REQ-064）。
///
/// @ai-context: 每窗口：话题切换信号（与前一窗口 Jaccard 相似度骤降）+
///              三信号计数 → 状态迁移：
///              InChapter --votes≥min--> Candidate --窗口内再命中--> 确认+Inhibit；
///              Candidate --超窗未再命中--> 回 InChapter（过期不确认）；
///              Inhibit 期内一切命中忽略（最短章节时长先验）。
pub fn detect_chapters_with(
    signals: &[ChapterSignal],
    min_votes: u32,
    config: &ChapterDetectConfig,
) -> Vec<ChapterBoundary> {
    let min_votes = min_votes.max(1);
    let mut boundaries = Vec::new();
    let mut prev_ngrams: Option<HashSet<String>> = None;
    let mut state = State::InChapter;

    for sig in signals {
        let ngrams = extract_ngrams(&sig.text);
        // 话题切换信号与下降幅度：与前一窗口的 Jaccard 相似度骤降
        let (topic_switched, topic_drop) = match &prev_ngrams {
            Some(prev) => {
                let sim = jaccard(prev, &ngrams);
                (sim < 1.0 - TOPIC_DROP_THRESHOLD, (1.0 - sim).clamp(0.0, 1.0))
            }
            None => (false, 0.0),
        };
        prev_ngrams = if ngrams.is_empty() { prev_ngrams } else { Some(ngrams) };

        let votes = [sig.frame_switched, sig.long_silence, topic_switched]
            .iter()
            .filter(|v| **v)
            .count() as u32;
        let hit = votes >= min_votes;

        // 状态迁移（REQ-064）
        match state {
            State::InChapter => {
                if hit {
                    if config.confirm_requires_repeat {
                        // 严格档：先入候选（等待窗口内再次命中）
                        state = State::Candidate { time_ms: sig.time_ms, votes, topic_drop };
                    } else {
                        // 默认档：单窗口确认（v0.5.0 行为零回归）
                        boundaries.push(ChapterBoundary { time_ms: sig.time_ms, votes, topic_drop });
                        state = State::Inhibit { until_ms: sig.time_ms + config.min_chapter_ms };
                    }
                }
            }
            State::Candidate { time_ms: cand_ms, votes: cand_votes, topic_drop: cand_drop } => {
                let in_window = sig.time_ms.saturating_sub(cand_ms) < config.candidate_window_ms;
                if hit && in_window {
                    // 抖动抑制：窗口内再次命中才确认
                    boundaries.push(ChapterBoundary {
                        time_ms: cand_ms,
                        votes: cand_votes.max(votes),
                        topic_drop: cand_drop,
                    });
                    state = State::Inhibit { until_ms: sig.time_ms + config.min_chapter_ms };
                } else if !in_window {
                    // 候选过期：当前窗口命中则重新进入候选，否则回章节内
                    state = if hit {
                        State::Candidate { time_ms: sig.time_ms, votes, topic_drop }
                    } else {
                        State::InChapter
                    };
                }
                // 窗口内未命中 → 保持候选等待
            }
            State::Inhibit { until_ms } => {
                // 边界抑制：最短章节时长内不产新边界（误切抖动抑制）
                if sig.time_ms >= until_ms {
                    state = if hit {
                        State::Candidate { time_ms: sig.time_ms, votes, topic_drop }
                    } else {
                        State::InChapter
                    };
                }
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
