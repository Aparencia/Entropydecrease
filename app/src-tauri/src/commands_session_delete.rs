//! 会话批量删除 Tauri commands（批 4 会话页交互矩阵——用户问题 4 已授权彻底方案）。
//!
//! @ai-context: 会话页勾选批量删除原为前端逐条循环调 delete_session（部分失败
//!              残留半删状态）；本模块提供单事务原子 batch_delete_sessions，
//!              语义与单条 delete_session 完全一致——子表外键级联
//!              （session_segments/session_ocr_blocks/artifact_blocks/
//!              session_events）、notes.session_id SET NULL、域广播
//!              （Sessions+Notes）均在命令层对等复刻。
//! @ai-context: 本层只做参数校验、调用数据层、错误映射（AGENTS.md §6）；
//!              DB 读写为快速操作直接调用，不额外 spawn_blocking（与
//!              delete_session 同口径——连接内 Mutex 保护）。

use tauri::State;

use crate::commands::AppState;
use crate::commands_session::LIST_LIMIT_MAX;
use crate::types::BatchSessionDeleteResult;

/// 批量删除单次上限（单一来源 = 列表单页上限 LIST_LIMIT_MAX——审查修复 P3-4：
/// 曾在本文件复制 200 与 commands_session 双源，防漂移收口引用）。
///
/// @ai-context Why 有界：勾选集恒为当前可见列表子集（≤单页上限），上限只是
///              防御越界 payload；与批量转笔记 50 条上限同为批次护栏，但删除
///              是原子全删，超限直接拒绝而非截断（防误删）。
/// @ai-context: 口径说明（审查注 pre-existing，不加新行为）：运行中（recording）
///              会话可否删除与单条 delete_session 完全同口径——数据层无运行中
///              豁免，两条路径同样受 UI 勾选入口与确认弹窗约束。
const BATCH_DELETE_LIMIT: u64 = LIST_LIMIT_MAX;

/// 批量删除核心编排（仅测试基准——命令入口走同函数后补域广播）。
///
/// @ai-context: 校验顺序：空集 → 超限 → 非法 id（与单条 delete_session 对
///              id<=0 直接报错的语义逐条一致）；重复 id 静默去重（同批量转
///              笔记口径——同一会话只删一次，不影响返回计数）。
pub fn run_batch_delete(db: &crate::db::Db, ids: Vec<i64>) -> Result<BatchSessionDeleteResult, String> {
    if ids.is_empty() {
        return Err("批量删除 ids 不能为空".to_string());
    }
    if ids.len() as u64 > BATCH_DELETE_LIMIT {
        return Err(format!("批量删除上限 {} 条", BATCH_DELETE_LIMIT));
    }
    if let Some(&bad) = ids.iter().find(|&&id| id <= 0) {
        return Err(format!("无效的会话 id: {}", bad));
    }
    let mut uniq: Vec<i64> = ids.clone();
    uniq.sort_unstable();
    uniq.dedup();
    let deleted = db
        .delete_sessions_batch(&uniq)
        .map_err(|e| e.to_string())?;
    Ok(BatchSessionDeleteResult { deleted })
}

/// 批量删除会话（批 4：单事务原子——全删或全不删，不再逐条半删）。
///
/// @ai-context: 域广播与单条 delete_session 完全一致：确有删除（deleted>0）
///              才广播 sessions + notes 域（会话删除级联断笔记关联）；
///              全不存在/全空结果不广播（无变化不打扰订阅端）。
#[tauri::command]
pub async fn batch_delete_sessions(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<BatchSessionDeleteResult, String> {
    let result = run_batch_delete(&state.db, ids)?;
    if result.deleted > 0 {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Sessions);
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Notes);
    }
    Ok(result)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "commands_session_delete_tests.rs"]
mod delete_tests;
