//! 会话级质量报告（REQ-076 / v0.6.0 M6，Q1；v0.7.0 M1 REQ-100 指标修正）。
//!
//! @ai-context: 聚合**已落库字段**（B3 段置信度 / OCR 分数 / region_kind /
//!              AI 边界候选数）→ 会话可信度摘要：低置信段列表（点击定位
//!              原料）、OCR 失败计数（低分块）、unknown 版面区占比、
//!              AI 复核候选数（规则层判不了的段——REQ-085 联动）。
//! @ai-context: REQ-100（v0.7.0 M1）：指标从"恒 ≈0"变真实——引擎诊断计数
//!              （engine 失败 AtomicU64 快照 + 重打分超时）由调用方从
//!              EnginePool 读出后传入（build_quality_report_with_engine 转发），
//!              本模块保持纯函数：计数作参数注入，不读全局状态，可单测。
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
    /// 低分 OCR 块数——**双源相加**（REQ-100）：① 落库低分块（score < 0.5，
    /// 已落库的识别结果）；② engine 运行期 OCR 失败计数（engine_ocr_failures，
    /// 识别请求失败、无结果可落库的部分）。两源含义不同（已落库 vs 运行期），
    /// 相加不重复，覆盖完整识别失败画像（此前仅落库源 → 恒 ≈0 失真）。
    pub low_score_ocr_count: usize,
    /// engine 运行期 OCR 失败计数快照（REQ-100：识别失败未落库部分；
    /// EnginePool::failure_counts 第二元）
    pub engine_ocr_failures: u64,
    /// engine 运行期 ASR 失败计数快照（REQ-100：诊断数据接入报告；
    /// EnginePool::failure_counts 第一元）
    pub asr_failures: u64,
    /// SenseVoice 重打分超时次数（REQ-100：有界等待超时 → 降级保留流式
    /// 结果；EnginePool::rescore_timeout_count）
    pub rescore_timeouts: u64,
    /// unknown 版面区块数（分区域 OCR 失败/不可识别）
    pub unknown_region_count: usize,
    /// AI 复核候选数（REQ-085 边界段——规则层判不了，需人工/AI 复核）
    pub ai_candidate_count: usize,
}

/// 低置信阈值（与 note_filter 过滤链同口径）。
const LOW_CONFIDENCE: f32 = 0.6;
/// OCR 低分阈值（与 handle_full_frame 落库过滤同口径）。
const LOW_OCR_SCORE: f32 = 0.5;

/// 构建质量报告（纯函数）：段 + OCR 块 + 引擎诊断计数 → 可信度摘要。
///
/// @ai-context: REQ-100：引擎计数（asr_failures / ocr_failures /
///              rescore_timeouts）由调用方从 EnginePool 快照传入
///              （build_quality_report_with_engine 转发）；本函数无副作用、
///              可单测。计数全 0 表示无引擎诊断数据（旧会话/离线路径）。
/// @param segments - 会话转写段
/// @param ocr_blocks - 会话 OCR 块
/// @param asr_failures - engine 运行期 ASR 失败计数
/// @param ocr_failures - engine 运行期 OCR 失败计数
/// @param rescore_timeouts - SenseVoice 重打分超时计数
pub fn build_quality_report_from_counts(
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    asr_failures: u64,
    ocr_failures: u64,
    rescore_timeouts: u64,
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
    // REQ-100 双源相加：落库低分块（score < 0.5，已落库）+ engine 运行期
    // 失败（识别失败未落库）——两源含义不同，相加覆盖完整识别失败画像
    let persisted_low_score = ocr_blocks.iter().filter(|b| b.score < LOW_OCR_SCORE).count();
    let low_score_ocr_count = persisted_low_score + ocr_failures as usize;
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
        engine_ocr_failures: ocr_failures,
        asr_failures,
        rescore_timeouts,
        unknown_region_count,
        ai_candidate_count,
    }
}

/// 引擎接入版：从 EnginePool 快照诊断计数后转发纯函数（REQ-100 生产入口）。
///
/// @ai-context: 唯一生产调用（commands_session::session_quality_report）；
///              只做计数读取 + 转发，无业务逻辑（AGENTS.md §3 副作用隔离）。
pub fn build_quality_report_with_engine(
    segments: &[SessionSegment],
    ocr_blocks: &[SessionOcrBlock],
    engine: &crate::engine::EnginePool,
) -> QualityReport {
    let (asr_failures, ocr_failures) = engine.failure_counts();
    let rescore_timeouts = engine.rescore_timeout_count();
    build_quality_report_from_counts(segments, ocr_blocks, asr_failures, ocr_failures, rescore_timeouts)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "quality_report_tests.rs"]
mod tests;
