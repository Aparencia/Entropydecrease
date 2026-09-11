//! 图像优先档案模板族（讲义 / 实操步骤卡 / 跟练步骤图卡）——REQ-052 / REQ-123 模板域。
//!
//! @ai-context: 从 artifact_templates.rs 拆出（AGENTS.md §3 单文件 ≤300 行）：
//!              本族模板由关键帧与步骤边界驱动，原料经 SessionDetail +
//!              SessionAnalysis + KeyFrameCandidate 注入，纯函数、可 golden 单测。
//! @ai-context: step_cards_blocks 无步骤边界时回退同族 hands_on_blocks（族内闭合）。
//! @ai-context: 块引用原料不复制（refs 携带 segment/frame 标识），原料可回看可重算。
//! @ai-context: 可见性 pub(super)：仅父模块分发器 build_artifact 调用；本批纯搬运，
//!              逻辑与产物文案逐字未改（含图片相对路径约定与全角括号文案）。

use crate::analysis::SessionAnalysis;
use crate::artifact::{
    ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource,
};
use crate::frame_cluster::KeyFrameCandidate;
use crate::types::SessionDetail;

/// 讲义式（网课）：C1 章节 + C3 术语 + 段落（B5 书面化）+ 关键图 + 表格/公式块 + 小结
pub(super) fn lecture_blocks(detail: &SessionDetail, analysis: &SessionAnalysis, keyframes: &[KeyFrameCandidate]) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 标题段落（会话标题）
    blocks.push(ArtifactBlock::new(
        ArtifactKind::Summary,
        order,
        BlockPayload::Text(format!("# {}", detail.session.title)),
    ));
    order += 1;
    // 章节边界 → 小结占位 + 段落
    for chapter in &analysis.chapters {
        blocks.push(ArtifactBlock::new(
            ArtifactKind::Summary,
            order,
            BlockPayload::Text(format!("本章小结 @ {}ms", chapter.time_ms)),
        ));
        order += 1;
        // 该章节时间范围内的转写段 → 书面化段落
        for seg in detail.segments.iter().filter(|s| {
            s.start_ms >= chapter.time_ms
                && analysis
                    .chapters
                    .iter()
                    .find(|c| c.time_ms > chapter.time_ms)
                    .map(|next| s.end_ms <= next.time_ms)
                    .unwrap_or(true)
        }) {
            let text = analysis
                .normalized_segments
                .iter()
                .find(|n| n.segment_id == seg.id)
                .map(|n| n.text.clone())
                .unwrap_or_else(|| seg.text.clone());
            if text.trim().is_empty() {
                continue;
            }
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Paragraph,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    // 无章节时兜底：全部段 → 段落
    if analysis.chapters.is_empty() {
        for seg in &detail.segments {
            let text = analysis
                .normalized_segments
                .iter()
                .find(|n| n.segment_id == seg.id)
                .map(|n| n.text.clone())
                .unwrap_or_else(|| seg.text.clone());
            if text.trim().is_empty() {
                continue;
            }
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Paragraph,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    // 术语表 → TermAnchor
    for g in &analysis.glossary {
        blocks.push(ArtifactBlock::new(
            ArtifactKind::TermAnchor,
            order,
            BlockPayload::Term { term: g.term.clone(), definition: None },
        ));
        order += 1;
    }
    // 关键图（≤3 张内嵌正文）
    for kf in keyframes.iter().take(3) {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::KeyImage,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(kf.timestamp_ms) },
            payload: BlockPayload::Image(format!("full/{}.webp", kf.timestamp_ms)),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    blocks
}

/// 步骤卡（实操）：B6 簇 × 语音段 → StepCard（帧 + 说明 + 时间范围）
///
/// @ai-context: analysis 参数保留（统一模板签名；实操模板暂不消费，
///              登记豁免——后续步骤说明可结合重点标注）。
pub(super) fn hands_on_blocks(
    detail: &SessionDetail,
    keyframes: &[KeyFrameCandidate],
    _analysis: &SessionAnalysis,
) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    for (i, kf) in keyframes.iter().enumerate() {
        // 关键帧后的首个转写段作为步骤说明
        let desc_seg = detail
            .segments
            .iter()
            .find(|s| s.start_ms >= kf.timestamp_ms)
            .map(|s| s.text.clone())
            .unwrap_or_else(|| format!("步骤 {}", i + 1));
        let range = detail
            .segments
            .iter()
            .find(|s| s.start_ms >= kf.timestamp_ms)
            .map(|s| (kf.timestamp_ms, s.end_ms))
            .unwrap_or((kf.timestamp_ms, kf.timestamp_ms + 5000));
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::StepCard,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(kf.timestamp_ms) },
            payload: BlockPayload::Step {
                image: format!("full/{}.webp", kf.timestamp_ms),
                description: desc_seg,
                start_ms: range.0,
                end_ms: range.1,
                // REQ-123：标签/理由为跟练档案步骤边界专用（实操关键帧步骤卡无标签）
                label: None,
                reason: None,
            },
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    if blocks.is_empty() {
        // 无关键帧兜底：段落直出
        for seg in &detail.segments {
            blocks.push(ArtifactBlock {
                kind: ArtifactKind::Paragraph,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(seg.text.clone()),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    blocks
}

/// 步骤图卡（跟练档案 REQ-123 / v0.7.0 M2）：step_boundaries → StepCard。
///
/// @ai-context: 每个 StepBoundary 产出一个 StepCard 块（payload 含
///              time_ms=start_ms/end_ms + label + reason；refs.frame_ms=time_ms
///              供时间轴定位）；**本版有卡无图**（image 空串——配图在 M3
///              REQ-088 图注后完善）；无边界时回退关键帧步骤卡（同实操模板语义）。
pub(super) fn step_cards_blocks(
    detail: &SessionDetail,
    analysis: &SessionAnalysis,
    keyframes: &[KeyFrameCandidate],
) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    for (order, boundary) in analysis.step_boundaries.iter().enumerate() {
        let label = boundary.label.clone().unwrap_or_else(|| "步骤".to_string());
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::StepCard,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(boundary.time_ms) },
            payload: BlockPayload::Step {
                // 本版有卡无图：配图在 M3 REQ-088 图注后完善
                image: String::new(),
                description: format!("{}（{}）", label, boundary.reason),
                start_ms: boundary.time_ms,
                end_ms: boundary.time_ms,
                label: boundary.label.clone(),
                reason: Some(boundary.reason.clone()),
            },
            order: order as u32,
            source: BlockSource::Local,
            id: 0,
        });
    }
    if blocks.is_empty() {
        // 无步骤边界兜底：关键帧步骤卡（跟练为图像优先档，关键帧丰富）
        return hands_on_blocks(detail, keyframes, analysis);
    }
    blocks
}
