//! 学习目标 commands（v0.18.0 REQ-248~250；意图层系统层）。
//!
//! @ai-context: 本层只做参数校验、调用数据层/纯函数、错误映射（AGENTS.md §6）。
//!              访谈校验：第 1/3 问必答（访谈模式 tier+scenario 缺一即拒）；
//!              快速模式（tier=None）判据走默认档——「访谈绝不允许变成负担」。
//! @ai-context: 埋点（metrics_events kind 扩展契约）：goal_created /
//!              goal_milestone_done（M1 写）；self_test_passed/failed 仅登记
//!              占位契约（M3 真实化），本版不写。
//! @ai-context: inner 函数统一收 &Db（commands_groups/commands_settlement 先例）
//!              ——内存库单测直连，不构造重量级 AppState。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::{normalize_title, AppState};
use crate::db::{unix_seconds, Db};
use crate::goal_interview::{
    assemble_declaration, derive_criteria, horizon_end_secs,
};
use crate::goal_progress::{build_report, progress_statement, GoalProgressReport, GoalSignals};
use crate::goal_rules::graduation_readiness;
use crate::goal_schema::{
    Goal, GoalIntent, GoalMilestone, NewGoal, NewMilestone, SuccessCriteria, CRITERIA_GROUP_SETTLED,
    CRITERIA_MANUAL, MILESTONE_DONE, MILESTONE_IN_PROGRESS, MILESTONE_PENDING, MILESTONE_SKIPPED,
    TIER_DEFAULT,
};
use crate::video_profile_domain::DomainKind;

/// 一周秒数（草案 due_at 换算：第 N 周 = created_at + N*7d）。
const WEEK_SECS: i64 = 7 * 86_400;
/// 访谈答案文本上限（防御超大 payload；chips/填空兜底的答案均为短文本）。
const INTENT_FIELD_MAX: usize = 200;

/// 新建目标入参（前端访谈结果全量提交；serde camelCase 契约）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalCreateInput {
    pub name: String,
    #[serde(default)]
    pub domain_tag: Option<String>,
    /// 时限（3m/6m/none/2w；None=未填）
    #[serde(default)]
    pub horizon: Option<String>,
    /// 判据档位（None=快速模式→默认档）
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub scenario: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub driver: Option<String>,
    #[serde(default)]
    pub criteria_statement: Option<String>,
    #[serde(default)]
    pub non_scope: Option<String>,
    #[serde(default)]
    pub weekly_commitment: Option<String>,
    #[serde(default)]
    pub obstacles: Option<String>,
    /// 初始绑定组（访谈第 4 步预勾选）
    #[serde(default)]
    pub group_ids: Vec<i64>,
    /// 里程碑草案（宣言页预填可删改；due_weeks=0 无期限）
    #[serde(default)]
    pub milestones: Vec<GoalMilestoneInput>,
}

/// 里程碑草案输入。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalMilestoneInput {
    pub title: String,
    #[serde(default)]
    pub due_weeks: usize,
}

/// 目标卡视图（列表项：单行折叠=名称/状态/一句话进度/可毕业徽标）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalCardView {
    pub goal: Goal,
    /// 一句话进度（"62% · 里程碑 2/4"）
    pub statement: String,
    pub percent: f64,
    pub milestone_done: usize,
    pub milestone_total: usize,
    /// 🎓 可毕业（判据配方全达标——状态必须 active）
    pub ready: bool,
}

/// 目标详情视图（详情页一次取全：里程碑/组/判据/进度/可毕业）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalDetailView {
    pub goal: Goal,
    /// 判据检查（可毕业明细——毕业确认仪式数据源）
    pub criteria: Vec<ReadinessView>,
    pub progress: GoalProgressView,
    pub milestones: Vec<GoalMilestone>,
    pub groups: Vec<GoalGroupView>,
    /// 宣言回显（重新访谈/详情页展示）
    pub declaration: String,
}

