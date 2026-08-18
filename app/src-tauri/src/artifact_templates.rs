//! 五档案产物模板（REQ-052 / v0.5.0 M7，头脑风暴轮 5）。
//!
//! @ai-context: 一种原料，五种模板——`build_artifact(profile, detail, keyframes)`
//!              → 有序 ArtifactBlock[]。模板为纯函数（注入原料 SessionDetail +
//!              关键图候选 + 会话图片列表），可 golden 单测。
//! @ai-context: 块引用原料不复制（refs 携带 segment/ocr 标识）；原料可回看可重算。
//! @ai-context: 复用 M2 机制输出（章节/书面化/重点/术语/讲者）——
//!              analyze_session 是各模板的原料加工前置。

use crate::analysis::{analyze_session, SessionAnalysis};
use crate::artifact::{
    ArtifactBlock, ArtifactKind, BlockPayload, BlockRefs, BlockSource, SessionArtifact,
};
use crate::frame_cluster::KeyFrameCandidate;
use crate::types::SessionDetail;
use crate::video_profile::ProfileKind;

/// 讲义式（网课）：C1 章节 + C3 术语 + 段落（B5 书面化）+ 关键图 + 表格/公式块 + 小结
fn lecture_blocks(detail: &SessionDetail, analysis: &SessionAnalysis, keyframes: &[KeyFrameCandidate]) -> Vec<ArtifactBlock> {
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
fn hands_on_blocks(
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

/// 摘要文（口播）：C2 重点 → Claim 排序 + Quote 金句 + 关键词索引
fn talking_head_blocks(detail: &SessionDetail, analysis: &SessionAnalysis) -> Vec<ArtifactBlock> {
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

/// 对话纪要（访谈）：QAPair 结构 + Highlight（A3 讲者标注为可选字段）
fn interview_blocks(detail: &SessionDetail, analysis: &SessionAnalysis) -> Vec<ArtifactBlock> {
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
fn meeting_blocks(
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

/// 构建会话产物（纯函数）：档案模板 → 有序块。
///
/// @ai-context: keyframes 为 M6 投票产出的关键图候选（外部注入）；
///              无关键帧时模板自然降级（不产生图片块，不阻断产物生成）。
pub fn build_artifact(
    profile: ProfileKind,
    detail: &SessionDetail,
    keyframes: &[KeyFrameCandidate],
) -> SessionArtifact {
    let analysis = analyze_session(detail, profile);
    let blocks = match profile {
        ProfileKind::Lecture => lecture_blocks(detail, &analysis, keyframes),
        ProfileKind::HandsOn => hands_on_blocks(detail, keyframes, &analysis),
        ProfileKind::TalkingHead => talking_head_blocks(detail, &analysis),
        ProfileKind::Interview => interview_blocks(detail, &analysis),
        ProfileKind::Meeting => meeting_blocks(detail, &analysis, keyframes),
    };
    SessionArtifact {
        session_id: detail.session.id,
        profile: profile.as_str().to_string(),
        blocks,
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "artifact_templates_tests.rs"]
mod tests;
