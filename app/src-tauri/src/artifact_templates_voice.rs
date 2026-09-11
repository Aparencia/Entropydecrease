//! 语音优先档案模板族（摘要文 / 故事化叙事 / 访谈 / 会议）——REQ-052 / REQ-193 模板域。
//!
//! @ai-context: 从 artifact_templates.rs 拆出（AGENTS.md §3 单文件 ≤300 行）：
//!              本族模板由转写段与叙事检测驱动（ASR 优先，无画面信号消费）。
//! @ai-context: talking_head_blocks 命中故事化特征时转同族 storytelling_blocks
//!              （族内闭合，无需跨模块可见性提权）。
//! @ai-context: 会议触发词规则（Decision/Todo）为既有判定口径，本批逐字未改。
//! @ai-context: 可见性 pub(super)：仅父模块分发器 build_artifact 调用；本批纯搬运。

use crate::analysis::SessionAnalysis;
use crate::artifact::{
    ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource,
};
use crate::frame_cluster::KeyFrameCandidate;
use crate::types::SessionDetail;

/// 摘要文（口播）：C2 重点 → Claim 排序 + Quote 金句 + 关键词索引
///
/// @ai-context: v0.9.0 M5（REQ-193）：叙事变体——故事化科普（会话 33 类）
///              产出「叙事线 + 要点提取」（叙事段保序 + 编号要点）；
///              直接教学/无故事化特征 → 现有路径零回归。
pub(super) fn talking_head_blocks(detail: &SessionDetail, analysis: &SessionAnalysis) -> Vec<ArtifactBlock> {
    // 叙事检测（故事化特征：角色 + 转折词；命中 → 叙事线+要点变体）
    let narrative = crate::narrative_detect::detect_narrative(
        &crate::narrative_detect::NarrativeSignals {
            segments: detail
                .segments
                .iter()
                .map(|s| s.text.clone())
                .collect(),
            ocr_texts: detail
                .ocr_blocks
                .iter()
                .map(|b| b.text.clone())
                .collect(),
        },
    );
    if narrative.style == crate::narrative_detect::NarrativeStyle::Storytelling {
        return storytelling_blocks(detail, &narrative);
    }
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 重点候选 → Claim
    for h in &analysis.highlights {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::Claim,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(h.time_ms) },
            payload: BlockPayload::Text(h.text.clone()),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    // 无重点兜底：全部段 → Quote（金句引用）
    if analysis.highlights.is_empty() {
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
                kind: ArtifactKind::Quote,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    blocks
}

/// 故事化叙事变体（REQ-193）：叙事线（保序叙事段）+ 要点提取（编号要点）。
///
/// @ai-context: 会话 33 实证形态——叙事段作为正文段落保留故事主线；
///              要点作为 Highlight 块结构化呈现（"1、公积金贷款利息低"）；
///              无要点时兜底叙事段直出（不丢故事）。
fn storytelling_blocks(
    detail: &SessionDetail,
    narrative: &crate::narrative_detect::NarrativeDetection,
) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 叙事线：含故事化特征的段保序（引用转写段 id——可回看可跳转）
    for seg in &detail.segments {
        if narrative.narrative_line.iter().any(|n| n == &seg.text) {
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
    // 要点提取：编号要点段 → Highlight（结构化呈现）
    for point in &narrative.key_points {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::Highlight,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: None },
            payload: BlockPayload::Text(point.clone()),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    // 兜底：无叙事线（故事化但特征段缺失——罕见）→ 全部段直出不丢内容
    if blocks.is_empty() {
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

/// 对话纪要（访谈）：QAPair 结构 + Highlight（A3 讲者标注为可选字段）
pub(super) fn interview_blocks(detail: &SessionDetail, analysis: &SessionAnalysis) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 交替段 → QAPair（奇偶配对近似问答结构；A3 讲者切换点作为分组边界）
    let mut i = 0;
    while i + 1 < detail.segments.len() {
        let q = &detail.segments[i];
        let a = &detail.segments[i + 1];
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::QAPair,
            refs: BlockRefs {
                segment_id: Some(q.id),
                ocr_block_id: None,
                frame_ms: Some(q.start_ms),
            },
            payload: BlockPayload::QA { question: q.text.clone(), answer: a.text.clone() },
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
        i += 2;
    }
    // 重点 → Highlight
    for h in &analysis.highlights {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::Highlight,
            refs: BlockRefs { segment_id: None, ocr_block_id: None, frame_ms: Some(h.time_ms) },
            payload: BlockPayload::Text(h.text.clone()),
            order,
            source: BlockSource::Local,
            id: 0,
        });
        order += 1;
    }
    blocks
}

/// 会议纪要（会议）：触发词规则 → Decision/Todo + AgendaSection + 投屏截图归档
///
/// @ai-context: analysis 参数保留（统一模板签名；会议模板暂不消费，
///              登记豁免——后续可结合重点标注排序决议）。
pub(super) fn meeting_blocks(
    detail: &SessionDetail,
    _analysis: &SessionAnalysis,
    keyframes: &[KeyFrameCandidate],
) -> Vec<ArtifactBlock> {
    let mut blocks = Vec::new();
    let mut order = 0u32;
    // 触发词规则（"我们决定/下一步/麻烦你/截止"）→ Decision/Todo
    for seg in &detail.segments {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        let kind = if text.contains("我们决定") || text.contains("决议") || text.contains("拍板") {
            Some(ArtifactKind::Decision)
        } else if text.contains("下一步") || text.contains("麻烦你") || text.contains("请负责")
            || text.contains("截止") || text.contains("TODO") || text.contains("待办")
        {
            Some(ArtifactKind::Todo)
        } else {
            None
        };
        if let Some(k) = kind {
            blocks.push(ArtifactBlock {
                kind: k,
                refs: BlockRefs { segment_id: Some(seg.id), ocr_block_id: None, frame_ms: Some(seg.start_ms) },
                payload: BlockPayload::Text(text.to_string()),
                order,
                source: BlockSource::Local,
                id: 0,
            });
            order += 1;
        }
    }
    // 无触发词兜底：段落直出
    if blocks.is_empty() {
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
    // 投屏截图归档（关键图）
    for kf in keyframes.iter().take(3) {
        blocks.push(ArtifactBlock {
            kind: ArtifactKind::ScreenShot,
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
