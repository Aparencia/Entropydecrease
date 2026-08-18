//! 实时会话 Tauri commands（M7，REQ-007~012 编排入口）。
//!
//! @ai-context: 本层只做参数校验与转发：start 组装 LiveSessionParams 交给
//!              LiveSessionManager（会话线程内部完成捕获/ASR/OCR/融合），
//!              stop 等待线程退出并返回会话 id（前端据此刷新详情）。

use serde::Serialize;
use tauri::State;

use crate::commands::AppState;
use crate::live_session::LiveSessionParams;

/// 实时会话状态（前端轮询）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSessionStatus {
    pub active: bool,
    pub session_id: Option<i64>,
}

/// 启动实时捕获会话（REQ-007~012 汇总入口）。
///
/// @param title - 会话标题（空串回退窗口名/默认名）
/// @param sourceWindow - 目标窗口标题（笔记命名与检索）
/// @param windowId - 目标窗口句柄（i64，None=全屏）
#[tauri::command]
pub async fn start_live_session(
    state: State<'_, AppState>,
    title: String,
    source_window: Option<String>,
    window_id: Option<i64>,
) -> Result<i64, String> {
    // 防御性校验：标题归一化（与 create_session 同口径）
    let trimmed = title.trim().to_string();
    let title = if trimmed.is_empty() {
        source_window
            .clone()
            .unwrap_or_else(|| "实时会话".to_string())
            .chars()
            .take(100)
            .collect()
    } else {
        trimmed.chars().take(100).collect()
    };

    let params = LiveSessionParams {
        title,
        source_window: source_window.map(|s| s.chars().take(100).collect()),
        hwnd: window_id,
        db: state.db.clone(),
        engines: state.engines.clone(),
        streaming_models: state.streaming_models.clone(),
        app: state.app.clone(),
    };
    state.live_session.start(params).map_err(|e| e.to_string())
}

/// 停止实时捕获会话；返回被停止的会话 id（None=无活动会话）。
#[tauri::command]
pub async fn stop_live_session(state: State<'_, AppState>) -> Result<Option<i64>, String> {
    state.live_session.stop_active().map_err(|e| e.to_string())
}

/// 查询实时会话状态（活动会话 id）。
#[tauri::command]
pub fn live_session_status(state: State<'_, AppState>) -> LiveSessionStatus {
    LiveSessionStatus {
        active: state.live_session.active_session_id().is_some(),
        session_id: state.live_session.active_session_id(),
    }
}
