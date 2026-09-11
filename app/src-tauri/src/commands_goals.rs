//! 学习目标 commands（v0.18.0 REQ-248~250；意图层系统层）。
//!
//! @ai-context: 本层只做参数校验、调用数据层/纯函数、错误映射（AGENTS.md §6）。
//!              访谈校验：第 1/3 问必答（访谈模式 tier+scenario 缺一即拒）；
//!              快速模式（tier=None）判据走默认档——「访谈绝不允许变成负担」。
//! @ai-context: 埋点（metrics_events kind 扩展契约）：goal_created（本文件写）/
//!              goal_milestone_done（commands_goals_milestones.rs 写）；
//!              self_test_passed/failed 仅登记
//!              占位契约（M3 真实化），本版不写。
//! @ai-context: inner 函数统一收 &Db（commands_groups/commands_settlement 先例）
//!              ——内存库单测直连，不构造重量级 AppState。
//! @ai-context: 职责分布（批 0-C3 Task 6 拆出 3 个平铺子模块，`#[path]` 由本文件自己
//!              声明 ⇒ lib.rs 的 `mod commands_goals;` 零改动）：读侧视图 → views；
//!              里程碑与目标↔组绑定写入 → milestones；访谈输入契约与归一 → intent。

use tauri::State;

use crate::commands::{normalize_title, AppState};
use crate::commands_goals::intent::{bounded, build_intent, parse_domain, GoalCreateInput};
use crate::db::{unix_seconds, Db};
use crate::goal_interview::{derive_criteria, horizon_end_secs};
use crate::goal_progress::GoalSignals;
use crate::goal_schema::{
    Goal, NewGoal, NewMilestone, SuccessCriteria, CRITERIA_MANUAL, TIER_DEFAULT,
};

/// 读侧视图层（5 个视图 DTO + 3 条读命令 + 3 个读 inner；0 emit）。
/// `pub(crate)`：注册清单在 app_commands.rs（crate 根的兄弟模块）按 `commands_goals::views::x` 解析。
#[path = "commands_goals_views.rs"]
pub(crate) mod views;

/// 里程碑与目标↔组绑定写入域（7 条命令 + 4 个 inner + 2 个白名单常量；6 emit）。
/// `pub(crate)`：同 `views`（注册路径三段式）且测试文件按 `commands_goals::milestones::x` 导入。
#[path = "commands_goals_milestones.rs"]
pub(crate) mod milestones;

/// 访谈输入契约与归一（2 个输入 DTO + 4 个纯助手；无命令、无 DB、无 IO）。
/// `pub(crate)`：父模块与 `commands_goals_lifecycle_tests.rs` / `_plan_tests.rs` 按名导入。
#[path = "commands_goals_intent.rs"]
pub(crate) mod intent;

/// 一周秒数（草案 due_at 换算：第 N 周 = created_at + N*7d）。
const WEEK_SECS: i64 = 7 * 86_400;

/// 新建目标（访谈确认后一步创建——status=active，无 draft 仪式）。
#[tauri::command]
pub fn create_goal(state: State<'_, AppState>, input: GoalCreateInput) -> Result<Goal, String> {
    let goal = create_goal_inner(&state.db, &input)?;
    // REQ-278：目标创建 → 广播 goals 域
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    Ok(goal)
}

