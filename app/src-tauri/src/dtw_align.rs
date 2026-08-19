//! DTW 时序对齐（REQ-063 / v0.6.0 M2）。
//!
//! @ai-context: 字幕 OCR 流与 ASR 流的时间轴存在漂移（OCR 帧间隔导致字幕
//!              end_ms 滞后、窗口捕获延迟导致整体偏移）——用文本序列 DTW
//!              对齐建立"字幕段 ↔ ASR 段"对应，再按成对时间差中位数估计
//!              漂移并回校字幕时间戳。
//! @ai-context: **spike 状态**：规划要求"采集真实会话实测漂移分布，有收益才
//!              接入"。真实数据源（S4 音频落盘）在 M4——本模块机制先行 +
//!              合成漂移样本验证正确率；真机校准结论待 M4 落盘后补记，
//!              当前不接入生产融合链路（无实测收益不改变行为）。
//! @ai-context: 纯函数无 IO；局限：标准 DTW 首尾强制对齐（字幕延迟出现时
//!              首段对应失真），漂移估计用中位数抗离群。
//!
//! #![allow(dead_code)]：**spike 预留**（REQ-063 M4 真机校准落盘后接入生产链路；
//! 当前无 lib 调用者，仅合成样本测试验证正确率——M4 前不删除，见模块头注释）。

#![allow(dead_code)]

use crate::fusion::SubtitleSegment;
use crate::streaming_asr::levenshtein;
use crate::types::TranscriptSegment;

/// 对齐结果：字幕段索引 ↔ ASR 段索引 的对应路径 + 累计代价。
#[derive(Debug, Clone, PartialEq)]
pub struct Alignment {
    pub pairs: Vec<(usize, usize)>,
    /// 累计代价（文本距离和；越小越相似）
    pub cost: f32,
}

/// 文本相似度（归一化编辑距离）：1 = 完全一致，0 = 完全无关。
fn text_similarity(a: &str, b: &str) -> f32 {
    let max_len = a.chars().count().max(b.chars().count());
    if max_len == 0 {
        return 1.0;
    }
    1.0 - levenshtein(a, b) as f32 / max_len as f32
}

/// DTW 对齐（纯函数）：字幕流 × ASR 流 → 最小代价路径。
///
/// @ai-context: 成本矩阵 = 1 - 文本相似度；DP 累积最小代价 + 回溯路径；
///              空输入 → 空对齐；首尾强制对齐（标准 DTW）。
pub fn align_sequences(
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
) -> Alignment {
    let n = subtitles.len();
    let m = asr_segments.len();
    if n == 0 || m == 0 {
        return Alignment { pairs: Vec::new(), cost: 0.0 };
    }
    // 成本矩阵（f32）
    let mut cost = vec![vec![0.0f32; m]; n];
    for (i, sub) in subtitles.iter().enumerate() {
        for (j, asr) in asr_segments.iter().enumerate() {
            cost[i][j] = 1.0 - text_similarity(&sub.text, &asr.text);
        }
    }
    // DP 累积（第一行/列前缀和，其余取左上/上/左最小）
    let mut dp = cost.clone();
    for j in 1..m {
        dp[0][j] += dp[0][j - 1];
    }
    for i in 1..n {
        dp[i][0] += dp[i - 1][0];
    }
    for i in 1..n {
        for j in 1..m {
            dp[i][j] += dp[i - 1][j - 1].min(dp[i - 1][j]).min(dp[i][j - 1]);
        }
    }
    // 回溯（从右下到左上；优先对角）
    let mut pairs = Vec::with_capacity(n.max(m));
    let (mut i, mut j) = (n - 1, m - 1);
    pairs.push((i, j));
    while i > 0 || j > 0 {
        if i > 0 && j > 0 {
            let diag = dp[i - 1][j - 1];
            let up = dp[i - 1][j];
            let left = dp[i][j - 1];
            if diag <= up && diag <= left {
                i -= 1;
                j -= 1;
            } else if up <= left {
                i -= 1;
            } else {
                j -= 1;
            }
        } else if i > 0 {
            i -= 1;
        } else {
            j -= 1;
        }
        pairs.push((i, j));
    }
    pairs.reverse();
    Alignment { pairs, cost: dp[n - 1][m - 1] }
}

/// 漂移估计（纯函数）：成对时间差（ASR.start - 字幕.start）的中位数。
///
/// @ai-context: drift = 字幕时间戳的校正平移量（correct_subtitles 直接相加）：
///              负值 = 字幕超前（OCR 链路延迟导致字幕 start 早于 ASR）；
///              正值 = 字幕滞后；中位数抗单对离群（文本错配对）；无成对 → None。
pub fn estimate_drift_ms(
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
    alignment: &Alignment,
) -> Option<i64> {
    let mut diffs: Vec<i64> = alignment
        .pairs
        .iter()
        .filter_map(|(i, j)| {
            let s = subtitles.get(*i)?;
            let a = asr_segments.get(*j)?;
            Some(a.start_ms as i64 - s.start_ms as i64)
        })
        .collect();
    if diffs.is_empty() {
        return None;
    }
    diffs.sort_unstable();
    let mid = diffs.len() / 2;
    Some(if diffs.len() % 2 == 1 {
        diffs[mid]
    } else {
        // 偶数取两中位均值（向零取整——保持符号方向）
        (diffs[mid - 1] + diffs[mid]) / 2
    })
}

/// 时间戳回校（纯函数）：字幕流整体平移 drift_ms（clamp ≥0 防负时间戳）。
pub fn correct_subtitles(
    subtitles: &[SubtitleSegment],
    drift_ms: i64,
) -> Vec<SubtitleSegment> {
    subtitles
        .iter()
        .map(|s| {
            let shift = |t: u64| (t as i64 + drift_ms).max(0) as u64;
            SubtitleSegment {
                start_ms: shift(s.start_ms),
                end_ms: shift(s.end_ms),
                text: s.text.clone(),
                confidence: s.confidence,
            }
        })
        .collect()
}

/// 对齐正确率（纯函数）：成对中文本相似度 ≥ 阈值的比例（spike 评估指标）。
///
/// @ai-context: 合成漂移样本验证用——对齐应把相同/近似文本配对；
///              阈值默认 0.6（归一化编辑距离相似度）。
pub fn alignment_accuracy(alignment: &Alignment, subtitles: &[SubtitleSegment], asr_segments: &[TranscriptSegment], sim_threshold: f32) -> f32 {
    if alignment.pairs.is_empty() {
        return 0.0;
    }
    let matched = alignment
        .pairs
        .iter()
        .filter_map(|(i, j)| {
            let s = subtitles.get(*i)?;
            let a = asr_segments.get(*j)?;
            Some(text_similarity(&s.text, &a.text) >= sim_threshold)
        })
        .count();
    matched as f32 / alignment.pairs.len() as f32
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "dtw_align_tests.rs"]
mod tests;