/// 目标绑定组视图（详情关联组区）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalGroupView {
    pub id: i64,
    pub name: String,
}

/// 判据检查视图。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadinessView {
    pub label: String,
    pub met: bool,
    pub detail: String,
}

/// 进度视图（现算信号 + 一句话进度 + 可毕业判定）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgressView {
    pub progress: GoalProgressReport,
    pub statement: String,
    pub ready: bool,
    pub checks: Vec<ReadinessView>,
}

/// 新建目标（访谈确认后一步创建——status=active，无 draft 仪式）。
#[tauri::command]
pub fn create_goal(state: State<'_, AppState>, input: GoalCreateInput) -> Result<Goal, String> {
    let goal = create_goal_inner(&state.db, &input)?;
    // REQ-278：目标创建 → 广播 goals 域
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    Ok(goal)
}

/// 全部目标卡（列表；每卡现算进度——聚合皆毫秒级查询）。
#[tauri::command]
pub fn list_goals(state: State<'_, AppState>) -> Result<Vec<GoalCardView>, String> {
    list_goals_inner(&state.db)
}

/// 目标详情（里程碑/绑定组/判据/进度一次取全）。
#[tauri::command]
pub fn get_goal_detail(state: State<'_, AppState>, id: i64) -> Result<GoalDetailView, String> {
    get_goal_detail_inner(&state.db, id)
}

