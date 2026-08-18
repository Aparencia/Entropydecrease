//! 会话管理 Tauri commands（REQ-010，ADR-004）。
//!
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              DB 读写为快速操作直接调用，不额外 spawn_blocking（连接内 Mutex 保护）。
//! @ai-context: 入参校验（TD-005 修复口径）：title 非空且 ≤100 字；分页参数有界。

use tauri::State;

use crate::commands::AppState;
use crate::concat;
use crate::db_sessions::SESSION_STATUS_RECORDING;
use crate::types::{
    NewNote, NewSession, NewSessionOcrBlock, NewSessionSegment, Note, OcrBlock, Session,
    SessionDetail, TranscriptSegment,
};

/// 标题最大长度（防御性编程：防超长字符串污染 UI 与索引）。
const TITLE_MAX_CHARS: usize = 100;
/// 会话列表单页上限。
const LIST_LIMIT_MAX: u64 = 200;

/// 校验并归一化会话标题：空串回退默认名，超长截断。
fn normalize_title(raw: String, fallback: &str) -> String {
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(TITLE_MAX_CHARS).collect()
    }
}

/// 新建会话（REQ-010）。
#[tauri::command]
pub async fn create_session(
    state: State<'_, AppState>,
    title: String,
    source_window: Option<String>,
) -> Result<Session, String> {
    let new = NewSession {
        title: normalize_title(title, "未命名会话"),
        source_window: source_window.map(|s| s.chars().take(TITLE_MAX_CHARS).collect()),
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
    };
    state.db.add_ocr_block(&new).map(|b| b.id).map_err(|e| e.to_string())
}

/// 会话 → 笔记：转写段 + OCR 块复用本地拼接，一键落库（REQ-010 闭环）。
///
/// @ai-context: 只允许 finished/failed 会话转换（recording 中转换会产生不完整笔记）；
///              source 沿用 classroom（课堂助手产物语义）。
#[tauri::command]
pub async fn session_to_note(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
) -> Result<Note, String> {
    if id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let session = state
        .db
        .get_session(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", id))?;
    if session.status == SESSION_STATUS_RECORDING {
        return Err("进行中的会话不能转笔记，请先结束会话".to_string());
    }

    let segments: Vec<TranscriptSegment> = state
        .db
        .list_segments(id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|s| TranscriptSegment { start_ms: s.start_ms, end_ms: s.end_ms, text: s.text })
        .collect();
    let ocr_blocks: Vec<OcrBlock> = state
        .db
        .list_ocr_blocks(id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|b| OcrBlock { timestamp_ms: Some(b.timestamp_ms), text: b.text, score: b.score })
        .collect();

    let fallback = format!("{}（会话）", session.title);
    let draft = concat::build_note_draft(&normalize_title(title.unwrap_or_default(), &fallback), &segments, &ocr_blocks);
    let new = NewNote {
        title: draft.title.clone(),
        content: draft.markdown.clone(),
        source: "classroom".to_string(),
    };
    state.db.create_note(&new).map_err(|e| e.to_string())
}

/// 归一化转写段来源标识（asr | subtitle | fused，其余回退 asr）。
fn normalize_source(source: &str) -> String {
    match source {
        "subtitle" | "fused" => source.to_string(),
        _ => "asr".to_string(),
    }
}
