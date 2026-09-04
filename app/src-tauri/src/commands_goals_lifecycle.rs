//! 学习目标生命周期 commands（v0.18.1 REQ-255~257；毕业仪式/回顾流/放弃/档案）。
//!
//! @ai-context: 拆自 commands_goals.rs（该文件逼近 600 硬限——M2 四命令组独立成域：
//!              毕业仪式/回顾流/放弃/毕业档案）。毕业＝用户确认仪式：本层只做
//!              守卫（判据未达标/重复毕业/终态拒绝）+ 组装报告快照 + 状态归档 +
//!              埋点——纯函数组装在 goal_retro.rs，取数在 db_goals.rs。
//! @ai-context: 报告快照独立于 goals 行（目标删除后仍可读——毕业档案区；
//!              FK SET NULL 保历史，同 notes_versions「回滚不破坏历史」哲学）。

use serde::Serialize;
use tauri::State;

use crate::commands::AppState;
use crate::db::{unix_seconds, Db};
use crate::goal_progress::{build_report, GoalProgressReport};
use crate::goal_retro::{
    assemble_report, assemble_retro, GraduationReport, MilestoneSnapshot, ReportSignals, RetroEntry,
};
use crate::goal_rules::{can_transition, graduation_readiness};
use crate::goal_schema::{Goal, GOAL_ABANDONED, GOAL_GRADUATED};

/// 放弃原因文本上限（可选原因——防超大 payload）。
const ABANDON_REASON_MAX: usize = 200;

/// 回顾流视图（时间线现算 + 毕业报告（如已毕业——快照永久保留））。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalRetroView {
    pub status: String,
    pub entries: Vec<RetroEntry>,
    pub graduation: Option<GraduationReport>,
}

/// 毕业仪式（goal_settle——信号达标 + 用户确认后执行）。
#[tauri::command]
pub fn goal_settle(state: State<'_, AppState>, id: i64) -> Result<GraduationReport, String> {
    let report = goal_settle_inner(&state.db, id)?;
    // REQ-278：毕业 = 目标状态机跃迁 → 广播 goals 域
    crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    Ok(report)
}

/// 回顾流（创建→里程碑→组结算→毕业；全现算零双写）。
#[tauri::command]
pub fn goal_retro(state: State<'_, AppState>, id: i64) -> Result<GoalRetroView, String> {
    goal_retro_inner(&state.db, id)
}

/// 放弃（显式动作 + 可选原因——无惩罚文案；终态拒绝）。
#[tauri::command]
pub fn goal_abandon(state: State<'_, AppState>, id: i64, reason: Option<String>) -> Result<bool, String> {
    let ok = goal_abandon_inner(&state.db, id, reason.as_deref())?;
    // REQ-278：放弃 = 目标状态机跃迁 → 广播 goals 域
    if ok {
        crate::notify::emit_changed(&state.app, crate::notify::DataDomain::Goals);
    }
    Ok(ok)
}

/// 毕业档案（全部报告——已删目标的报告仍在此处可读）。
#[tauri::command]
pub fn list_goal_graduations(state: State<'_, AppState>) -> Result<Vec<GraduationReport>, String> {
    list_goal_graduations_inner(&state.db)
}

