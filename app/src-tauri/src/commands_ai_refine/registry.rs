//! AI 任务注册表 + 任务 id 序列（批 0-C3 Task 4 拆分，原 commands_ai_refine.rs
//! 35–49 + 573–642 行）。
//!
//! @ai-context: 全任务族（refine / enrich / note_refine / proofread / goal_plan）共用的
//!              进程内设施：任务状态与结果的注册表（AppState.ai_tasks）、单调 id
//!              序列（AppState.ai_task_seq）、容量守卫、以及**状态唯一写入口**
//!              set_task（4 个模块调用）。装配入口 task_registry / task_seq 由
//!              app_setup.rs 调用。
//! @ai-context: 副作用：set_task 在持 ai_tasks 锁内 emit("ai:task-update")
//!              （事件名与参数逐字未变）；锁中毒时静默不动作（既有口径，只搬不改）。
//! @ai-context: 边界：task_seq_lower_bound 的 saturating_add、claim_task_id 的
//!              Ordering::Relaxed、task_seq() 初值 1 是跨族 id 唯一性的根据
//!              （违反会被 insert_ai_task 的 INSERT OR REPLACE 静默顶替历史行）——
//!              逐字保留，不做"顺手现代化"。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::Emitter;

use crate::ai_task::AiTaskState;
use crate::commands::AppState;

/// 任务注册表容量上限（防无界增长：超限丢弃最旧终态任务）。
const TASKS_CAP: usize = 100;

/// 任务条目（注册表内：状态 + 成功结果）。
///
/// @ai-context: result 为序列化 JSON——精修（AiRefineResult）/补充
///              （AiEnrichResult，M3）共用同一任务注册表（REQ-145 基建复用），
///              各命令层自行反序列化。
pub struct AiTaskEntry {
    pub state: AiTaskState,
    pub result: Option<serde_json::Value>,
    /// 任务目标（去重粒度：精修=session_id、补充=note_id——审查修复
    /// 2026-08-21：原实现按全表 any 检查，会话 A 精修中时会话 B 也被拒）
    pub target_id: i64,
}

/// 更新任务状态并推送事件（短锁内完成即释放）。M3 补充任务复用（pub(crate)）。
pub(crate) fn set_task(st: &AppState, task_id: u64, new_state: AiTaskState) {
    if let Ok(mut tasks) = st.ai_tasks.lock() {
        if let Some(entry) = tasks.get_mut(&task_id) {
            entry.state = new_state.clone();
            let _ = st.app.emit("ai:task-update", (task_id, &new_state));
        }
    }
}

/// 注册表容量守卫（超限丢弃最旧终态任务——防无界增长）。M3 补充任务复用。
///
/// @ai-context: 审查修复（2026-08-21）：原实现终态任务数 < excess 时删不完
///              （并行 Running 占满时 len 持续 > CAP）——改为 while 循环，
///              无终态可删时停止（Running 任务不可删——任务执行中）。
pub(crate) fn trim_tasks(tasks: &mut HashMap<u64, AiTaskEntry>) {
    while tasks.len() > TASKS_CAP {
        let oldest_terminal = tasks
            .iter()
            .filter(|(_, t)| !matches!(t.state, AiTaskState::Pending | AiTaskState::Running { .. }))
            .min_by_key(|(id, _)| **id)
            .map(|(id, _)| *id);
        match oldest_terminal {
            Some(id) => {
                tasks.remove(&id);
            }
            None => break,
        }
    }
}

/// 任务序列（AppState 装配）。
pub fn task_seq() -> Arc<AtomicU64> {
    Arc::new(AtomicU64::new(1))
}

/// id 序列下限（纯函数）：取「当前值」与「DB 最大 task_id + 1」之大。
///
/// @ai-context Why（2026-09-09 批 1 修复）：启动恢复后序列必须越过 **DB
///              全表** 最大 id——恢复集只含未采纳成功任务，已采纳/failed/
///              proofread/goal_plan 行 id 更大时，若只按恢复集推进，新任务
///              将复用历史 task_id 并被 insert_ai_task 的 INSERT OR REPLACE
///              静默顶替（历史行含已采纳——数据丢失）。saturating 防极端 id
///              溢出；序列只前进不回退（当前值更大时保持）。
pub fn task_seq_lower_bound(current: u64, db_max_task_id: u64) -> u64 {
    current.max(db_max_task_id.saturating_add(1))
}

/// 认领下一个 AI 任务 id（全任务族唯一分配点——proofread/refine/enrich/
/// note_refine/goal_plan 共用的单调序列，返回值即 task_id，推进量=认领量）。
///
/// @ai-context Why（2026-09-09 批 2 审查修复）：proofread 原写作
///              fetch_add(1, SeqCst) + 1（+1 存量来源 1904c2c7——按「0 起
///              序列」直觉，但 task_seq() 初值 1 且其余族均以 fetch_add
///              返回值直接作 id）。fetch_add(1)+1 只把计数器推进 1 却领走
///              后值：紧邻的下一次认领（任意其他族）恰好拿到同一 id →
///              insert_ai_task 的 INSERT OR REPLACE 运行期顶替先落库行
///              （running 记账/结果/成本丢行）。统一本函数分配：认领严格
///              单调、相邻认领永不相交。Relaxed 即足——唯一性由 fetch_add
///              原子读-改-写保证，无需跨线程同步排序（与启动序列下限
///              fetch_update 及 enrich/note_refine/goal_plan 现场同式内联
///              的 Relaxed 同档，口径一致）。
pub fn claim_task_id(seq: &AtomicU64) -> u64 {
    seq.fetch_add(1, Ordering::Relaxed)
}

/// 任务注册表（AppState 装配）。
pub fn task_registry() -> Arc<Mutex<HashMap<u64, AiTaskEntry>>> {
    Arc::new(Mutex::new(HashMap::new()))
}
