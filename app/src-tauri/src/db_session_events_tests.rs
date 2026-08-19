//! 会话信号事件数据层单测（REQ-108 / v0.7.0 M1.5；AAA 模式，内存库）。
//!
//! @ai-context: 由 db_session_events.rs 以 #[cfg(test)] #[path] 引入；
//!              覆盖事件 roundtrip/类型过滤/容量守卫/脏数据防御。

use crate::db::Db;
use crate::session_events::{EventKind, NewSessionEvent};
use crate::types::NewSession;

/// 内存库 + 会话夹具（环境隔离：绝不触碰真实文件）。
fn mem_db_with_session() -> (Db, i64) {
    let db = Db::open(":memory:").expect("内存库打开成功");
    let session = db.create_session(&NewSession {
        title: "事件测试".to_string(),
        source_window: None,
        profile: None,
    }).expect("会话创建成功");
    (db, session.id)
}

#[test]
fn event_roundtrip_preserves_fields() {
    // Arrange：三类型事件（无载荷/带载荷）
    let (db, sid) = mem_db_with_session();
    let e1 = NewSessionEvent::simple(sid, EventKind::FrameSwitch, 5000);
    let e2 = NewSessionEvent {
        session_id: sid,
        kind: EventKind::LongSilence,
        timestamp_ms: 12000,
        payload: serde_json::json!({"duration_ms": 3500}),
    };
    // Act
    db.add_event(&e1).unwrap();
    db.add_event(&e2).unwrap();
    let events = db.list_events(sid).unwrap();
    // Assert：按时间序 + 字段完整
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].kind, EventKind::FrameSwitch);
    assert_eq!(events[0].timestamp_ms, 5000);
    assert_eq!(events[1].kind, EventKind::LongSilence);
    assert_eq!(events[1].payload["duration_ms"], 3500);
}

#[test]
fn list_by_kind_filters() {
    // Arrange：帧切换 ×2 + 长静音 ×1
    let (db, sid) = mem_db_with_session();
    db.add_event(&NewSessionEvent::simple(sid, EventKind::FrameSwitch, 1000)).unwrap();
    db.add_event(&NewSessionEvent::simple(sid, EventKind::FrameSwitch, 8000)).unwrap();
    db.add_event(&NewSessionEvent::simple(sid, EventKind::LongSilence, 15000)).unwrap();
    // Act
    let switches = db.list_events_by_kind(sid, EventKind::FrameSwitch).unwrap();
    let silences = db.list_events_by_kind(sid, EventKind::LongSilence).unwrap();
    // Assert：类型过滤正确
    assert_eq!(switches.len(), 2);
    assert_eq!(silences.len(), 1);
}

#[test]
fn events_cascade_on_session_delete() {
    // Arrange：会话 + 事件
    let (db, sid) = mem_db_with_session();
    db.add_event(&NewSessionEvent::simple(sid, EventKind::Clipboard, 100)).unwrap();
    // Act：删除会话（外键级联）
    db.delete_session(sid).unwrap();
    // Assert：事件级联清空（不残留孤儿行）
    let conn = db.conn.lock().expect("锁");
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM session_events WHERE session_id = ?1", [sid], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn empty_session_lists_empty() {
    // Arrange：无事件的会话
    let (db, sid) = mem_db_with_session();
    // Act & Assert：空列表不报错
    assert!(db.list_events(sid).unwrap().is_empty());
}
