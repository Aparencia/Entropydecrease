//! commands_after 单测（v0.20.3 / REQ-294/295 收尾命令族）。

use super::*;
use crate::db::Db;

fn seed(db: &Db) -> i64 {
    db.create_note(&crate::types::NewNote {
        title: "周回顾笔记".to_string(),
        content: "- [ ] 任务一\n- [ ] 任务二\n- [x] 已完成\n".to_string(),
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
fn weekly_batch_resolves_atomically() {
    let db = Db::open(":memory:").unwrap();
    let nid = seed(&db);
    let rows = db.list_task_queue(Some(nid)).unwrap();
    let r1 = rows.iter().find(|r| r.task_text == "任务一").unwrap();
    let r2 = rows.iter().find(|r| r.task_text == "任务二").unwrap();
    let decisions = vec![
        WeeklyDecision { row_id: r1.id, action: "done".into(), reason: None },
        WeeklyDecision { row_id: r2.id, action: "abandon".into(), reason: Some("不适用".into()) },
    ];
    let view = weekly_resolve_core(&db, &decisions).unwrap();
    assert_eq!(view.done, 1);
    assert_eq!(view.abandoned, 1);
    // 正文两行均 [x] 化（单事务）
    let note = db.get_note(nid).unwrap().unwrap();
    assert!(note.content.contains("- [x] 任务一"));
    assert!(note.content.contains("- [x] 任务二"));
    // 完成史 done + abandoned（原因随行）
    let done = db.list_completion_events(Some("done"), 10).unwrap();
    let ab = db.list_completion_events(Some("abandoned"), 10).unwrap();
    assert_eq!(done.len(), 1);
    assert_eq!(ab.len(), 1);
    assert_eq!(ab[0].note.as_deref(), Some("不适用"));
    // 索引已无 todo 行（重扫）
    let after = db.list_task_queue(Some(nid)).unwrap();
    assert!(!after.iter().any(|r| r.status == "todo"));
}

#[test]
fn weekly_batch_tolerates_stale_rows() {
    let db = Db::open(":memory:").unwrap();
    let nid = seed(&db);
    let rows = db.list_task_queue(Some(nid)).unwrap();
    let r1 = rows.iter().find(|r| r.task_text == "任务一").unwrap();
    let decisions = vec![
        WeeklyDecision { row_id: r1.id, action: "done".into(), reason: None },
        WeeklyDecision { row_id: 999_999, action: "done".into(), reason: None },
        WeeklyDecision { row_id: r1.id, action: "weird".into(), reason: None },
    ];
    let view = weekly_resolve_core(&db, &decisions).unwrap();
    assert_eq!(view.done, 1, "合法项照常执行");
    assert_eq!(view.failed.len(), 2, "失效行与非法动作显式记录，不静默");
    // 重复行（done 后同 id 再出现 done——重复裁决幂等防御：第二行仍在 todo 之前已被执行，
    // 该重复 action 视为失效（重扫后无 todo 行，get 仍取到 done 行并二次迁移无变化）
    assert!(db.get_note(nid).unwrap().unwrap().content.contains("[x] 任务一"));
}

#[test]
fn manual_fill_export_done_records_history() {
    let db = Db::open(":memory:").unwrap();
    let id = db
        .add_completion_event(EV_EXPORT_MANUAL_DONE, "export", None, None, "找资料（外部完成）", Some("Todoist"), None)
        .unwrap();
    assert!(id > 0);
    let rows = db.list_completion_events(Some(EV_EXPORT_MANUAL_DONE), 10).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].note.as_deref(), Some("Todoist"));
}
