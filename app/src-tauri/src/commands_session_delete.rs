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
//! @ai-context: 批 8 T28（U1-a #2）：两条删除路径**都**级联清理音频文件
//!              （`{data_dir}/session-audio/{id}.wav` + 对齐 sidecar）——批量删若漏这一步，
//!              勾选多行删完音频仍留在盘上，与「数据不出本机」的承诺冲突。🔴 DB 删除是
//!              单事务原子，而**文件系统删除无法参与该事务** ⇒ 「DB 原子 + 文件非原子」
//!              必然产生「会话记录已删、个别音频仍在」的中间态 ⇒ 清理失败**不上抛**
//!              （会话记录消失才是用户意图），只登记 —— **「部分删除」是允许的终态**。

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

/// 批量删除的校验 + 去重（纯函数；`run_batch_delete` 与 `run_batch_delete_with_audio` 共用）。
///
/// @ai-context: 校验顺序：空集 → 超限 → 非法 id（与单条 delete_session 对
///              id<=0 直接报错的语义逐条一致）；重复 id 静默去重（同批量转
///              笔记口径——同一会话只删一次，不影响返回计数）。排序后去重 ⇒
///              返回集**顺序确定**，音频清理的入参也因此确定（T28）。
fn validated_ids(ids: &[i64]) -> Result<Vec<i64>, String> {
    if ids.is_empty() {
        return Err("批量删除 ids 不能为空".to_string());
    }
    if ids.len() as u64 > BATCH_DELETE_LIMIT {
        return Err(format!("批量删除上限 {} 条", BATCH_DELETE_LIMIT));
    }
    if let Some(&bad) = ids.iter().find(|&&id| id <= 0) {
        return Err(format!("无效的会话 id: {}", bad));
    }
    let mut uniq: Vec<i64> = ids.to_vec();
    uniq.sort_unstable();
    uniq.dedup();
    Ok(uniq)
}

/// 批量删除核心编排（仅测试基准——命令入口走同函数后补域广播）。
///
/// @ai-context: T28 起本函数只管 **DB 面**（签名与语义逐字不变 ⇒ 批 4 起的既有用例
///              继续覆盖它）；音频级联清理在 `run_batch_delete_with_audio` 里叠加。
pub fn run_batch_delete(db: &crate::db::Db, ids: Vec<i64>) -> Result<BatchSessionDeleteResult, String> {
    let uniq = validated_ids(&ids)?;
    let deleted = db
        .delete_sessions_batch(&uniq)
        .map_err(|e| e.to_string())?;
    Ok(BatchSessionDeleteResult { deleted })
}

/// 批量删除的**完整**编排：DB 原子删除 + 音频级联清理（命令入口与单测共用）。
///
/// @ai-context: 分层与顺序——先 `run_batch_delete`（任何校验/DB 失败**早退**，文件一个不动：
///              会话还在，音频必须还在），再清音频（失败只登记不上抛）。
/// @ai-context: 为什么重复校验一次（`run_batch_delete` 内部已校验）：校验是纯函数、幂等、
///              O(n)（n ≤ 200 上限），重算一次换来 DB 核心**签名零改动**（既有用例零改动），
///              而这里需要**去重后的 id 集**来定位音频文件（`uniq` 不再回传）。
/// @ai-context: 返回值的 `deleted` 只数**会话行**，不含文件——IPC 契约（
///              `BatchSessionDeleteResult` 的线格式）逐字不变 ⇒ 前端零改动。
pub fn run_batch_delete_with_audio(
    db: &crate::db::Db,
    data_dir: &std::path::Path,
    ids: Vec<i64>,
) -> Result<BatchSessionDeleteResult, String> {
    let uniq = validated_ids(&ids)?;
    let result = run_batch_delete(db, ids)?;
    crate::commands_session::session_audio_purge::purge_session_audio(data_dir, &uniq)
        .report("batch_delete_sessions", &uniq);
    Ok(result)
}

/// 批量删除会话（批 4：单事务原子——全删或全不删，不再逐条半删）。
///
/// @ai-context: 域广播与单条 delete_session 完全一致：确有删除（deleted>0）
///              才广播 sessions + notes 域（会话删除级联断笔记关联）；
///              全不存在/全空结果不广播（无变化不打扰订阅端）。
/// @ai-context: T28：编排体换成 `run_batch_delete_with_audio`（同一 DB 语义 + 音频清理）。
#[tauri::command]
pub async fn batch_delete_sessions(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<BatchSessionDeleteResult, String> {
    let result = run_batch_delete_with_audio(&state.db, &state.data_dir, ids)?;
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