/// 编辑目标（名称/领域/时限——重访谈走 update_goal_interview）。
#[tauri::command]
pub fn update_goal(
    state: State<'_, AppState>,
    id: i64,
    name: String,
    domain_tag: Option<String>,
    horizon: Option<String>,
) -> Result<bool, String> {
    let ok = update_goal_inner(&state.db, id, &name, domain_tag, horizon)?;
    // REQ-278：目标编辑 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

/// 重新访谈（答案可回溯编辑——配方重推：判据/意图整体重写）。
#[tauri::command]
pub fn update_goal_interview(
    state: State<'_, AppState>,
    id: i64,
    input: GoalCreateInput,
) -> Result<bool, String> {
    let ok = update_goal_interview_inner(&state.db, id, &input)?;
    // REQ-278：重访谈落库 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

/// 删除目标（里程碑/绑定 CASCADE；M1 无快照——毕业快照保留属 M2）。
#[tauri::command]
pub fn delete_goal(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let ok = delete_goal_inner(&state.db, id)?;
    // REQ-278：目标删除 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

/// 暂停/恢复（M1 只开放 active⇄paused；放弃/毕业随 M2 流程开放）。
#[tauri::command]
pub fn update_goal_status(state: State<'_, AppState>, id: i64, status: String) -> Result<bool, String> {
    let ok = update_goal_status_inner(&state.db, id, &status)?;
    // REQ-278：状态流转（暂停/恢复）→ 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

// ─────────────────────────── inner（供测试与复用） ───────────────────────────

/// 校验目标存在（id 合法 + 行存在）。
pub(crate) fn require_goal(db: &Db, id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("无效的目标 id".to_string());
    }
    if db.get_goal(id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("目标不存在: {}", id));
    }
    Ok(())
}

pub(crate) fn create_goal_inner(db: &Db, input: &GoalCreateInput) -> Result<Goal, String> {
    let name = normalize_title(input.name.clone(), "未命名目标");
    // 访谈校验：tier 与 scenario 同缺=快速模式；缺一=必答拦截（第 1/3 问必答）
    let tier_explicit = input.tier.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let tier = tier_explicit.unwrap_or(TIER_DEFAULT);
    let scenario = bounded(input.scenario.as_deref());
    if tier_explicit.is_some() && scenario.is_none() {
        return Err("第 1 问「学会以后想用它做什么？」必答".to_string());
    }
    let domain = parse_domain(input.domain_tag.as_deref())?;
    let now = unix_seconds();
    let non_scope = bounded(input.non_scope.as_deref());
    let criteria = derive_criteria(tier, non_scope.as_deref());
    // 边界校验：group_ids 逐组存在；草案 due_weeks 有界防溢出
    for gid in &input.group_ids {
        if db.get_group(*gid).map_err(|e| e.to_string())?.is_none() {
            return Err(format!("笔记组不存在: {}", gid));
        }
    }
    let mut milestones = Vec::new();
    for (idx, m) in input.milestones.iter().enumerate() {
        if m.due_weeks > 520 {
            return Err("里程碑期限超出合理范围（>10 年）".to_string());
        }
        milestones.push(NewMilestone {
            title: normalize_title(m.title.clone(), "未命名里程碑"),
            due_at: if m.due_weeks == 0 { None } else { Some(now + m.due_weeks as i64 * WEEK_SECS) },
            order_idx: idx as i64,
            criteria_type: CRITERIA_MANUAL.to_string(),
            ref_group_id: None,
        });
    }
    let intent = build_intent(input);
    let criteria_json = serde_json::to_string(&criteria).map_err(|e| e.to_string())?;
    let intent_json = serde_json::to_string(&intent).map_err(|e| e.to_string())?;
    let goal = db
        .create_goal(&NewGoal {
            name,
            domain_tag: domain,
            horizon_end: horizon_end_secs(input.horizon.as_deref(), now),
            success_criteria_json: criteria_json,
            intent_json,
            milestones,
            group_ids: input.group_ids.clone(),
        })
        .map_err(|e| e.to_string())?;
    // 埋点（北极星强化信号——目标从第一天记）
    let payload = serde_json::json!({ "goalId": goal.id, "name": goal.name, "tier": tier }).to_string();
    let _ = db.add_metric_event("goal_created", &payload);
    Ok(goal)
}

pub(crate) fn update_goal_inner(
    db: &Db,
    id: i64,
    name: &str,
    domain_tag: Option<String>,
    horizon: Option<String>,
) -> Result<bool, String> {
    require_goal(db, id)?;
    let goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    let domain = parse_domain(domain_tag.as_deref())?;
    let now = unix_seconds();
    // horizon 未填（None/空白）= 不改变时限锚点——防「改名顺手抹掉无期限锚点」
    let horizon_end = match horizon.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(_) => horizon_end_secs(horizon.as_deref(), now),
        None => goal.horizon_end,
    };
    db.update_goal_core(
        id,
        &normalize_title(name.to_string(), "未命名目标"),
        domain.as_deref(),
        horizon_end,
        &goal.success_criteria_json,
        &goal.intent_json,
    )
    .map_err(|e| e.to_string())
}

pub(crate) fn update_goal_interview_inner(db: &Db, id: i64, input: &GoalCreateInput) -> Result<bool, String> {
    require_goal(db, id)?;
    let goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    // 配方重推（答案可回溯编辑——判据/意图整体重写；绑组不变；名称随对话窗口
    // 一并生效——空名回退旧名，防「编辑态改名不落地」契约陷阱）
    let tier_explicit = input.tier.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let tier = tier_explicit.unwrap_or(TIER_DEFAULT);
    let scenario = bounded(input.scenario.as_deref());
    if tier_explicit.is_some() && scenario.is_none() {
        return Err("第 1 问「学会以后想用它做什么？」必答".to_string());
    }
    let non_scope = bounded(input.non_scope.as_deref());
    let criteria = derive_criteria(tier, non_scope.as_deref());
    let intent = build_intent(input);
    let name = normalize_title(input.name.clone(), &goal.name);
    let criteria_json = serde_json::to_string(&criteria).map_err(|e| e.to_string())?;
    let intent_json = serde_json::to_string(&intent).map_err(|e| e.to_string())?;
    let now = unix_seconds();
    db.update_goal_core(
        id,
        &name,
        goal.domain_tag.as_deref(),
        horizon_end_secs(input.horizon.as_deref(), now),
        &criteria_json,
        &intent_json,
    )
    .map_err(|e| e.to_string())
}

pub(crate) fn delete_goal_inner(db: &Db, id: i64) -> Result<bool, String> {
    require_goal(db, id)?;
    let deleted = db.delete_goal(id).map_err(|e| e.to_string())?;
    if !deleted {
        return Err(format!("目标不存在: {}", id));
    }
    Ok(true)
}

pub(crate) fn update_goal_status_inner(db: &Db, id: i64, status: &str) -> Result<bool, String> {
    require_goal(db, id)?;
    let goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    // M1 只开放 active⇄paused（状态机守卫总入口；放弃/毕业随 M2 流程）
    if status != "active" && status != "paused" {
        return Err(format!("v0.18.0 M1 仅支持暂停/恢复（收到 {}）", status));
    }
    if !crate::goal_rules::can_transition(&goal.status, status) {
        return Err(format!("非法状态转移: {} → {}", goal.status, status));
    }
    db.set_goal_status(id, status).map_err(|e| e.to_string())
}

/// 进度信号收集（详情/列表共用——口径单一；lifecycle 命令组复用）。
pub(crate) fn collect_signals(db: &Db, goal_id: i64) -> Result<GoalSignals, String> {
    db.goal_progress_signals(goal_id, unix_seconds()).map_err(|e| e.to_string())
}

/// 判据 JSON 解析（损坏 → 错误——调用方降级 ready=false；不静默空白）。
pub(crate) fn parse_criteria(goal: &Goal) -> Result<SuccessCriteria, String> {
    serde_json::from_str(&goal.success_criteria_json).map_err(|e| e.to_string())
}

#[cfg(test)]
#[path = "commands_goals_tests.rs"]
mod tests;
