//! 会话产物 Tauri commands（REQ-052 / v0.5.0 M7）。
//!
//! @ai-context: 本层只做参数校验、调用模板（artifact_templates）+ 数据层
//!              （db_artifacts）、错误映射（AGENTS.md §6）。
//! @ai-context: 产物 ↔ 时间轴双向定位：块携带 refs（segment_id/frame_ms），
//!              前端点击块跳转对应转写段/关键帧。
//! @ai-context: "一键落笔记"沿用 NoteDraft → Note 通道（REQ-003/005 已有）：
//!              产物渲染为 Markdown 落库。

use tauri::State;

use crate::artifact::{ArtifactBlock, ArtifactKind, BlockPayload, SessionArtifact};
use crate::artifact_templates::build_artifact;
use crate::commands::AppState;
use crate::types::{NewNote, Note};
use crate::video_profile::ProfileKind;

/// 构建并保存会话产物（可重算：覆盖旧产物）。
#[tauri::command]
pub async fn build_session_artifact(
    state: State<'_, AppState>,
    session_id: i64,
    profile: Option<String>,
) -> Result<SessionArtifact, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;
    let segments = state.db.list_segments(session_id).map_err(|e| e.to_string())?;
    let ocr_blocks = state.db.list_ocr_blocks(session_id).map_err(|e| e.to_string())?;
    // REQ-108（v0.7.0 M1.5）：信号事件随详情读取（产物模板消费备数据）
    let events = state.db.list_events(session_id).map_err(|e| e.to_string())?;
    // 档案优先级：调用方覆盖 > 会话落库 > Lecture 默认
    let kind = profile
        .map(|p| ProfileKind::parse(&p))
        .or_else(|| session.profile.as_deref().map(ProfileKind::parse))
        .unwrap_or(ProfileKind::Lecture);
    // 关键图候选（M6 投票输出；当前从图片库取时间戳近似——产物不阻断）
    let keyframes = crate::commands_images::keyframes_from_store(&state, session_id).unwrap_or_default();
    let detail = crate::types::SessionDetail { session, segments, ocr_blocks, events };
    let artifact = build_artifact(kind, &detail, &keyframes);
    state
        .db
        .replace_artifact(&artifact)
        .map_err(|e| format!("保存产物失败: {}", e))?;
    Ok(artifact)
}

/// 读取会话产物（无产物返回 None）。
#[tauri::command]
pub async fn get_session_artifact(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Option<SessionArtifact>, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    state.db.get_artifact(session_id).map_err(|e| e.to_string())
}

/// 产物 → 笔记（沿用 NoteDraft → Note 通道）：渲染为 Markdown 落库。
///
/// @ai-context: 产物 Markdown 渲染（块 → 行）：文本块直出、图片块引用、
///              表格/公式块内嵌结构、术语/决议/待办加前缀标记。
#[tauri::command]
pub async fn artifact_to_note(
    state: State<'_, AppState>,
    session_id: i64,
    title: Option<String>,
) -> Result<Note, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let artifact = state
        .db
        .get_artifact(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "会话尚无产物，请先构建".to_string())?;
    let session = state
        .db
        .get_session(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;
    let markdown = render_artifact_markdown(&artifact);
    let fallback = format!("{}（产物）", session.title);
    let title = crate::commands::normalize_title(title.unwrap_or_default(), &fallback);
    state
        .db
        .create_note(&NewNote {
            title: title.chars().take(100).collect(),
            content: markdown.chars().take(200_000).collect(),
            source: "classroom".to_string(),
            // v0.7.1：产物→笔记同样建立会话关联（列表 has_note 标记口径统一）
            session_id: Some(session_id),
        })
        .map_err(|e| e.to_string())
}

/// 产物块 → Markdown 行（纯函数；测试可快照）。
pub fn render_artifact_markdown(artifact: &SessionArtifact) -> String {
    let mut md = String::new();
    for b in &artifact.blocks {
        md.push_str(&render_block(b));
        md.push('\n');
    }
    md
}

/// 单块 → Markdown（纯函数）。
fn render_block(b: &ArtifactBlock) -> String {
    match (&b.kind, &b.payload) {
        (ArtifactKind::Paragraph, BlockPayload::Text(t)) => t.clone(),
        (ArtifactKind::Summary, BlockPayload::Text(t)) => format!("## {}", t),
        (ArtifactKind::Claim, BlockPayload::Text(t)) => format!("- **观点**：{}", t),
        (ArtifactKind::Quote, BlockPayload::Text(t)) => format!("> {}", t),
        (ArtifactKind::Highlight, BlockPayload::Text(t)) => format!("- 🔆 {}", t),
        (ArtifactKind::Decision, BlockPayload::Text(t)) => format!("- ✅ **决议**：{}", t),
        (ArtifactKind::Todo, BlockPayload::Text(t)) => format!("- ☑️ **待办**：{}", t),
        (ArtifactKind::AgendaSection, BlockPayload::Text(t)) => format!("## {}", t),
        (ArtifactKind::TermAnchor, BlockPayload::Term { term, definition }) => match definition {
            Some(d) => format!("- **{}**：{}", term, d),
            None => format!("- **{}**", term),
        },
        (ArtifactKind::Table, BlockPayload::Table(t)) => t.markdown.clone(),
        (ArtifactKind::Formula, BlockPayload::Formula(f)) => format!("$${}$$", f.latex),
        (ArtifactKind::CodeBlock, BlockPayload::Code { code, language, .. }) => {
            let lang = language.clone().unwrap_or_default();
            format!("```{}\n{}\n```", lang, code)
        }
        (ArtifactKind::KeyImage, BlockPayload::Image(p))
        | (ArtifactKind::ScreenShot, BlockPayload::Image(p)) => {
            // 图片为相对路径——Markdown 引用（前端图集可读；文件随会话目录）
            format!("![关键帧]({})", p)
        }
        (ArtifactKind::StepCard, BlockPayload::Step { image, description, .. }) => {
            // 审查 L7 修复：image 为空（跟练"有卡无图"降级）时输出纯文本步骤行
            // ——不产生 `![步骤]()` 坏图引用（笔记导出可读）
            if image.is_empty() {
                description.clone()
            } else {
                format!("![步骤]({})\n{}", image, description)
            }
        }
        (ArtifactKind::QAPair, BlockPayload::QA { question, answer }) => {
            format!("**Q：{}**\nA：{}", question, answer)
        }
        // 兜底：未知组合 → 空（不崩渲染）
        _ => String::new(),
    }
}
