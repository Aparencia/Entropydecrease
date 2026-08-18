//! 会话管理 Tauri commands（REQ-010，ADR-004；v0.6.0 M1 笔记净化接入）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              DB 读写为快速操作直接调用，不额外 spawn_blocking（连接内 Mutex 保护）。
//! @ai-context: 入参校验（TD-005 修复口径）：title 非空且 ≤100 字；分页参数有界。
//! @ai-context: REQ-081/082（v0.6.0 M1）：session_to_note（落库）与
//!              preview_session_note（只读预览）共用 note_filter 单一管线——
//!              输出一致性由构造保证（同一过滤链/同一 Markdown 组装）。

use tauri::State;

use crate::ai_protocol::TextFilterDecision;
use crate::commands::{normalize_title, AppState, TITLE_MAX_CHARS};
use crate::db_sessions::SESSION_STATUS_RECORDING;
use crate::note_filter::{apply_ai_decisions, filter_note, NoteFilterResult};
use crate::types::{
    NewNote, NewSession, NewSessionOcrBlock, NewSessionSegment, Note, Session, SessionDetail,
    SessionOcrBlock, SessionSegment,
};

/// 会话列表单页上限。
const LIST_LIMIT_MAX: u64 = 200;

/// 新建会话（REQ-010；v0.5.0 M1/REQ-043：可指定视频类型档案）。
#[tauri::command]
pub async fn create_session(
    state: State<'_, AppState>,
    title: String,
    source_window: Option<String>,
    profile: Option<String>,
) -> Result<Session, String> {
    let new = NewSession {
        title: normalize_title(title, "未命名会话"),
        source_window: source_window.map(|s| s.chars().take(TITLE_MAX_CHARS).collect()),
        profile: profile.map(|p| p.chars().take(30).collect()),
    };
    state.db.create_session(&new).map_err(|e| e.to_string())
}

/// 结束会话（status=recording → finished）。
#[tauri::command]
pub async fn finish_session(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    state.db.finish_session(id).map_err(|e| e.to_string())
}

/// 列出会话（关键词可选；默认第 1 页 50 条，新→旧）。
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    keyword: Option<String>,
    limit: Option<u64>,
    offset: Option<u64>,
) -> Result<Vec<Session>, String> {
    let limit = limit.unwrap_or(50).min(LIST_LIMIT_MAX);
    state
        .db
        .list_sessions(keyword.as_deref(), limit, offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

/// 会话详情：会话 + 转写段 + OCR 块（时间轴对齐，一次取全）。
#[tauri::command]
pub async fn get_session_detail(state: State<'_, AppState>, id: i64) -> Result<SessionDetail, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", id))?;
    let segments = state.db.list_segments(id).map_err(|e| e.to_string())?;
    let ocr_blocks = state.db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    Ok(SessionDetail { session, segments, ocr_blocks })
}

/// 删除会话（级联清理转写段与 OCR 块）。
#[tauri::command]
pub async fn delete_session(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    state.db.delete_session(id).map_err(|e| e.to_string())
}

/// 追加转写段（实时捕获链路调用）。
#[tauri::command]
pub async fn add_session_segment(
    state: State<'_, AppState>,
    session_id: i64,
    start_ms: u64,
    end_ms: u64,
    text: String,
    source: String,
    confidence: Option<f32>,
) -> Result<i64, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let new = NewSessionSegment {
        session_id,
        start_ms,
        end_ms,
        text: text.chars().take(10_000).collect(),
        source: normalize_source(&source),
        confidence,
    };
    state.db.add_segment(&new).map(|s| s.id).map_err(|e| e.to_string())
}

/// 追加 OCR 块（实时捕获链路调用）。
#[tauri::command]
pub async fn add_session_ocr_block(
    state: State<'_, AppState>,
    session_id: i64,
    timestamp_ms: u64,
    text: String,
    score: f32,
    region: String,
) -> Result<i64, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let new = NewSessionOcrBlock {
        session_id,
        timestamp_ms,
        text: text.chars().take(10_000).collect(),
        score: score.clamp(0.0, 1.0),
        region: if region == "subtitle" { "subtitle" } else { "full" }.to_string(),
        // 外部追加无版面上下文，区域标注留空
        region_kind: None,
    };
    state.db.add_ocr_block(&new).map(|b| b.id).map_err(|e| e.to_string())
}

/// 加载会话笔记原料（会话 + 转写段 + OCR 块；单一管线双出口共用）。
///
/// @ai-context: REQ-081：预览与转笔记从同一原料装载开始，保证口径一致。
fn load_note_material(
    state: &AppState,
    id: i64,
) -> Result<(Session, Vec<SessionSegment>, Vec<SessionOcrBlock>), String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", id))?;
    if session.status == SESSION_STATUS_RECORDING {
        return Err("进行中的会话不能生成笔记，请先结束会话".to_string());
    }
    let segments = state.db.list_segments(id).map_err(|e| e.to_string())?;
    let ocr_blocks = state.db.list_ocr_blocks(id).map_err(|e| e.to_string())?;
    Ok((session, segments, ocr_blocks))
}

/// 会话 → 笔记：转写段 + OCR 块经 note_filter 净化管线，一键落库（REQ-010 闭环）。
///
/// @ai-context: REQ-082：过滤链（UI 垃圾/重复合并/碎片/低置信）与预览共用；
///              ai_decisions（REQ-085）可选叠加——前端把预览中已确认的 AI
///              判定结果回传，落库与预览输出保持一致（默认 None=纯规则）。
/// @ai-context: 只允许 finished/failed 会话转换；source 沿用 classroom。
#[tauri::command]
pub async fn session_to_note(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    ai_decisions: Option<Vec<TextFilterDecision>>,
) -> Result<Note, String> {
    let (session, segments, ocr_blocks) = load_note_material(&state, id)?;
    let fallback = format!("{}（会话）", session.title);
    let title = normalize_title(title.unwrap_or_default(), &fallback);
    let mut result = filter_note(&title, &segments, &ocr_blocks, &state.ui_junk);
    if let Some(decisions) = ai_decisions {
        result = apply_ai_decisions(result, &decisions);
    }
    let new = NewNote {
        title: result.title.clone(),
        content: result.markdown.clone(),
        source: "classroom".to_string(),
    };
    state.db.create_note(&new).map_err(|e| e.to_string())
}

/// 会话笔记预览（REQ-081）：过滤后只读预览——不落库、不改库。
///
/// @ai-context: 与 session_to_note 同一过滤管线（输出一致性由构造保证）；
///              返回 NoteFilterResult（markdown + 过滤统计 + 被过滤对照 +
///              kept 段），前端展示过滤统计卡/对照复查/一键落库。
#[tauri::command]
pub async fn preview_session_note(
    state: State<'_, AppState>,
    id: i64,
) -> Result<NoteFilterResult, String> {
    let (session, segments, ocr_blocks) = load_note_material(&state, id)?;
    Ok(filter_note(&session.title, &segments, &ocr_blocks, &state.ui_junk))
}

/// 归一化转写段来源标识（asr | subtitle | fused，其余回退 asr）。
fn normalize_source(source: &str) -> String {
    match source {
        "subtitle" | "fused" => source.to_string(),
        _ => "asr".to_string(),
    }
}
