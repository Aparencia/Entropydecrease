//! commands_goals 命令层单测（inner 纯编排——内存库 AAA 模式）。

use crate::commands_goals::{
    add_goal_milestone_inner, bind_goal_group_inner, create_goal_inner, delete_goal_inner,
    get_goal_detail_inner, get_goal_progress_inner, list_goals_inner, require_goal,
    set_goal_milestone_status_inner, unbind_goal_group_inner, update_goal_inner,
    update_goal_interview_inner, update_goal_status_inner, GoalCreateInput, GoalMilestoneInput,
};
use crate::db::Db;
use crate::goal_schema::{TIER_HANDS_ON, TIER_SOLO_PROJECT};
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
            GoalMilestoneInput { title: "项目".to_string(), due_weeks: 12 },
        ],
    }
}

#[test]
fn create_rejects_missing_scenario_in_interview_mode() {
    let db = mem_db();
    // 第 1 问必答：tier 给了、scenario 缺失 → 拒绝
    let err = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), None, vec![])).expect_err("必答");
    assert!(err.contains("必答"));
}

#[test]
fn create_quick_mode_default_tier_and_metric_events() {
    let db = mem_db();
    // 快速模式：tier=scenario=None → 默认档 + 0 草稿（两步入口零负担）
    let quick = GoalCreateInput {
        name: "学乐理".to_string(),
        domain_tag: Some("music".to_string()),
        horizon: Some("none".to_string()),
        tier: None,
        scenario: None,
        level: None,
        driver: None,
        criteria_statement: None,
        non_scope: None,
        weekly_commitment: None,
        obstacles: None,
        group_ids: vec![],
        milestones: vec![],
    };
    let goal = create_goal_inner(&db, &quick).expect("快速模式");
    assert_eq!(goal.status, "active");
    assert!(goal.success_criteria_json.contains("default"), "默认档配方");
    assert!(goal.intent_json.contains("\"scenario\":null"), "未访谈不落空串");
    assert_eq!(db.count_metric_events("goal_created").expect("计数"), 1, "埋点一次");
    assert_eq!(db.list_milestones(goal.id).expect("里程碑").len(), 0, "快速模式无草案");
}

#[test]
fn create_full_interview_persists_criteria_intent_bindings() {
    let db = mem_db();
    let gid = group(&db, "Python 组");
    let goal = create_goal_inner(&db, &input(Some(TIER_SOLO_PROJECT), Some("独立项目"), vec![gid]))
        .expect("访谈模式");
    assert!(goal.success_criteria_json.contains("solo_project"));
    assert!(goal.success_criteria_json.contains("\"applications\":1"));
    assert!(goal.intent_json.contains("\"scenario\":\"独立项目\""));
    assert_eq!(db.list_goal_group_ids(goal.id).expect("绑定"), vec![gid]);
    assert_eq!(db.list_milestones(goal.id).expect("里程碑").len(), 3, "草案落库");
}

#[test]
fn create_rejects_missing_bound_group() {
    let db = mem_db();
    let err = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![999])).expect_err("绑组");
    assert!(err.contains("笔记组不存在"));
}

#[test]
fn list_cards_show_progress_and_ready_badge() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![gid])).expect("建");
    db.create_settlement(gid, r#"{}"#).expect("结算");
    let cards = list_goals_inner(&db).expect("列表");
    assert_eq!(cards.len(), 1);
    assert!(!cards[0].ready, "里程碑 0/3 不可毕业");
    // 全达成 → 🎓 可毕业
    for m in db.list_milestones(goal.id).expect("里程碑") {
        set_goal_milestone_status_inner(&db, m.id, "done").expect("完成");
    }
    let cards2 = list_goals_inner(&db).expect("列表2");
    assert!(cards2[0].ready);
    assert!(cards2[0].statement.contains("100%"));
}

#[test]
fn detail_includes_declaration_and_groups() {
    let db = mem_db();
    let gid = group(&db, "乐理组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("兴趣分享"), vec![gid])).expect("建");
    let detail = get_goal_detail_inner(&db, goal.id).expect("详情");
    assert_eq!(detail.groups.len(), 1);
    assert_eq!(detail.groups[0].name, "乐理组");
    assert!(detail.declaration.contains("学会 Python"));
    assert!(detail.declaration.contains("边界：不做 Web 框架"));
    assert_eq!(detail.progress.progress.milestone_total, 3);
}

#[test]
fn progress_reflects_milestone_and_settlement() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![gid])).expect("建");
    let view = get_goal_progress_inner(&db, goal.id).expect("进度");
    assert_eq!(view.statement, "0% · 里程碑 0/3");
    assert!(!view.ready);
    db.create_settlement(gid, r#"{}"#).expect("结算");
    let ms = db.list_milestones(goal.id).expect("里程碑");
    set_goal_milestone_status_inner(&db, ms[0].id, "done").expect("done");
    let view2 = get_goal_progress_inner(&db, goal.id).expect("进度2");
    assert_eq!(view2.statement, "33% · 里程碑 1/3");
    // 判据明细可见（字段与详情/毕业确认同口径）
    assert_eq!(view2.checks.len(), 2, "hands_on 两项判据");
}

