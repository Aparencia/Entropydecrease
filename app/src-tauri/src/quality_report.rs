//! 会话级质量报告（REQ-076 / v0.6.0 M6，Q1）。
//!
//! @ai-context: 聚合**已落库字段**（B3 段置信度 / OCR 分数 / region_kind /
//!              AI 边界候选数）→ 会话可信度摘要：低置信段列表（点击定位
//!              原料）、OCR 失败计数（低分块）、unknown 版面区占比、
//!              AI 复核候选数（规则层判不了的段——REQ-085 联动）。
//! @ai-context: 纯函数可单测（合成会话数据）；前端会话详情"可信度总览"
//!              卡片消费。

use crate::note_filter::boundary_candidates;
use crate::types::{SessionOcrBlock, SessionSegment};

/// 低置信段条目（前端低置信列表：点击定位原料）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LowConfidenceItem {
    pub segment_id: i64,
    pub start_ms: u64,
    pub text: String,
    pub confidence: f32,
}

/// 会话质量报告。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct QualityReport {
    pub total_segments: usize,
    pub total_ocr_blocks: usize,
    /// 低置信段（confidence < 0.6）
    pub low_confidence_count: usize,
    pub low_confidence_segments: Vec<LowConfidenceItem>,
    /// 低分 OCR 块（score < 0.5——识别失败计数）
    pub low_score_ocr_count: usize,
    /// unknown 版面区块数（分区域 OCR 失败/不可识别）
    pub unknown_region_count: usize,
    /// AI 复核候选数（REQ-085 边界段——规则层判不了，需人工/AI 复核）
    pub ai_candidate_count: usize,
}

/// 低置信阈值（与 note_filter 过滤链同口径）。
const LOW_CONFIDENCE: f32 = 0.6;
/// OCR 低分阈值（与 handle_full_frame 落库过滤同口径）。
const LOW_OCR_SCORE: f32 = 0.5;

/// 构建质量报告（纯函数）：段 + OCR 块 → 可信度摘要。
pub fn build_quality_report(
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
) -> QualityReport {
    // 低置信段（confidence 显式且 < 阈值；None=旧数据不计数）
    let mut low: Vec<LowConfidenceItem> = segments
        .iter()
        .filter_map(|s| {
            s.confidence.filter(|c| *c < LOW_CONFIDENCE).map(|c| LowConfidenceItem {
                segment_id: s.id,
                start_ms: s.start_ms,
                text: s.text.clone(),
                confidence: c,
            })
        })
        .collect();
    low.sort_by_key(|i| i.start_ms);
    let low_score_ocr_count = ocr_blocks.iter().filter(|b| b.score < LOW_OCR_SCORE).count();
    let unknown_region_count = ocr_blocks
        .iter()
        .filter(|b| b.region_kind.as_deref() == Some("unknown"))
        .count();
    // AI 复核候选（REQ-085 边界段——规则保留段中的六类边界特征）
    let ai_candidate_count = boundary_candidates(segments).len();
    QualityReport {
        total_segments: segments.len(),
        total_ocr_blocks: ocr_blocks.len(),
        low_confidence_count: low.len(),
        low_confidence_segments: low,
        low_score_ocr_count,
        unknown_region_count,
        ai_candidate_count,
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "quality_report_tests.rs"]
mod tests;
