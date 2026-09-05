//! 行动裁决命令族单测（v0.20.3 / REQ-293/294/298 数据面，内存库）。

use super::*;
use crate::db::Db;

fn seed(db: &Db) -> i64 {
    db.create_note(&crate::types::NewNote {
        title: "行动笔记".to_string(),
        content: "- [ ] 待办甲\n- ☑️ 待办 找两篇文章剪藏\n普通段落\n- [x] 历史完成\n".to_string(),
        source: "manual".to_string(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: None,
    })
    .unwrap()
    .id
}

#[test]
fn partition_tabs_basic() {
    let db = Db::open(":memory:").unwrap();
    let nid = seed(&db);
    let rows = db.list_task_queue(Some(nid)).unwrap();
    let someday = partition_rows(&rows, TAB_SOMEDAY);
    assert_eq!(someday.len(), 1, "未排期 todo 归搁置");
    let unrefined = partition_rows(&rows, TAB_UNREFINED);
    assert_eq!(unrefined.len(), 1, "☑️ 行归待提炼");
    assert!(partition_rows(&rows, TAB_OVERDUE).is_empty());
    assert!(partition_rows(&rows, TAB_PLANNED).is_empty());
}

#[test]
fn complete_rewrites_body_and_history() {
    let db = Db::open(":memory:").unwrap();
    let nid = seed(&db);
    let rows = db.list_task_queue(Some(nid)).unwrap();
    let todo = rows.iter().find(|r| r.task_text == "待办甲").unwrap();
    let done_msg = complete_task_core(&db, todo.id).unwrap();
    assert!(done_msg.contains("已完成"));
    // 正文 [x] 化（字符级；其余行不动）
    let note = db.get_note(nid).unwrap().unwrap();
    assert!(note.content.contains("- [x] 待办甲"));
    assert!(note.content.contains("- ☑️ 待办 找两篇文章剪藏"), "其余行原样");
    let history = db.list_completion_events(Some(EV_DONE), 10).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].text, "待办甲");
}

#[test]
fn abandon_marks_done_with_reason() {
    let db = Db::open(":memory:").unwrap();
    let nid = seed(&db);
    let rows = db.list_task_queue(Some(nid)).unwrap();
    let a = rows.iter().find(|r| r.task_text == "待办甲").unwrap();
    abandon_task_core(&db, a.id, "优先级转移").unwrap();
    let note = db.get_note(nid).unwrap().unwrap();
    assert!(note.content.contains("- [x] 待办甲"), "放弃=[x]+留因");
    let ab = db.list_completion_events(Some(EV_ABANDONED), 10).unwrap();
    assert_eq!(ab.len(), 1);
    assert_eq!(ab[0].note.as_deref(), Some("优先级转移"));
}

#[test]
fn refine_unrefined_becomes_standard_line() {
    let db = Db::open(":memory:").unwrap();
    let nid = seed(&db);
    let rows = db.list_task_queue(Some(nid)).unwrap();
    let u = rows.iter().find(|r| r.unrefined).unwrap();
    refine_unrefined_core(&db, u.id).unwrap();
    let note = db.get_note(nid).unwrap().unwrap();
    assert!(note.content.contains("- [ ] 找两篇文章剪藏"), "提炼为标准任务行");
    assert!(!note.content.contains("☑️"), "遗留行被替换");
}

#[test]
fn plan_date_persists_index_only() {
    let db = Db::open(":memory:").unwrap();
    let nid = seed(&db);
    let rows = db.list_task_queue(Some(nid)).unwrap();
    let todo = rows.iter().find(|r| r.task_text == "待办甲").unwrap();
    let tomorrow = today_start_secs() + 86_400;
    db.set_task_plan_date(todo.id, Some(tomorrow)).unwrap();
    // 正文零变化（计划日是元数据——仅索引列写）
    let note = db.get_note(nid).unwrap().unwrap();
    assert_eq!(note.content, "- [ ] 待办甲\n- ☑️ 待办 找两篇文章剪藏\n普通段落\n- [x] 历史完成\n");
    let rows = db.list_task_queue(Some(nid)).unwrap();
    assert!(partition_rows(&rows, TAB_PLANNED).len() == 1);
    assert!(partition_rows(&rows, TAB_SOMEDAY).is_empty());
}
