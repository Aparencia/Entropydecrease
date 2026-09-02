//! db_goals 数据层单测（:memory: 三表 CRUD + 级联影响面——M1 验收项）。

use crate::db::Db;
use crate::goal_schema::{CRITERIA_GROUP_SETTLED, GOAL_GRADUATED, GoalMilestone, NewGoal, NewMilestone};
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

fn new_goal(name: &str, group_ids: Vec<i64>) -> NewGoal {
    NewGoal {
        name: name.to_string(),
        domain_tag: Some("programming".to_string()),
        horizon_end: None,
        success_criteria_json: r#"{"tier":"default"}"#.to_string(),
        intent_json: "{}".to_string(),
        milestones: vec![NewMilestone {
            title: "基础入门".to_string(),
            due_at: None,
            order_idx: 0,
            criteria_type: "manual".to_string(),
            ref_group_id: None,
        }],
        group_ids,
    }
}

#[test]
fn create_goal_active_with_milestones_and_bindings() {
    let db = mem_db();
    let gid = group(&db, "Python 组");
    let goal = db.create_goal(&new_goal("学会 Python", vec![gid])).expect("建目标");
    assert_eq!(goal.status, "active");
    assert_eq!(goal.name, "学会 Python");
    assert_eq!(goal.completed_at, None);
    let ms = db.list_milestones(goal.id).expect("里程碑");
    assert_eq!(ms.len(), 1);
    assert_eq!(ms[0].status, "pending");
    assert_eq!(db.list_goal_group_ids(goal.id).expect("绑定"), vec![gid]);
}

#[test]
fn list_goals_newest_first() {
    let db = mem_db();
    let a = db.create_goal(&new_goal("先建", vec![])).expect("a");
    let b = db.create_goal(&new_goal("后建", vec![])).expect("b");
    let all = db.list_goals().expect("列表");
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].id, b.id);
    assert_eq!(all[1].id, a.id);
}

