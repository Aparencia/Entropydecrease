//! 会话结构化分析 Tauri commands（REQ-044/045/046 / v0.5.0 M2）。
//!
//! @ai-context: 本层只做参数校验、调用编排（analysis）、错误映射（AGENTS.md §6）。
//! @ai-context: 课后精修路径：会话详情页调用 analyze_session 获取结构化分析
//!              （章节边界/重点候选/术语候选/讲者切换），供展示与 M7 产物体系消费。
//! @ai-context: 纯逻辑耗时低（文本规则），DB 读取为快速操作，直接调用不额外
//!              spawn_blocking（与 commands_session 同口径）。

use tauri::State;

use crate::analysis::{analyze_session_opt, SessionAnalysis};
use crate::commands::AppState;
use crate::video_profile::ProfileKind;

/// 分析会话：读取详情 → 按档案（会话落库的档案，缺省 Lecture）运行结构化分析。
///
/// @param id - 会话 id
/// @param profile - 可选档案覆盖（未传时用会话落库档案；均缺省 → Lecture 默认）
#[tauri::command]
pub async fn analyze_session_command(
    state: State<'_, AppState>,
    id: i64,
    profile: Option<String>,
) -> Result<SessionAnalysis, String> {
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
    // REQ-108（v0.7.0 M1.5）：信号事件随分析读取（章节检测真实信号消费）
    let events = state.db.list_events(id).map_err(|e| e.to_string())?;
    // 档案优先级：调用方覆盖 > 会话落库 > Lecture 默认（默认档案不阻断）
    let kind = profile
        .map(|p| ProfileKind::parse(&p))
        .or_else(|| session.profile.as_deref().map(ProfileKind::parse))
        .unwrap_or(ProfileKind::Lecture);
    let detail = crate::types::SessionDetail { session, segments, ocr_blocks, events, screens: Vec::new() };
    // REQ-060：口语符号映射表（AppState 加载；JSON 校准生效）
    Ok(analyze_session_opt(&detail, kind, &state.symbol_normalize))
}
