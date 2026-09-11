//! 学习目标读侧视图层（列表/详情/进度——纯查询 + 视图装配）。
//!
//! @ai-context: 从 commands_goals.rs 拆出（≤300 行约束 / AGENTS.md §3）。
//!              本文件命令**均为读命令，0 处 emit**：读不改变数据，
//!              goals 域刷新（REQ-278）由写入侧命令统一广播
//!              （父文件 5 处 + commands_goals_milestones.rs 6 处）。
//! @ai-context: inner 函数统一收 &Db（commands_groups/commands_settlement 先例）
//!              ——内存库单测直连，不构造重量级 AppState。
//! @ai-context: 两处**刻意不同**的 checks 口径（严禁「顺手统一」）：
//!              get_goal_detail_inner 把判据上提为顶层 criteria 并把
//!              progress.checks 置空；get_goal_progress_inner 则留在 progress.checks。
//!              判据 JSON 损坏 → goal_card_metrics 降级 ready=false（诚实降级不崩溃）。

use serde::Serialize;
use tauri::State;

use crate::commands::AppState;
use crate::commands_goals::{collect_signals, parse_criteria, require_goal};
use crate::db::Db;
use crate::goal_interview::assemble_declaration;
use crate::goal_progress::{build_report, progress_statement, GoalProgressReport};
use crate::goal_rules::{graduation_readiness, ReadinessCheck};
use crate::goal_schema::{Goal, GoalIntent, GoalMilestone};

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

/// ReadinessCheck → 客户端视图。
fn client_check(c: ReadinessCheck) -> ReadinessView {
    ReadinessView { label: c.label, met: c.met, detail: c.detail }
}