/// 进度刷新（详情页动作后局部刷新；与 get_goal_detail 同口径）。
#[tauri::command]
pub fn get_goal_progress(state: State<'_, AppState>, id: i64) -> Result<GoalProgressView, String> {
    get_goal_progress_inner(&state.db, id)
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

// ─────────────────────────── inner（供测试与复用） ───────────────────────────

/// 里程碑状态白名单（TEXT 无 CHECK 惯例——命令层白名单先例）。
const MILESTONE_STATUSES: [&str; 4] =
    [MILESTONE_PENDING, MILESTONE_IN_PROGRESS, MILESTONE_DONE, MILESTONE_SKIPPED];

/// 里程碑判据类型白名单（self_test 仅登记占位契约——CRITERIA_SELF_TEST 常量
/// 供 M3 真实化后启用；本版不写入）。
const CRITERIA_TYPES: [&str; 2] = [CRITERIA_MANUAL, CRITERIA_GROUP_SETTLED];

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

pub(crate) fn list_goals_inner(db: &Db) -> Result<Vec<GoalCardView>, String> {
    let goals = db.list_goals().map_err(|e| e.to_string())?;
    let mut cards = Vec::new();
    for goal in goals {
        let (statement, percent, done, total, ready) = goal_card_metrics(db, &goal)?;
        cards.push(GoalCardView {
            goal,
            statement,
            percent,
            milestone_done: done,
            milestone_total: total,
            ready,
        });
    }
    Ok(cards)
}

pub(crate) fn get_goal_detail_inner(db: &Db, id: i64) -> Result<GoalDetailView, String> {
    require_goal(db, id)?;
    let goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    let milestones = db.list_milestones(id).map_err(|e| e.to_string())?;
    let group_ids = db.list_goal_group_ids(id).map_err(|e| e.to_string())?;
    let mut groups = Vec::new();
    for gid in group_ids {
        if let Some(g) = db.get_group(gid).map_err(|e| e.to_string())? {
            groups.push(GoalGroupView { id: gid, name: g.name });
        }
    }
    let signals = collect_signals(db, id)?;
    let progress = build_report(&signals);
    let statement = progress_statement(&progress);
    let criteria = parse_criteria(&goal)?;
    let ready = graduation_readiness(&goal.status, &progress, &criteria);
    let intent: GoalIntent = serde_json::from_str(&goal.intent_json).unwrap_or_default();
    let declaration = assemble_declaration(
        &goal.name,
        intent.scenario.as_deref(),
        intent.criteria_statement.as_deref(),
        &criteria.statement,
        intent.non_scope.as_deref(),
        intent.horizon.as_deref(),
    );
    Ok(GoalDetailView {
        goal,
        criteria: ready.checks.into_iter().map(client_check).collect(),
        progress: GoalProgressView {
            progress,
            statement,
            ready: ready.ready,
            checks: vec![],
        },
        milestones,
        groups,
        declaration,
    })
}

pub(crate) fn get_goal_progress_inner(db: &Db, id: i64) -> Result<GoalProgressView, String> {
    require_goal(db, id)?;
    let goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    let signals = collect_signals(db, id)?;
    let progress = build_report(&signals);
    let statement = progress_statement(&progress);
    let criteria = parse_criteria(&goal)?;
    let ready = graduation_readiness(&goal.status, &progress, &criteria);
    Ok(GoalProgressView {
        progress,
        statement,
        ready: ready.ready,
        checks: ready.checks.into_iter().map(client_check).collect(),
    })
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

/// 领域标签校验（与 commands_groups 同口径：kebab-case 白名单；空 → None）。
fn parse_domain(domain_tag: Option<&str>) -> Result<Option<String>, String> {
    match domain_tag {
        Some(t) if !t.trim().is_empty() => DomainKind::parse(t.trim())
            .map(|k| Some(k.as_str().to_string()))
            .ok_or_else(|| format!("不支持的领域标签: {}", t)),
        _ => Ok(None),
    }
}

/// 空白串归一为 None（访谈答案「跳过/以后想」的存储语义：不落空串）。
fn trimmed(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string)
}

/// 访谈答案：空白归一 + 长度截断（防超大 payload 入库；truncate 保留前 200 字）。
fn bounded(s: Option<&str>) -> Option<String> {
    trimmed(s).map(|v| v.chars().take(INTENT_FIELD_MAX).collect())
}

/// 访谈答案 → GoalIntent（全部可选字段过 bounded 归一）。
fn build_intent(input: &GoalCreateInput) -> GoalIntent {
    GoalIntent {
        scenario: bounded(input.scenario.as_deref()),
        level: bounded(input.level.as_deref()),
        driver: bounded(input.driver.as_deref()),
        criteria_statement: bounded(input.criteria_statement.as_deref()),
        horizon: bounded(input.horizon.as_deref()),
        non_scope: bounded(input.non_scope.as_deref()),
        weekly_commitment: bounded(input.weekly_commitment.as_deref()),
        obstacles: bounded(input.obstacles.as_deref()),
    }
}

/// 目标卡指标（现算；判据 JSON 损坏 → ready=false 诚实降级不崩溃）。
fn goal_card_metrics(db: &Db, goal: &Goal) -> Result<(String, f64, usize, usize, bool), String> {
    let signals = collect_signals(db, goal.id)?;
    let progress = build_report(&signals);
    let ready = match parse_criteria(goal) {
        Ok(criteria) => graduation_readiness(&goal.status, &progress, &criteria).ready,
        Err(_) => false,
    };
    Ok((
        progress_statement(&progress),
        progress.percent,
        progress.milestone_done,
        progress.milestone_total,
        ready,
    ))
}

/// 进度信号收集（详情/列表共用——口径单一；lifecycle 命令组复用）。
pub(crate) fn collect_signals(db: &Db, goal_id: i64) -> Result<GoalSignals, String> {
    db.goal_progress_signals(goal_id, unix_seconds()).map_err(|e| e.to_string())
}

/// 判据 JSON 解析（损坏 → 错误——调用方降级 ready=false；不静默空白）。
pub(crate) fn parse_criteria(goal: &Goal) -> Result<SuccessCriteria, String> {
    serde_json::from_str(&goal.success_criteria_json).map_err(|e| e.to_string())
}

/// ReadinessCheck → 客户端视图。
fn client_check(c: crate::goal_rules::ReadinessCheck) -> ReadinessView {
    ReadinessView { label: c.label, met: c.met, detail: c.detail }
}

#[cfg(test)]
#[path = "commands_goals_tests.rs"]
mod tests;
