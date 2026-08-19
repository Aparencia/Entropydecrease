//! 实时会话 Tauri commands（M7，REQ-007~012 编排入口）。
//!
//! @ai-context: 本层只做参数校验与转发：start 组装 LiveSessionParams 交给
//!              LiveSessionManager（会话线程内部完成捕获/ASR/OCR/融合），
//!              stop 等待线程退出并返回会话 id（前端据此刷新详情）。
//! @ai-context: v0.7.0 M1（REQ-104/132）：start 成功后顺带启动剪贴板监听
//!              （文本信号 + 图片直贴，见 clipboard_signal.rs），stop 时置位
//!              停止——监听与实时会话一一对应，同一时刻最多一个。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

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
/// @param profile - 视频类型档案标识（REQ-043，kebab-case；None=自动检测结果）
#[tauri::command]
pub async fn start_live_session(
    state: State<'_, AppState>,
    title: String,
    source_window: Option<String>,
    window_id: Option<i64>,
    profile: Option<String>,
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
        // ADR-012 F4-2：标点恢复模型路径（路径约定 lib.rs punctuation_model）
        punctuation_model: crate::punctuation_model(&state.model_dir),
        fusion: state.live_session.fusion(),
        vocab: state.vocab.clone(),
        // REQ-043：档案标识（非法值回退 Lecture 默认档案，不阻断）
        profile: profile.map(|p| crate::video_profile::ProfileKind::parse(&p)),
        // REQ-051：图片存储基目录（会话图片归档）
        data_dir: state.data_dir.clone(),
        app: state.app.clone(),
        // REQ-083：UI 垃圾黑名单（字幕源头过滤）
        ui_junk: state.ui_junk.clone(),
    };
    // REQ-104/132：剪贴板监听时间戳基准——与实时会话纪元同域（图片文件名不冲突）
    let epoch = Instant::now();
    let session_id = state.live_session.start(params).map_err(|e| e.to_string())?;
    start_clipboard_monitor(&state, session_id, epoch);
    Ok(session_id)
}

/// 停止实时捕获会话；返回被停止的会话 id（None=无活动会话）。
#[tauri::command]
pub async fn stop_live_session(state: State<'_, AppState>) -> Result<Option<i64>, String> {
    let stopped = state.live_session.stop_active().map_err(|e| e.to_string())?;
    stop_clipboard_monitor(&state);
    Ok(stopped)
}

/// 查询实时会话状态（活动会话 id）。
#[tauri::command]
pub fn live_session_status(state: State<'_, AppState>) -> LiveSessionStatus {
    LiveSessionStatus {
        active: state.live_session.active_session_id().is_some(),
        session_id: state.live_session.active_session_id(),
    }
}

/// 启动剪贴板监听（REQ-104/132）：start_live_session 成功后调用。
///
/// @ai-context: 语义 = 新会话开始 → 清空旧会话信号（信号只反映最近一次会话的
///              课中复制）→ 起轮询线程（句柄存入 AppState，stop 时置位停止）。
fn start_clipboard_monitor(state: &AppState, session_id: i64, epoch: Instant) {
    stop_clipboard_monitor(state); // 防御：清理异常路径残留监听
    state.clipboard.clear();
    let stop = Arc::new(AtomicBool::new(false));
    let thread = crate::clipboard_signal::spawn_clipboard_monitor(
        state.app.clone(),
        session_id,
        epoch,
        stop.clone(),
        state.clipboard.clone(),
        state.data_dir.join("session-images").join(session_id.to_string()),
    );
    *state.clipboard_monitor.lock().expect("剪贴板监听锁中毒") =
        Some(crate::clipboard_signal::ClipboardMonitorHandle { stop, thread });
}

/// 停止剪贴板监听（stop 置位；线程分片休眠在一个轮询周期内自行退出）。
///
/// @ai-context: 不 join 线程（JoinHandle drop 即 detach）——避免 stop 命令
///              阻塞在监听线程收尾上（会话线程停止已有 5s 有界等待，监听叠加会拖慢响应）。
fn stop_clipboard_monitor(state: &AppState) {
    if let Ok(mut guard) = state.clipboard_monitor.lock() {
        if let Some(handle) = guard.take() {
            handle.stop.store(true, Ordering::SeqCst);
        }
    }
}
