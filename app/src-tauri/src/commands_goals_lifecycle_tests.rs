//! commands_goals_lifecycle 单测（毕业仪式守卫矩阵/回顾流/放弃/档案——内存库）。

use crate::commands_goals::{create_goal_inner, set_goal_milestone_status_inner, GoalCreateInput, GoalMilestoneInput};
use crate::commands_goals_lifecycle::{
    goal_abandon_inner, goal_retro_inner, goal_settle_inner, list_goal_graduations_inner,
};
use crate::db::Db;
use crate::goal_schema::TIER_HANDS_ON;
use crate::types::NewNoteGroup;

fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

fn group(db: &Db, name: &str) -> i64 {
    db.create_group(&NewNoteGroup {
        name: name.to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("建组")
    .id
}

fn input(tier: Option<&str>, scenario: Option<&str>, group_ids: Vec<i64>) -> GoalCreateInput {
    GoalCreateInput {
        name: "学会 Python".to_string(),
        domain_tag: Some("programming".to_string()),
        horizon: Some("3m".to_string()),
        tier: tier.map(str::to_string),
        scenario: scenario.map(str::to_string),
        level: Some("zero".to_string()),
        driver: Some("work".to_string()),
        criteria_statement: Some("能独立完成实例".to_string()),
        non_scope: Some("不做 Web 框架".to_string()),
        weekly_commitment: Some("5h+".to_string()),
        obstacles: None,
        group_ids,
        milestones: vec![
            GoalMilestoneInput { title: "基础".to_string(), due_weeks: 4 },
            GoalMilestoneInput { title: "应用".to_string(), due_weeks: 8 },
        ],
    }
}

/// 达成毕业判据所需状态（hands_on：里程碑全 done + 组结算 1 次）。
fn make_ready(db: &Db, goal_id: i64, gid: i64) {
    db.create_settlement(gid, r#"{}"#).expect("结算");
    for m in db.list_milestones(goal_id).expect("里程碑") {
        set_goal_milestone_status_inner(db, m.id, "done").expect("完成");
    }
}

#[test]
fn settle_rejects_when_criteria_not_met() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![gid])).expect("建");
    // 未达标（里程碑 0/2）
    let err = goal_settle_inner(&db, goal.id).expect_err("判据不足");
    assert!(err.contains("毕业判据未全部满足"));
    assert!(err.contains("里程碑"));
    // 状态未被改动
    assert_eq!(db.get_goal(goal.id).expect("读").unwrap().status, "active");
}

#[test]
fn settle_guards_terminated_statuses() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![gid])).expect("建");
    make_ready(&db, goal.id, gid);
    assert!(goal_settle_inner(&db, goal.id).expect("毕业").graduated_at > 0);
    // 重复毕业：已毕业终态拒绝
    let err = goal_settle_inner(&db, goal.id).expect_err("重复毕业");
    assert!(err.contains("非法毕业状态转移"));
    // 已放弃亦然
    let g2 = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景2"), vec![])).expect("建2");
    goal_abandon_inner(&db, g2.id, Some("没时间")).expect("放弃");
    let err2 = goal_settle_inner(&db, g2.id).expect_err("放弃后毕业");
    assert!(err2.contains("非法毕业状态转移"));
}

#[test]
fn settle_writes_snapshot_and_graduated_status() {
    let db = mem_db();
    let gid = group(&db, "Python 组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![gid])).expect("建");
    db.create_settlement(gid, r#"{"merged":2}"#).expect("结算");
    for m in db.list_milestones(goal.id).expect("里程碑") {
        set_goal_milestone_status_inner(&db, m.id, "done").expect("完成");
    }
    let report = goal_settle_inner(&db, goal.id).expect("毕业");
    assert_eq!(report.goal_name, "学会 Python");
    assert_eq!(report.milestones.len(), 2);
    assert_eq!(report.group_settlements[0].settlement_count, 1);
    assert!(report.criteria_statement.contains("结算 1 次"), "配方语句：{}", report.criteria_statement);
    let g = db.get_goal(goal.id).expect("读").unwrap();
    assert_eq!(g.status, "graduated");
    assert!(g.completed_at.is_some());
    assert_eq!(db.count_metric_events("goal_graduated").expect("埋点"), 1);
}

#[test]
fn graduation_report_survives_goal_delete() {
    // 验收 5：毕业报告在目标删除后仍可读（快照独立于 goals 行——FK SET NULL）
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![gid])).expect("建");
    make_ready(&db, goal.id, gid);
    goal_settle_inner(&db, goal.id).expect("毕业");
    crate::commands_goals::delete_goal_inner(&db, goal.id).expect("删目标");
    let archives = list_goal_graduations_inner(&db).expect("档案");
    assert_eq!(archives.len(), 1, "目标删除后报告保留");
    assert_eq!(archives[0].goal_id, goal.id, "快照保留原 goal_id（行链接 SET NULL）");
    assert_eq!(archives[0].goal_name, "学会 Python");
}

#[test]
fn retro_shows_timeline_with_graduation() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![gid])).expect("建");
    make_ready(&db, goal.id, gid);
    goal_settle_inner(&db, goal.id).expect("毕业");
    let view = goal_retro_inner(&db, goal.id).expect("回顾流");
    assert!(view.graduation.is_some());
    let kinds: Vec<&str> = view.entries.iter().map(|e| e.kind.as_str()).collect();
    assert!(kinds.contains(&"created"));
    assert!(kinds.contains(&"milestone"));
    assert!(kinds.contains(&"settlement"));
    assert!(kinds.contains(&"graduated"));
    assert_eq!(view.status, "graduated");
    // 未毕业目标：无 graduation 时间线节点
    let g2 = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景2"), vec![])).expect("建2");
    let v2 = goal_retro_inner(&db, g2.id).expect("回顾流2");
    assert!(v2.graduation.is_none());
    assert!(v2.entries.iter().all(|e| e.kind != "graduated"));
}

#[test]
fn abandon_records_reason_and_guards() {
    let db = mem_db();
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![])).expect("建");
    assert!(goal_abandon_inner(&db, goal.id, Some(" 转行，不学了 ")).expect("放弃"));
    let g = db.get_goal(goal.id).expect("读").unwrap();
    assert_eq!(g.status, "abandoned");
    assert!(g.completed_at.is_some());
    // 原因入埋点（审计可查）+ 超长截断 200
    assert_eq!(db.count_metric_events("goal_abandoned").expect("埋点"), 1);
    // 终态拒绝重复放弃
    let err = goal_abandon_inner(&db, goal.id, None).expect_err("重复放弃");
    assert!(err.contains("非法放弃状态转移"));
    // 超长原因截断
    let g2 = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景2"), vec![])).expect("建2");
    let long = "长".repeat(300);
    goal_abandon_inner(&db, g2.id, Some(&long)).expect("放弃2");
    assert_eq!(db.count_metric_events("goal_abandoned").expect("埋点2"), 2);
}
