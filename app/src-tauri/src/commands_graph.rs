//! 知识图谱命令层（v0.14 C2 graph_snapshot；commands_* 拆分模式同款）。
//!
//! @ai-context: 单次拉取完整图谱（spec §3.2 后端裁决——避免 N 次全量拉取的初诊
//!              根因）；只读命令无入参校验面（无用户输入）。inner 函数模式
//!              与 commands_knowledge_core 一致——命令层薄封装，可测性集中数据层。

use tauri::State;

use crate::commands::AppState;
use crate::types::GraphSnapshot;

/// 图谱快照：四类节点 + 三类边（link/trace/belong）单次聚合。
#[tauri::command]
pub fn graph_snapshot(state: State<'_, AppState>) -> Result<GraphSnapshot, String> {
    graph_snapshot_inner(&state.db)
}

/// inner 实现（命令层薄封装；聚合逻辑在 db_graph 数据层）。
pub(crate) fn graph_snapshot_inner(db: &crate::db::Db) -> Result<GraphSnapshot, String> {
    db.graph_snapshot().map_err(|e| e.to_string())
}
