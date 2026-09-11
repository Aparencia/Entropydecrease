//! AI 精修流式帧事件推送（拆分自 ai_refine_task.rs；AGENTS.md §3 单文件 ≤300 行）。
//!
//! @ai-context: 唯一 emit 点（事件名 "ai:refine-stream" 逐字）——5 种帧类型
//!              （Progress/BlockDone/Delta/SliceFailed/Done）定义仍在父模块，
//!              本模块只承载载荷与推送。
//! @ai-context: 失败静默（let _ =）：流式是呈现增强，不得影响任务主链路；调用方在
//!              worker 线程（Delta）与主线程（Done/Progress 收集段）两侧。

use tauri::Emitter;

use crate::commands::AppState;

use super::RefineStreamFrame;

/// 流式事件载荷（taskId 过滤——多任务并行时各订阅只收自己的帧）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RefineStreamPayload {
    task_id: u64,
    frame: RefineStreamFrame,
}

/// 推送精修流帧（失败静默——流式是呈现增强，不得影响任务主链路）。
pub(super) fn emit_refine_stream(st: &AppState, task_id: u64, frame: RefineStreamFrame) {
    let _ = st.app.emit("ai:refine-stream", RefineStreamPayload { task_id, frame });
}
