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
        kind: None,
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

#[test]
fn capacity_guard_preserves_baseline_event() {
    // 审查 MEDIUM-5：守卫分级删除——优先删高频噪声事件，保护前台切换基线
    // Arrange：预算满（1 基线 + 1999 帧切换）
    let (db, sid) = mem_db_with_session();
    db.add_event(&NewSessionEvent::simple(sid, EventKind::ForegroundSwitch, 0)).unwrap();
    for i in 1..2000 {
        db.add_event(&NewSessionEvent::simple(sid, EventKind::FrameSwitch, i as u64 * 100)).unwrap();
    }
    // Act：超预算再写入 → 触发容量守卫（删 1 + 插 1）
    db.add_event(&NewSessionEvent::simple(sid, EventKind::FrameSwitch, 999_999)).unwrap();
    let events = db.list_events(sid).unwrap();
    // Assert：仍 2000 条；基线保留；最旧高频帧切换被删；新事件写入
    assert_eq!(events.len(), 2000);
    assert!(
        events.iter().any(|e| e.kind == EventKind::ForegroundSwitch && e.timestamp_ms == 0),
        "前台切换基线（practice_segments 锚点）不应被守卫误删"
    );
    assert!(events.iter().any(|e| e.timestamp_ms == 999_999), "新事件应写入");
    assert!(
        !events.iter().any(|e| e.kind == EventKind::FrameSwitch && e.timestamp_ms == 100),
        "最旧高频帧切换应被优先删除"
    );
}
