//! 学习目标里程碑与目标↔组绑定写入域（同名目标的从属对象写入）。
//!
//! @ai-context: 从 commands_goals.rs 拆出（≤300 行约束 / AGENTS.md §3）。
//!              本文件 7 条命令**全部广播 `DataDomain::Goals`**（REQ-278 前端刷新
//!              的唯一触发源），共 **6 处** emit：`add_goal_milestone` 是**唯一无条件**
//!              发的一位（新增即变），其余 5 条包在 `if ok { … }` 里（未落库不发）。
//!              搬动时**禁止**改域名、禁止去掉/加上 `if ok` 条件——缩进层级即语义。
//! @ai-context: inner 函数统一收 &Db（commands_groups/commands_settlement 先例）
//!              ——内存库单测直连，不构造重量级 AppState。
//! @ai-context: 既有缺陷只搬不改：`update_goal_milestone`/`delete_goal_milestone` 无 inner、
//!              直接在命令壳里操作 `state.db`；`goal_milestone_done` 埋点 `let _ =` 吞错。

use tauri::State;

use crate::commands::{normalize_title, AppState};
use crate::commands_goals::require_goal;
use crate::db::Db;
use crate::goal_schema::{
    GoalMilestone, NewMilestone, CRITERIA_GROUP_SETTLED, CRITERIA_MANUAL, MILESTONE_DONE,
    MILESTONE_IN_PROGRESS, MILESTONE_PENDING, MILESTONE_SKIPPED,
};

/// 里程碑状态白名单（TEXT 无 CHECK 惯例——命令层白名单先例）。
const MILESTONE_STATUSES: [&str; 4] =
    [MILESTONE_PENDING, MILESTONE_IN_PROGRESS, MILESTONE_DONE, MILESTONE_SKIPPED];

/// 里程碑判据类型白名单（self_test 仅登记占位契约——CRITERIA_SELF_TEST 常量
/// 供 M3 真实化后启用；本版不写入）。
const CRITERIA_TYPES: [&str; 2] = [CRITERIA_MANUAL, CRITERIA_GROUP_SETTLED];

/// 里程碑草案建议（宣言页预填；前端薄——单一事实源在 goal_interview.rs）。
#[tauri::command]
pub fn suggest_goal_milestones(
    _state: State<'_, AppState>,
    level: Option<String>,
    weekly_commitment: Option<String>,
) -> Vec<crate::goal_schema::MilestoneDraft> {
    crate::goal_interview::suggest_milestones(level.as_deref(), weekly_commitment.as_deref())
}

/// 里程碑增删改与状态流转（status → done 记 goal_milestone_done）。
#[tauri::command]
pub fn add_goal_milestone(
    state: State<'_, AppState>,
    goal_id: i64,
    title: String,
    due_at: Option<i64>,
    criteria_type: Option<String>,
    ref_group_id: Option<i64>,
) -> Result<GoalMilestone, String> {
    let m = add_goal_milestone_inner(&state.db, goal_id, &title, due_at, criteria_type, ref_group_id)?;
    // REQ-278：里程碑新增 → 广播 goals 域
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    Ok(m)
}

#[tauri::command]
pub fn update_goal_milestone(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    due_at: Option<i64>,
) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的里程碑 id".to_string());
    }
    let title = normalize_title(title, "未命名里程碑");
    let ok = state.db.update_milestone(id, &title, due_at).map_err(|e| e.to_string())?;
    // REQ-278：里程碑更新 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

#[tauri::command]
pub fn delete_goal_milestone(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的里程碑 id".to_string());
    }
    let ok = state.db.delete_milestone(id).map_err(|e| e.to_string())?;
    // REQ-278：里程碑删除 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

#[tauri::command]
pub fn set_goal_milestone_status(state: State<'_, AppState>, id: i64, status: String) -> Result<bool, String> {
    let ok = set_goal_milestone_status_inner(&state.db, id, &status)?;
    // REQ-278：里程碑状态流转 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

/// 绑定/解绑组（N:M——一组可服务多目标；组仍是唯一容器）。
#[tauri::command]
pub fn bind_goal_group(state: State<'_, AppState>, goal_id: i64, group_id: i64) -> Result<bool, String> {
    let ok = bind_goal_group_inner(&state.db, goal_id, group_id)?;
    // REQ-278：绑组（N:M）→ 广播 goals 域（组侧服务标随目标页刷新）
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

#[tauri::command]
pub fn unbind_goal_group(state: State<'_, AppState>, goal_id: i64, group_id: i64) -> Result<bool, String> {
    let ok = unbind_goal_group_inner(&state.db, goal_id, group_id)?;
    // REQ-278：解绑组 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

pub(crate) fn add_goal_milestone_inner(
    db: &Db,
    goal_id: i64,
    title: &str,
    due_at: Option<i64>,
    criteria_type: Option<String>,
    ref_group_id: Option<i64>,
) -> Result<GoalMilestone, String> {
    require_goal(db, goal_id)?;
    let criteria_type = criteria_type.unwrap_or_else(|| CRITERIA_MANUAL.to_string());
    if !CRITERIA_TYPES.contains(&criteria_type.as_str()) {
        return Err(format!("不支持的里程碑判据类型: {}（支持: {}）", criteria_type, CRITERIA_TYPES.join("/")));
    }
    if criteria_type == CRITERIA_GROUP_SETTLED {
        let gid = ref_group_id.ok_or_else(|| "group_settled 型里程碑必须绑定组".to_string())?;
        if db.get_group(gid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("笔记组不存在: {}", gid));
        }
    }
    db.add_milestone(goal_id, &NewMilestone {
        title: normalize_title(title.to_string(), "未命名里程碑"),
        due_at,
        order_idx: 0,
        criteria_type,
        ref_group_id,
    })
    .map_err(|e| e.to_string())
}

pub(crate) fn set_goal_milestone_status_inner(db: &Db, id: i64, status: &str) -> Result<bool, String> {
    if !MILESTONE_STATUSES.contains(&status) {
        return Err(format!("不支持的里程碑状态: {}（支持: {}）", status, MILESTONE_STATUSES.join("/")));
    }
    // 取旧状态（幂等埋点判据：仅「未完成 → 完成」的转变记 goal_milestone_done）
    let prev = db
        .get_milestone(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("里程碑不存在: {}", id))?;
    let was_done = prev.status == MILESTONE_DONE;
    let ok = db.set_milestone_status(id, status).map_err(|e| e.to_string())?;
    if !ok {
        return Err(format!("里程碑不存在: {}", id));
    }
    if !was_done && status == MILESTONE_DONE {
        let payload = serde_json::json!({ "milestoneId": id }).to_string();
        let _ = db.add_metric_event("goal_milestone_done", &payload);
    }
    Ok(true)
}

pub(crate) fn bind_goal_group_inner(db: &Db, goal_id: i64, group_id: i64) -> Result<bool, String> {
    require_goal(db, goal_id)?;
    if db.get_group(group_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("笔记组不存在: {}", group_id));
    }
    db.bind_group(goal_id, group_id).map_err(|e| e.to_string())
}

pub(crate) fn unbind_goal_group_inner(db: &Db, goal_id: i64, group_id: i64) -> Result<bool, String> {
    require_goal(db, goal_id)?;
    db.unbind_group(goal_id, group_id).map_err(|e| e.to_string())
}
