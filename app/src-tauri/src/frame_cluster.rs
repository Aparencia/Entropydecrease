//! 帧聚类与关键图筛选投票（REQ-051 / v0.5.0 M6，头脑风暴轮 3 B6）。
//!
//! @ai-context: 三层图结构的基础：帧聚类（感知哈希相似帧聚簇，簇首帧代表）
//!              → 多信号筛选投票（OCR 文本 diff / 画面变化幅度 / 停留时长 /
//!              用户截图最高权重）→ 关键图候选排序（每章节 ≤3 张内嵌产物）。
//! @ai-context: 纯逻辑可单测：输入为帧样本序列（时间戳 + 感知哈希 + 可选 OCR 文本），
//!              输出聚类与投票结果；存储/UI 由 image_store / 前端消费。

use serde::{Deserialize, Serialize};

/// 帧样本（编排层由实时链路填充：每帧感知哈希 + OCR 文本）。
#[derive(Debug, Clone, PartialEq)]
pub struct FrameSample {
    pub timestamp_ms: u64,
    /// 感知哈希（aHash；帧聚类去重/归簇依据）
    pub ahash: u64,
    /// 本帧 OCR 文本（无画面文字为 None）
    pub ocr_text: Option<String>,
    /// 画面变化幅度 0.0-1.0（相对上一帧；无则 0）
    pub change_magnitude: f32,
}

/// 画面簇（相似帧归簇；簇首帧 = 代表帧）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameCluster {
    /// 簇首帧时间戳（代表帧）
    pub first_ms: u64,
    /// 簇时间范围（首尾帧）
    pub last_ms: u64,
    /// 簇内帧数
    pub frame_count: u32,
}

/// 关键图候选（筛选投票输出）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyFrameCandidate {
    pub timestamp_ms: u64,
    /// 投票得分（信号叠加）
    pub score: f32,
    /// 命中信号原因（展示用："新文字/变化大/停留久/用户截图"）
    pub reasons: Vec<String>,
    /// 是否用户显式截图（最高权重，强制置顶）
    pub user_marked: bool,
}

/// 投票权重：OCR 新文字（新图强信号）。
const OCR_NEW_TEXT_WEIGHT: f32 = 3.0;
/// 投票权重：画面变化幅度 ≥ 该值。
const CHANGE_WEIGHT: f32 = 2.0;
/// 投票权重：停留时长 ≥ 该毫秒（10s 讲者停留）。
const HOLD_WEIGHT: f32 = 2.0;
/// 停留判定阈值（ms）：10s（讲者认为重要）。
const HOLD_MIN_MS: u64 = 10_000;
/// 变化幅度判定阈值：≥0.3 视为显著变化。
const CHANGE_THRESHOLD: f32 = 0.3;
/// 感知哈希汉明距离 ≤ 该值视为同簇（8×8 aHash 相似阈值）。
const CLUSTER_HAMMING_MAX: u32 = 6;

/// 帧聚类（纯函数）：按感知哈希相似度归簇。
///
/// @ai-context: 顺序扫描帧样本：与当前簇首哈希汉明距离 ≤ CLUSTER_HAMMING_MAX →
///              归入当前簇（更新时间范围）；否则开新簇。输出簇首帧时间戳 + 范围。
pub fn cluster_frames(samples: &[FrameSample]) -> Vec<FrameCluster> {
    let mut clusters: Vec<FrameCluster> = Vec::new();
    let mut current: Option<(u64, u64, u64, u32)> = None; // (hash, first_ms, last_ms, count)
    for s in samples {
        match current {
            Some((hash, first, _, count)) if hamming(s.ahash, hash) <= CLUSTER_HAMMING_MAX => {
                current = Some((hash, first, s.timestamp_ms, count + 1));
            }
            Some((_, first, last, count)) => {
                clusters.push(FrameCluster { first_ms: first, last_ms: last, frame_count: count });
                current = Some((s.ahash, s.timestamp_ms, s.timestamp_ms, 1));
            }
            None => {
                current = Some((s.ahash, s.timestamp_ms, s.timestamp_ms, 1));
            }
        }
    }
    if let Some((_, first, last, count)) = current {
        clusters.push(FrameCluster { first_ms: first, last_ms: last, frame_count: count });
    }
    clusters
}

/// 感知哈希汉明距离（纯函数）。
pub fn hamming(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

/// 关键图筛选投票（纯函数）：多信号叠加 → 候选排序（得分降序）。
///
/// @ai-context: 信号：① OCR 新文字（与前一簇文本不同 = 新图，权重最高）；
///              ② 画面变化幅度（≥阈值）；③ 停留时长（簇跨度 ≥10s）；
///              ④ 用户截图（user_ms 列表，最高权重强制置顶——用户自己觉得重要）。
/// @ai-context: 去重：同一簇只产出一个候选（簇首帧代表）；避免连续帧刷屏。
pub fn vote_key_frames(
    samples: &[FrameSample],
    user_ms: &[u64],
) -> Vec<KeyFrameCandidate> {
    let clusters = cluster_frames(samples);
    // 簇 → 候选（簇首帧代表——规划 M6：画面簇 = 簇首帧 + 时间范围）
    let mut candidates = Vec::new();
    let mut prev_text: Option<String> = None;
    for c in &clusters {
        let rep = samples
            .iter()
            .find(|s| s.timestamp_ms >= c.first_ms && s.timestamp_ms <= c.last_ms);
        let Some(rep) = rep else { continue };
        let mut score = 0.0f32;
        let mut reasons = Vec::new();
        // ① OCR 新文字（与前一簇比较；首簇无前簇 → 不标——避免全程首帧误标）
        if let Some(text) = rep.ocr_text.as_deref() {
            let is_new = prev_text.as_deref().is_some_and(|p| p != text);
            if is_new {
                score += OCR_NEW_TEXT_WEIGHT;
                reasons.push("新文字".to_string());
            }
            prev_text = Some(text.to_string());
        }
        // ② 画面变化幅度（簇首帧进入时的变化）
        if rep.change_magnitude >= CHANGE_THRESHOLD {
            score += CHANGE_WEIGHT;
            reasons.push("画面变化".to_string());
        }
        // ③ 停留时长
        if c.last_ms.saturating_sub(c.first_ms) >= HOLD_MIN_MS {
            score += HOLD_WEIGHT;
            reasons.push("停留久".to_string());
        }
        // ④ 用户截图（最高权重：强制置顶并标记）
        let user_marked = user_ms
            .iter()
            .any(|u| *u >= c.first_ms && *u <= c.last_ms);
        if user_marked {
            score += 100.0;
            reasons.push("用户截图".to_string());
        }
        candidates.push(KeyFrameCandidate {
            timestamp_ms: c.first_ms,
            score,
            reasons,
            user_marked,
        });
    }
    // 得分降序（用户截图强制最前）
    candidates.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.timestamp_ms.cmp(&b.timestamp_ms))
    });
    candidates
}

/// 关键图裁剪：每章节 ≤3 张（M6：内嵌产物正文上限；按得分取前 N）。
///
/// @ai-context: 消费方 = M7 产物体系（章节关键图内嵌）；当前由测试覆盖，
///              登记豁免 dead_code。
#[allow(dead_code)]
pub fn take_key_frames(candidates: Vec<KeyFrameCandidate>, max_per_chapter: usize) -> Vec<KeyFrameCandidate> {
    candidates.into_iter().take(max_per_chapter.max(1)).collect()
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "frame_cluster_tests.rs"]
mod tests;