#[test]
fn update_goal_core_persists() {
    let db = mem_db();
    let goal = db.create_goal(&new_goal("旧名", vec![])).expect("建目标");
    let ok = db
        .update_goal_core(goal.id, "新名", Some("music"), Some(999), r#"{"tier":"hands_on"}"#, r#"{"scenario":"x"}"#)
        .expect("更新");
    assert!(ok);
    let g = db.get_goal(goal.id).expect("读").expect("存在");
    assert_eq!(g.name, "新名");
    assert_eq!(g.domain_tag.as_deref(), Some("music"));
    assert_eq!(g.horizon_end, Some(999));
    assert!(g.success_criteria_json.contains("hands_on"));
}

#[test]
fn set_goal_status_graduated_sets_completed_at_and_resume_clears() {
    let db = mem_db();
    let goal = db.create_goal(&new_goal("毕业目标", vec![])).expect("建目标");
    db.set_goal_status(goal.id, GOAL_GRADUATED).expect("毕业");
    let g = db.get_goal(goal.id).expect("读").expect("存在");
    assert_eq!(g.status, GOAL_GRADUATED);
    assert!(g.completed_at.is_some(), "毕业生效时刻应记录");
    // 状态机允许恢复（active⇄paused；毕业为终态——恢复仅测试数据层语义）
    db.set_goal_status(goal.id, "paused").expect("暂停");
    let g2 = db.get_goal(goal.id).expect("读").expect("存在");
    assert_eq!(g2.completed_at, None, "非终止态清空 completed_at");
}

#[test]
fn delete_goal_cascades_milestones_and_bindings() {
    let db = mem_db();
    let gid = group(&db, "绑定组");
    let goal = db.create_goal(&new_goal("删除目标", vec![gid])).expect("建目标");
    assert!(db.delete_goal(goal.id).expect("删目标"));
    assert_eq!(db.list_milestones(goal.id).expect("里程碑"), Vec::<GoalMilestone>::new(), "里程碑级联删除");
    assert_eq!(db.list_goal_group_ids(goal.id).expect("绑定"), Vec::<i64>::new(), "绑定级联删除");
    assert!(db.get_goal(goal.id).expect("读").is_none());
    // 组不受影响（目标删除不删组——组是唯一容器）
    assert!(db.get_group(gid).expect("组").is_some());
}

#[test]
fn milestone_crud_and_status_completed_at() {
    let db = mem_db();
    let goal = db.create_goal(&new_goal("里程碑测试", vec![])).expect("建目标");
    let added = db.add_milestone(goal.id, &NewMilestone {
        title: "追加".to_string(),
        due_at: Some(123),
        order_idx: 0,
        criteria_type: "manual".to_string(),
        ref_group_id: None,
    }).expect("追加");
    // 自动 order 追加（> 首条 0）
    assert_eq!(added.order_idx, 1);
    assert_eq!(added.due_at, Some(123));
    assert!(db.update_milestone(added.id, "改名", None).expect("改"));
    let ms = db.list_milestones(goal.id).expect("列表");
    assert_eq!(ms.iter().find(|m| m.id == added.id).unwrap().title, "改名");
    db.set_milestone_status(added.id, "done").expect("完成");
    let done = db.list_milestones(goal.id).expect("列表").into_iter().find(|m| m.id == added.id).unwrap();
    assert_eq!(done.status, "done");
    assert!(done.completed_at.is_some());
    db.set_milestone_status(added.id, "pending").expect("回退");
    let back = db.list_milestones(goal.id).expect("列表").into_iter().find(|m| m.id == added.id).unwrap();
    assert_eq!(back.completed_at, None);
    assert!(db.delete_milestone(added.id).expect("删"));
    assert_eq!(db.list_milestones(goal.id).expect("列表").len(), 1);
}

#[test]
fn bind_unbind_idempotent() {
    let db = mem_db();
    let gid = group(&db, "组");
    let goal = db.create_goal(&new_goal("绑定测试", vec![])).expect("建目标");
    assert!(db.bind_group(goal.id, gid).expect("首次绑定"));
    assert!(!db.bind_group(goal.id, gid).expect("重复绑定幂等"), "UNIQUE 防重复");
    assert_eq!(db.list_goal_group_ids(goal.id).expect("绑定"), vec![gid]);
    assert!(db.unbind_group(goal.id, gid).expect("解绑"));
    assert!(!db.unbind_group(goal.id, gid).expect("重复解绑返回 false"));
    assert_eq!(db.list_goal_group_ids(goal.id).expect("绑定"), Vec::<i64>::new());
}

#[test]
fn group_delete_cascade_clears_binding_and_set_null_ref() {
    // M1 验收（规格 §九 一致性契约 2）：组删除 CASCADE 行为测试——绑定消除、ref SET NULL
    let db = mem_db();
    let gid = group(&db, "将被删除");
    let goal_id = db.create_goal(&new_goal("CASCADE 测试", vec![gid])).expect("建目标").id;
    let ms_id = db.add_milestone(goal_id, &NewMilestone {
        title: "随组结算".to_string(),
        due_at: None,
        order_idx: 1,
        criteria_type: CRITERIA_GROUP_SETTLED.to_string(),
        ref_group_id: Some(gid),
    }).expect("结算型里程碑").id;
    // Act：删除组
    assert!(db.delete_group(gid).expect("删组"));
    // Assert：目标与里程碑保留、绑定消除、ref SET NULL（里程碑降级手动——提示 UI 属 M2）
    assert!(db.get_goal(goal_id).expect("读").is_some(), "目标保留");
    assert_eq!(db.list_goal_group_ids(goal_id).expect("绑定"), Vec::<i64>::new(), "绑定 CASCADE 清除");
    let ms = db.list_milestones(goal_id).expect("里程碑").into_iter().find(|m| m.id == ms_id).unwrap();
    assert_eq!(ms.ref_group_id, None, "ref SET NULL");
    assert_eq!(ms.status, "pending", "状态不变——降级为手动确认");
}

#[test]
fn mark_group_settled_milestones_auto_passes_only_bound_pending() {
    let db = mem_db();
    let gid = group(&db, "结算组");
    let gid2 = group(&db, "另一组");
    let goal_id = db.create_goal(&new_goal("结算钩子", vec![gid, gid2])).expect("建目标").id;
    let auto_id = db.add_milestone(goal_id, &NewMilestone {
        title: "自动通过".to_string(),
        due_at: None,
        order_idx: 1,
        criteria_type: CRITERIA_GROUP_SETTLED.to_string(),
        ref_group_id: Some(gid),
    }).expect("auto").id;
    db.set_milestone_status(auto_id, "in_progress").expect("进行中");
    let manual_id = db.add_milestone(goal_id, &NewMilestone {
        title: "手动".to_string(),
        due_at: None,
        order_idx: 2,
        criteria_type: "manual".to_string(),
        ref_group_id: None,
    }).expect("manual").id;
    let other_auto = db.add_milestone(goal_id, &NewMilestone {
        title: "另一组自动".to_string(),
        due_at: None,
        order_idx: 3,
        criteria_type: CRITERIA_GROUP_SETTLED.to_string(),
        ref_group_id: Some(gid2),
    }).expect("other").id;
    // Act：gid 结算（钩子）
    let affected = db.mark_group_settled_milestones(gid).expect("钩子");
    // Assert：只自动通过绑定该组且未完成的那一条
    assert_eq!(affected, 1);
    let ms = db.list_milestones(goal_id).expect("列表");
    let auto = ms.iter().find(|m| m.id == auto_id).unwrap();
    assert_eq!(auto.status, "done");
    assert!(auto.completed_at.is_some());
    let manual = ms.iter().find(|m| m.id == manual_id).unwrap();
    assert_eq!(manual.status, "pending", "手动型不受影响");
    let other = ms.iter().find(|m| m.id == other_auto).unwrap();
    assert_eq!(other.status, "pending", "其他组绑定的不受影响");
    // 幂等：再次钩子不再重复计（done 不动）
    assert_eq!(db.mark_group_settled_milestones(gid).expect("钩子2"), 0);
}
