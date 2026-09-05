//! db_practice 单测（v0.20.3 / REQ-299）。

use super::*;
use crate::db::Db;

#[test]
fn create_list_tick_daily_and_history() {
    let db = Db::open(":memory:").unwrap();
    let id = db.create_practice_item("哑铃弯举 3×12", FREQ_DAILY, Some("动作标准")).unwrap();
    let list = db.list_practice_items(Some(ITEM_ACTIVE)).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].frequency, FREQ_DAILY);
    // 打点 → 次日到期 + mastery + 史
    db.practice_tick(id, Some(3)).unwrap();
    let item = db.get_practice_item(id).unwrap().unwrap();
    assert!(item.next_due.is_some_and(|d| d > crate::db::unix_seconds()));
    assert_eq!(item.mastery, Some(3));
    let hist = db
        .list_completion_events(Some(crate::db_completion::EV_PRACTICE_TICK), 10)
        .unwrap();
    assert_eq!(hist.len(), 1);
    // 暂停后不可打点
    db.set_practice_status(id, ITEM_PAUSED).unwrap();
    assert!(db.practice_tick(id, None).is_err());
}

#[test]
fn manual_frequency_no_next_due() {
    let db = Db::open(":memory:").unwrap();
    let id = db.create_practice_item("自由练习", FREQ_MANUAL, None).unwrap();
    db.practice_tick(id, None).unwrap();
    let item = db.get_practice_item(id).unwrap().unwrap();
    assert!(item.next_due.is_none(), "手动型不造伪死线");
}
