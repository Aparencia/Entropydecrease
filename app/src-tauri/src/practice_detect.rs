//! 练习段识别（REQ-070 / v0.6.0 M4，F3）。
//!
//! @ai-context: 长静音 × 画面静止 同窗命中 → 练习点（老师停下让学生动手练）。
//!              课后精修路径（analysis.rs 编排）输入为 SessionDetail——
//!              实时信号未落库，用近似替代：段间 gap ≥ 阈值 = 长静音近似
//!              （与章节检测同口径），OCR 文本窗口内无新增 = 画面静止近似。
//! @ai-context: 实操档案产物模板消费（StepCard 之间插入"练习点"标记，M7）；
//!              误判（视频卡顿）由阈值校准——静音 + 静止**双条件同窗**才判定
//!              （单条件不判：卡顿通常有声音或画面变化）。
//! @ai-context: 纯函数可单测（合成静音+静止样本；误判保护样本）。

use crate::types::{SessionOcrBlock, SessionSegment};

/// 练习点（时间窗 + 静音时长）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PracticePoint {
    /// 练习窗起点（ms；相对会话起点）
    pub start_ms: u64,
    /// 练习窗终点（ms）
    pub end_ms: u64,
    /// 窗内长静音近似（段间 gap）时长（秒）
    pub silence_secs: u64,
}

/// 练习检测配置。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PracticeDetectConfig {
    /// 聚合窗口（ms；30s 与章节检测同粒度）
    pub window_ms: u64,
    /// 长静音 gap 阈值（ms；段间间隔 ≥ 该值视为静音）
    pub silence_gap_ms: u64,
    /// 窗口内最长静音（ms）下限——总静音不足不判
    pub min_silence_ms: u64,
}

impl Default for PracticeDetectConfig {
    fn default() -> Self {
        Self {
            window_ms: 30_000,
            silence_gap_ms: 3_000,
            min_silence_ms: 6_000,
        }
    }
}

/// 练习段检测（纯函数）：长静音 × 画面静止 同窗命中 → 练习点。
///
/// @ai-context: 窗口聚合（按段起始时间分组）：窗内段间 gap 累计 ≥ min_silence
///              且窗内 OCR 文本**无变化**（集合 ≤1 种 = 画面静止近似——
///              练习页停住不动；讲解窗画面持续变化不判）→ 练习点（窗内首段时刻）。
///              首窗同样适用（窗内无变化即静止——不需前窗基准，防开场卡顿
///              由"首窗有讲解变化"自然排除）。
pub fn detect_practice_points(
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    config: &PracticeDetectConfig,
) -> Vec<PracticePoint> {
    if segments.is_empty() {
        return Vec::new();
    }
    // ① 按窗口聚合段（30s 窗）
    #[derive(Default)]
    struct Win {
        start: u64,
        end: u64,
        silence_ms: u64,
        prev_end: Option<u64>,
        ocr_seen: std::collections::HashSet<String>,
    }
    let mut windows: Vec<Win> = Vec::new();
    let mut cur = Win::default();
    let mut cur_start = segments[0].start_ms / config.window_ms * config.window_ms;
    let mut seg_iter = segments.iter().peekable();
    let mut ocr_iter = ocr_blocks.iter().filter(|b| b.region == "full").peekable();
    loop {
        let next_ms = match (seg_iter.peek(), ocr_iter.peek()) {
            (Some(s), Some(o)) => s.start_ms.min(o.timestamp_ms),
            (Some(s), None) => s.start_ms,
            (None, Some(o)) => o.timestamp_ms,
            (None, None) => break,
        };
        if next_ms >= cur_start + config.window_ms {
            windows.push(std::mem::take(&mut cur));
            cur_start = next_ms / config.window_ms * config.window_ms;
        }
        let take_seg = match (seg_iter.peek(), ocr_iter.peek()) {
            (Some(s), Some(o)) => s.start_ms <= o.timestamp_ms,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (None, None) => false,
        };
        if take_seg {
            let s = seg_iter.next().unwrap();
            if let Some(pe) = cur.prev_end {
                let gap = s.start_ms.saturating_sub(pe);
                if gap >= config.silence_gap_ms {
                    cur.silence_ms += gap;
                }
            }
            cur.prev_end = Some(s.end_ms);
            // 窗内首段时刻 = 练习点近似起点（0 值合法——首个窗首段恰在 0ms）
            if cur.start == 0 {
                cur.start = s.start_ms;
            }
            cur.end = s.end_ms;
        } else {
            let o = ocr_iter.next().unwrap();
            let t = o.text.trim().to_string();
            if !t.is_empty() {
                cur.ocr_seen.insert(t);
            }
        }
    }
    windows.push(cur);

    // ② 判定：静音 ≥ min_silence 且画面静止（窗内 OCR 文本 ≤1 种）→ 练习点
    let mut points = Vec::new();
    for w in &windows {
        let silent = w.silence_ms >= config.min_silence_ms;
        let still = w.ocr_seen.len() <= 1 && !w.ocr_seen.is_empty();
        if silent && still {
            points.push(PracticePoint {
                start_ms: w.start,
                end_ms: w.end,
                silence_secs: w.silence_ms / 1000,
            });
        }
    }
    points
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "practice_detect_tests.rs"]
mod tests;