pub(crate) fn goal_settle_inner(db: &Db, id: i64) -> Result<GraduationReport, String> {
    crate::commands_goals::require_goal(db, id)?;
    let goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    // 守卫①：状态机——毕业仅从 active 发起（已毕业/放弃/暂停均拒绝）
    if !can_transition(&goal.status, GOAL_GRADUATED) {
        return Err(format!("非法毕业状态转移: {}（毕业仅从进行中发起）", goal.status));
    }
    // 守卫②：判据——未达标不可毕业（毕业确认仪式不豁免信号）
    let progress: GoalProgressReport =
        build_report(&crate::commands_goals::collect_signals(db, id)?);
    let criteria = crate::commands_goals::parse_criteria(&goal)?;
    let ready = graduation_readiness(&goal.status, &progress, &criteria);
    if !ready.ready {
        let missing: Vec<String> = ready
            .checks
            .iter()
            .filter(|c| !c.met)
            .map(|c| format!("{}（{}）", c.label, c.detail))
            .collect();
        return Err(format!("毕业判据未全部满足：{}", missing.join("；")));
    }
    // 组装报告快照（毕业后冻结）
    let milestones: Vec<MilestoneSnapshot> = db
        .list_milestones(id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|m| MilestoneSnapshot { title: m.title, status: m.status, completed_at: m.completed_at })
        .collect();
    let report = assemble_report(ReportSignals {
        goal_id: goal.id,
        goal_name: goal.name.clone(),
        graduated_at: unix_seconds(),
        milestones,
        group_settlements: db.goal_settlements_snapshot(id).map_err(|e| e.to_string())?,
        review_stats: db.goal_review_stats(id, unix_seconds()).map_err(|e| e.to_string())?,
        artifacts: db.goal_artifacts(id).map_err(|e| e.to_string())?,
        criteria_statement: criteria.statement,
    });
    // 落库：快照（独立保留）→ 状态归档 → 埋点
    let json = serde_json::to_string(&report).map_err(|e| e.to_string())?;
    db.create_graduation_report(goal.id, &goal.name, &json).map_err(|e| e.to_string())?;
    db.set_goal_status(goal.id, GOAL_GRADUATED).map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "goalId": goal.id, "name": goal.name }).to_string();
    let _ = db.add_metric_event("goal_graduated", &payload);
    Ok(report)
}

pub(crate) fn goal_retro_inner(db: &Db, id: i64) -> Result<GoalRetroView, String> {
    crate::commands_goals::require_goal(db, id)?;
    let goal: Goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    let milestones: Vec<MilestoneSnapshot> = db
        .list_milestones(id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|m| MilestoneSnapshot { title: m.title, status: m.status, completed_at: m.completed_at })
        .collect();
    let settlements = db.goal_settlements_snapshot(id).map_err(|e| e.to_string())?;
    let graduation = db
        .get_graduation_report_json(id)
        .map_err(|e| e.to_string())?
        .map(|json| serde_json::from_str::<GraduationReport>(&json).map_err(|e| e.to_string()))
        .transpose()?;
    let entries = assemble_retro(goal.created_at, &milestones, &settlements, graduation.as_ref());
    Ok(GoalRetroView { status: goal.status, entries, graduation })
}

pub(crate) fn goal_abandon_inner(db: &Db, id: i64, reason: Option<&str>) -> Result<bool, String> {
    crate::commands_goals::require_goal(db, id)?;
    let goal: Goal = db
        .get_goal(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("目标不存在: {}", id))?;
    // 守卫：active/paused → abandoned（终态拒绝——毕业/已放弃不可再放弃）
    if !can_transition(&goal.status, GOAL_ABANDONED) {
        return Err(format!("非法放弃状态转移: {}（进行中/已暂停可放弃；毕业/已放弃为终态）", goal.status));
    }
    let reason = reason.map(str::trim).filter(|r| !r.is_empty()).map(|r| {
        r.chars().take(ABANDON_REASON_MAX).collect::<String>()
    });
    db.set_goal_status(goal.id, GOAL_ABANDONED).map_err(|e| e.to_string())?;
    // 埋点：原因入 payload（可选；审计可查——无惩罚性状态，仅留痕）
    let payload = serde_json::json!({ "goalId": goal.id, "reason": reason }).to_string();
    let _ = db.add_metric_event("goal_abandoned", &payload);
    Ok(true)
}

pub(crate) fn list_goal_graduations_inner(db: &Db) -> Result<Vec<GraduationReport>, String> {
    let jsons = db.list_graduation_reports_json().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for json in jsons {
        match serde_json::from_str::<GraduationReport>(&json) {
            Ok(report) => out.push(report),
            // 审查修复：单条快照损坏不阻塞档案区（跳过+日志——归档可读性优先）
            Err(e) => eprintln!("[Goal] 毕业报告快照损坏跳过（id 不可定位，保留原文供排查）: {}", e),
        }
    }
    Ok(out)
}

#[cfg(test)]
#[path = "commands_goals_lifecycle_tests.rs"]
mod tests;