#[test]
fn milestone_done_metric_only_on_transition() {
    let db = mem_db();
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![])).expect("建");
    let m = db.list_milestones(goal.id).expect("里程碑").remove(0);
    set_goal_milestone_status_inner(&db, m.id, "done").expect("完成");
    set_goal_milestone_status_inner(&db, m.id, "pending").expect("回退");
    set_goal_milestone_status_inner(&db, m.id, "done").expect("再完成");
    assert_eq!(db.count_metric_events("goal_milestone_done").expect("计数"), 2, "两次转变各记一次");
    // 已完成 → done 幂等（不再记）
    set_goal_milestone_status_inner(&db, m.id, "done").expect("幂等");
    assert_eq!(db.count_metric_events("goal_milestone_done").expect("计数"), 2);
}

#[test]
fn status_transitions_guards() {
    let db = mem_db();
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![])).expect("建");
    assert!(update_goal_status_inner(&db, goal.id, "paused").expect("暂停"));
    assert_eq!(db.get_goal(goal.id).expect("读").unwrap().status, "paused");
    assert!(update_goal_status_inner(&db, goal.id, "active").expect("恢复"));
    // 非法：重复暂停→暂停 / 跳过退出路径 / 终态
    let err = update_goal_status_inner(&db, goal.id, "graduated").expect_err("M1 未开放毕业");
    assert!(err.contains("M1 仅支持暂停/恢复"));
}

#[test]
fn update_and_delete_goal() {
    let db = mem_db();
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![])).expect("建");
    assert!(update_goal_inner(&db, goal.id, "改名", None, Some("6m".to_string())).expect("改"));
    let g = db.get_goal(goal.id).expect("读").unwrap();
    assert_eq!(g.name, "改名");
    assert!(g.horizon_end.is_some(), "改名传 6m 重设时限锚点");
    assert!(update_goal_status_inner(&db, goal.id, "paused").is_ok());
    // 重访谈：名称随对话窗口生效（空名回退旧名），判据/意图重推
    assert!(update_goal_interview_inner(&db, goal.id, &input(Some(TIER_HANDS_ON), Some("新场景"), vec![])).expect("重访谈"));
    let g2 = db.get_goal(goal.id).expect("读").unwrap();
    assert_eq!(g2.name, "学会 Python", "重访谈名称生效（input 名称）");
    assert!(g2.intent_json.contains("新场景"));
    // 改名不传 horizon（None）= 不改变时限锚点——防无期限目标被顺带抹掉
    let horizon_before = g2.horizon_end;
    assert!(update_goal_inner(&db, goal.id, "再改名", None, None).expect("改2"));
    let g3 = db.get_goal(goal.id).expect("读").unwrap();
    assert_eq!(g3.horizon_end, horizon_before, "horizon=None 保持原锚点");
    assert_eq!(g3.name, "再改名");
    assert!(delete_goal_inner(&db, goal.id).expect("删除"));
    assert!(require_goal(&db, goal.id).is_err());
}

#[test]
fn milestone_validation_whitelists() {
    let db = mem_db();
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![])).expect("建");
    // 非法判据类型拒绝（self_test 占位契约 M3 前不可写）
    let err = add_goal_milestone_inner(&db, goal.id, "x", None, Some("self_test".to_string()), None)
        .expect_err("自测类型");
    assert!(err.contains("不支持的里程碑判据类型"));
    // group_settled 必须绑组
    let err2 = add_goal_milestone_inner(&db, goal.id, "x", None, Some("group_settled".to_string()), None)
        .expect_err("需绑组");
    assert!(err2.contains("必须绑定组"));
    // 非法状态拒绝
    let err3 = set_goal_milestone_status_inner(&db, 1, "archived").expect_err("非法状态");
    assert!(err3.contains("不支持的里程碑状态"));
}

#[test]
fn interview_texts_bounded_in_storage() {
    let db = mem_db();
    let mut inp = input(Some(TIER_HANDS_ON), Some("场景"), vec![]);
    inp.scenario = Some("长".repeat(300));
    inp.non_scope = Some("宽".repeat(300));
    let goal = create_goal_inner(&db, &inp).expect("建");
    let intent: crate::goal_schema::GoalIntent = serde_json::from_str(&goal.intent_json).expect("解析");
    assert_eq!(intent.scenario.as_deref().unwrap().chars().count(), 200, "超长截断保留 200 字");
    // 判据 statement 的边界文案同样截断（derive_criteria 入参 bounded）
    let criteria: crate::goal_schema::SuccessCriteria =
        serde_json::from_str(&goal.success_criteria_json).expect("解析");
    assert!(!criteria.statement.contains("宽".repeat(250).as_str()), "边界文案截断入配方");
}

#[test]
fn bind_unbind_guards() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = create_goal_inner(&db, &input(Some(TIER_HANDS_ON), Some("场景"), vec![])).expect("建");
    assert!(bind_goal_group_inner(&db, goal.id, gid).expect("绑定"));
    assert!(unbind_goal_group_inner(&db, goal.id, gid).expect("解绑"));
    let err = bind_goal_group_inner(&db, goal.id, 999).expect_err("缺组");
    assert!(err.contains("笔记组不存在"));
}
