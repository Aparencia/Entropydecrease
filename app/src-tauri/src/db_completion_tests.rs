//! completion_history 读写单测（v0.20.3 / REQ-298）。

use super::*;
use crate::db::Db;

#[test]
fn insert_and_list_roundtrip() {
    let db = Db::open(":memory:").unwrap();
    let id = db
        .add_completion_event(EV_DONE, "task_line", Some(11), None, "完成任务甲", None, None)
        .unwrap();
    assert!(id > 0);
    let all = db.list_completion_events(None, 10).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].event_type, EV_DONE);
    assert_eq!(all[0].text, "完成任务甲");
    let done = db.list_completion_events(Some(EV_DONE), 10).unwrap();
    assert_eq!(done.len(), 1);
    assert!(db.list_completion_events(Some(EV_ABANDONED), 10).unwrap().is_empty());
}

#[test]
fn limit_bounded_and_meta_preserved() {
    let db = Db::open(":memory:").unwrap();
    for i in 0..20 {
        db.add_completion_event(
            EV_PRACTICE_TICK,
            "practice_item",
            Some(i),
            None,
            &format!("打点{}", i),
            None,
            Some(r#"{"freq":"daily"}"#),
        )
        .unwrap();
    }
    let rows = db.list_completion_events(Some(EV_PRACTICE_TICK), 5).unwrap();
    assert_eq!(rows.len(), 5, "limit 生效");
    assert_eq!(rows[0].text, "打点19", "倒序");
    assert_eq!(rows[0].meta_json.as_deref(), Some(r#"{"freq":"daily"}"#));
    // 上限护栏（>500 截断不崩）
    let many = db.list_completion_events(None, 99_999).unwrap();
    assert!(many.len() <= 500);
}
