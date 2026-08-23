//! db_knowledge_audits 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::types::NewKnowledgeSystem;

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个体系并返回。
fn host_system(db: &Db) -> i64 {
    db.create_knowledge_system(&NewKnowledgeSystem {
        name: "体系".to_string(),
        kind: "domain".to_string(),
        parent_system_id: None,
        core_question: None,
    })
    .expect("create system")
    .id
}

#[test]
fn add_and_list_roundtrip() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db);
    // Act
    let a = db
        .add_knowledge_audit(sid, r#"["n1","n2"]"#, r#"{"done":2}"#)
        .expect("add first");
    let b = db
        .add_knowledge_audit(sid, r#"["n3"]"#, r#"{}"#)
        .expect("add second");
    let audits = db.list_knowledge_audits(sid).expect("list");
    // Assert：新→旧排序（b 在前），字段往返
    assert_eq!(audits.len(), 2);
    assert_eq!(audits[0].id, b.id);
    assert_eq!(audits[1].id, a.id);
    assert_eq!(audits[1].items_json, r#"["n1","n2"]"#);
}

#[test]
fn latest_audit_none_when_never_audited() {
    // Arrange：无审计记录
    let db = mem_db();
    let sid = host_system(&db);
    // Act
    let latest = db.latest_audit_at_ms(sid).expect("latest");
    // Assert：从未审计 → None
    assert_eq!(latest, None);
}

#[test]
fn latest_audit_returns_most_recent_in_ms() {
    // Arrange：两次审计（时间递增由真实时钟保证）
    let db = mem_db();
    let sid = host_system(&db);
    db.add_knowledge_audit(sid, "[]", "{}").expect("a1");
    // Act：取最近
    let latest = db.latest_audit_at_ms(sid).expect("latest").expect("exists");
    // Assert：返回毫秒（秒*1000——审计信号口径）；>0 且为 1000 的倍数
    assert!(latest > 0);
    assert_eq!(latest % 1000, 0);
}

#[test]
fn audits_scoped_to_system() {
    // Arrange：两体系各有审计
    let db = mem_db();
    let sid1 = host_system(&db);
    let sid2 = host_system(&db);
    db.add_knowledge_audit(sid1, "[]", "{}").expect("s1");
    db.add_knowledge_audit(sid2, "[]", "{}").expect("s2");
    // Act
    let in_s1 = db.list_knowledge_audits(sid1).expect("list s1");
    // Assert：按体系隔离
    assert_eq!(in_s1.len(), 1);
}
