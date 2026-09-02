//! commands_goals_plan 单测（确认流落库/体系链接/概念弱信号——内存库）。

use crate::commands_goals::{create_goal_inner, GoalCreateInput};
use crate::db::Db;
use crate::goal_schema::NewMilestone;
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

fn goal(db: &Db) -> i64 {
    let input = GoalCreateInput {
        name: "学会 Python".to_string(),
        domain_tag: Some("programming".to_string()),
        horizon: Some("3m".to_string()),
        tier: Some("hands_on".to_string()),
        scenario: Some("工作自动化".to_string()),
        level: Some("zero".to_string()),
        driver: Some("work".to_string()),
        criteria_statement: Some("能独立完成实例".to_string()),
        non_scope: Some("不做 Web 框架".to_string()),
        weekly_commitment: Some("5h+".to_string()),
        obstacles: None,
        group_ids: vec![],
        milestones: vec![],
    };
    create_goal_inner(db, &input).expect("建目标").id
}

#[test]
fn apply_plan_core_writes_milestones_bindings_contract() {
    let db = mem_db();
    let gid = group(&db, "Python 组");
    let goal_id = goal(&db);
    let ms = vec![
        NewMilestone {
            title: "基础语法".to_string(),
            due_at: None,
            order_idx: 0,
            criteria_type: "manual".to_string(),
            ref_group_id: None,
        },
        NewMilestone {
            title: "爬虫实例".to_string(),
            due_at: None,
            order_idx: 0,
            criteria_type: "group_settled".to_string(),
            ref_group_id: Some(gid),
        },
    ];
    assert!(db.apply_plan_core(
        goal_id,
        &ms,
        &[gid],
        Some((gid, 3, 20, crate::week_contract::week_start_secs(0))), false,).is_ok());
    let milestones = db.list_milestones(goal_id).expect("里程碑");
    assert_eq!(milestones.len(), 2);
    assert_eq!(milestones[1].criteria_type, "group_settled");
    assert_eq!(db.list_goal_group_ids(goal_id).expect("绑定"), vec![gid]);
    assert!(db.get_week_contract(gid, crate::week_contract::week_start_secs(0)).expect("契约").is_some());
}

#[test]
fn apply_plan_rejects_missing_bound_group() {
    let db = mem_db();
    let goal_id = goal(&db);
    // 无效绑定组 → 外键报错（DB 层拒绝——命令层此前拦截，双保险）
    assert!(db.apply_plan_core(goal_id, &[], &[999], None, false).is_err());
}

#[test]
fn apply_plan_systems_creates_skeleton_and_links() {
    let db = mem_db();
    let goal_id = goal(&db);
    // 模拟命令层 systems 动作（create：骨架 + 领域入口 + 概念 + 目标引用）
    let sys = crate::commands_knowledge_systems::create_knowledge_system_inner(
        &db, "Python 应用能力".to_string(), "domain".to_string(), None, Some("怎么把语法变成工具？".to_string()),
    ).expect("建体系");
    crate::commands_knowledge_systems::add_knowledge_node_inner(
        &db, sys.id, None, "domain_entry".to_string(), "语言基础".to_string(),
    ).expect("入口");
    crate::commands_knowledge_core::add_knowledge_concept_inner(
        &db, sys.id, "闭包".to_string(), Some("捕获环境的函数".to_string()), None, None,
    ).expect("概念");
    assert!(db.link_goal_to_system(goal_id, sys.id).expect("链接"));
    assert!(!db.link_goal_to_system(goal_id, sys.id).expect("幂等"));
    let systems = db.goal_systems(goal_id).expect("系统列表");
    assert_eq!(systems.len(), 1);
    assert_eq!(systems[0].1, "Python 应用能力");
}

#[test]
fn concept_weakness_signal_flow() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal_id = goal(&db);
    // 建体系+概念+绑定组+引用链
    let sys = crate::commands_knowledge_systems::create_knowledge_system_inner(
        &db, "测试体系".to_string(), "domain".to_string(), None, Some("问题".to_string()),
    ).expect("建体系");
    let concept = crate::commands_knowledge_core::add_knowledge_concept_inner(
        &db, sys.id, "冷概念".to_string(), None, None, None,
    ).expect("概念");
    crate::commands_knowledge_core::link_knowledge_target_inner(
        &db, sys.id, None, Some(concept.id), None, "note_group".to_string(), gid,
    ).expect("链接组");
    db.bind_group(goal_id, gid).expect("绑定");
    let acts = db.goal_concept_activities(goal_id).expect("活动");
    assert_eq!(acts.len(), 1);
    let ranked = crate::concept_weakness::rank_weakness(&acts, 10_000_000_000);
    assert!(ranked[0].weak, "从未引用/应用——低激活");
    assert!(ranked[0].name.contains("冷概念"));
}
