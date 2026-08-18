//! 补缝式 AI 判定器（REQ-055 / v0.5.0 M8，依据 ADR-010）。
//!
//! @ai-context: 本地失败检测三入口：① 版面 unknown 区；② 规则重建失败
//!              （表格/公式低置信）；③ OCR 置信度低于阈值（B3）。
//!              + 用户手动"让 AI 理解此图"。产出 ai_candidate 块
//!              （含 source_ref 裁剪图 + 最小上下文：前后 ASR 文本，可关）。
//! @ai-context: 纯函数可单测（注入 fake 低置信/unknown 决策矩阵）；
//!              云端未实装（V1.0），判定器输出供 mock 适配器验证链路。

use crate::ai_protocol::{AiContext, AiEnhanceRequest, AiRequestType, AiSourceRef};
use crate::types::{SessionOcrBlock, SessionSegment};

/// OCR 置信度阈值：低于该值视为低置信（补缝候选）。
pub const OCR_CONFIDENCE_THRESHOLD: f32 = 0.5;
/// 表格重建置信度阈值：低于该值视为重建失败（补缝候选）。
///
/// @ai-context: 表格区域 OCR 块分数低于该阈值 → Table 补缝候选
///              （M5 重建失败诚实降级的 AI 衔接入口）。
pub const RECONSTRUCTION_CONFIDENCE_THRESHOLD: f32 = 0.6;

/// 补缝候选（判定器输出）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AiCandidate {
    /// 候选时刻（ms；产物块 refs.frame_ms 对齐）
    pub time_ms: u64,
    /// 请求类型（本地失败类型）
    pub request_type: AiRequestType,
    /// 命中原因（展示："低置信 OCR/unknown 区/重建失败/用户指定"）
    pub reason: String,
    /// 源引用（裁剪图相对路径 + 上下文）
    pub source_ref: AiSourceRef,
    /// 最小上下文（前后 ASR 文本）
    pub context: AiContext,
    /// 本地结果（保留：AI 是叠加层不是替代层）
    pub local_text: Option<String>,
}

/// 判定器配置。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AiJudgeConfig {
    /// OCR 置信度阈值（低置信入口）
    pub ocr_threshold: f32,
    /// 表格重建置信度阈值（重建失败入口）
    pub reconstruction_threshold: f32,
    /// 是否附带上下文（默认开）
    pub with_context: bool,
}

impl Default for AiJudgeConfig {
    fn default() -> Self {
        Self {
            ocr_threshold: OCR_CONFIDENCE_THRESHOLD,
            reconstruction_threshold: RECONSTRUCTION_CONFIDENCE_THRESHOLD,
            with_context: true,
        }
    }
}

/// 判定器（纯函数）：会话 OCR 块 + 转写段 → 补缝候选列表。
///
/// @ai-context: 三入口扫描：
///              ① region_kind=unknown 的 OCR 块 → FormulaLatex/Flowchart 候选
///                 （unknown 无类型细分，默认 formula_latex——渲染公式最常见）；
///              ② score < ocr_threshold → Handwriting 候选（低置信文本）；
///              ③ region_kind=table 且低置信 → Table 候选。
///              用户手动入口由 command 层直接构造候选（不在此扫描）。
pub fn judge_candidates(
    ocr_blocks: &[SessionOcrBlock],
    segments: &[SessionSegment],
    config: &AiJudgeConfig,
) -> Vec<AiCandidate> {
    let mut candidates = Vec::new();
    for (i, block) in ocr_blocks.iter().enumerate() {
        let kind = block.region_kind.as_deref().unwrap_or("");
        let is_unknown = kind == "unknown";
        let low_confidence = block.score < config.ocr_threshold;
        let is_table = kind == "table";
        let table_low_confidence = block.score < config.reconstruction_threshold;
        if is_unknown {
            candidates.push(AiCandidate {
                time_ms: block.timestamp_ms,
                request_type: AiRequestType::FormulaLatex,
                reason: "unknown 版面区域".to_string(),
                source_ref: AiSourceRef {
                    frame_id: None,
                    crop_image: Some(format!("full/{}.webp", block.timestamp_ms)),
                    crop: None,
                },
                context: build_context(segments, block.timestamp_ms, config.with_context),
                local_text: Some(block.text.clone()),
            });
        } else if is_table && table_low_confidence {
            candidates.push(AiCandidate {
                time_ms: block.timestamp_ms,
                request_type: AiRequestType::Table,
                reason: "表格重建低置信".to_string(),                source_ref: AiSourceRef {
                    frame_id: None,
                    crop_image: Some(format!("full/{}.webp", block.timestamp_ms)),
                    crop: None,
                },
                context: build_context(segments, block.timestamp_ms, config.with_context),
                local_text: Some(block.text.clone()),
            });
        } else if low_confidence && !block.text.trim().is_empty() {
            candidates.push(AiCandidate {
                time_ms: block.timestamp_ms,
                request_type: AiRequestType::Handwriting,
                reason: "OCR 低置信".to_string(),
                source_ref: AiSourceRef {
                    frame_id: None,
                    crop_image: Some(format!("full/{}.webp", block.timestamp_ms)),
                    crop: None,
                },
                context: build_context(segments, block.timestamp_ms, config.with_context),
                local_text: Some(block.text.clone()),
            });
        }
        // 用户手动入口（command 层构造）：_ = i 防未用警告（遍历保留索引语义）
        let _ = i;
    }
    candidates
}

/// 构建最小上下文（前后 ASR 文本；可关）：时间戳前后最近的段。
fn build_context(
    segments: &[SessionSegment],
    time_ms: u64,
    with_context: bool,
) -> AiContext {
    if !with_context {
        return AiContext::default();
    }
    let mut prev: Option<String> = None;
    let mut next: Option<String> = None;
    for s in segments {
        if s.end_ms <= time_ms {
            prev = Some(s.text.clone());
        } else if next.is_none() {
            next = Some(s.text.clone());
            break;
        }
    }
    AiContext { prev_asr: prev, next_asr: next }
}

/// 构造 AI 请求（判定器输出 → 协议请求；command 层调用）。
pub fn to_request(candidate: &AiCandidate) -> AiEnhanceRequest {
    AiEnhanceRequest {
        request_type: candidate.request_type,
        source_ref: candidate.source_ref.clone(),
        context: candidate.context.clone(),
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_judge_tests.rs"]
mod tests;
