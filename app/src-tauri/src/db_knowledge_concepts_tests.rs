//! db_knowledge_concepts 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::types::{NewKnowledgeConcept, NewKnowledgeSystem};

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个体系并返回。
fn host_system(db: &Db, name: &str) -> i64 {
    db.create_knowledge_system(&NewKnowledgeSystem {
        name: name.to_string(),
        kind: "domain".to_string(),
        parent_system_id: None,
        core_question: None,
    })
    .expect("create system")
    .id
}

/// 概念入参助手。
fn concept(system_id: i64, name: &str) -> NewKnowledgeConcept {
    NewKnowledgeConcept {
        system_id,
        name: name.to_string(),
        essence: None,
        boundary: None,
        relation: None,
    }
}

#[test]
fn add_and_get_roundtrip() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    // Act
    let created = db.add_knowledge_concept(&concept(sid, "贝叶斯定理")).expect("create");
    let fetched = db.get_knowledge_concept(created.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.name, "贝叶斯定理");
    assert_eq!(fetched.system_id, sid);
    assert_eq!(fetched.status, "core");
}

#[test]
fn duplicate_name_conflict_is_err() {
    // Arrange：同名概念已存在
    let db = mem_db();
    let sid = host_system(&db, "体系");
    db.add_knowledge_concept(&concept(sid, "微积分")).expect("create first");
    // Act：再次插入同名（即使不同体系）——name 全局 UNIQUE
    let err = db.add_knowledge_concept(&concept(sid, "微积分"));
    // Assert：唯一约束错误上抛（交叉点判定前提）
    assert!(err.is_err());
}

#[test]
fn find_by_name() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    db.add_knowledge_concept(&concept(sid, "导数")).expect("create");
    // Act
    let hit = db.find_concept_by_name("导数").expect("find");
    let miss = db.find_concept_by_name("不存在的概念").expect("find");
    // Assert
    assert!(hit.is_some());
    assert_eq!(hit.unwrap().name, "导数");
    assert!(miss.is_none());
}

#[test]
fn update_concept_fields_and_clear_three_questions() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let c = db.add_knowledge_concept(&concept(sid, "原始名")).expect("create");
    // Act：改名 + 置三问 + 改状态
    db.update_knowledge_concept(
        c.id,
        Some("新名"),
        Some(Some("本质")),
        Some(Some("边界")),
        Some(Some("联系")),
        Some("watching"),
    )
    .expect("update");
    let filled = db.get_knowledge_concept(c.id).expect("get").expect("exists");
    // Act：清空三问（内层 None）
    db.update_knowledge_concept(c.id, None, Some(None), Some(None), Some(None), None).expect("clear");
    let cleared = db.get_knowledge_concept(c.id).expect("get").expect("exists");
    // Assert
    assert_eq!(filled.name, "新名");
    assert_eq!(filled.essence.as_deref(), Some("本质"));
    assert_eq!(filled.status, "watching");
    assert_eq!(cleared.essence, None);
    assert_eq!(cleared.boundary, None);
    assert_eq!(cleared.relation, None);
}

#[test]
fn list_concepts_filter_system_and_status() {
    // Arrange：两体系，体系一有 core 与 watching 两概念
    let db = mem_db();
    let s1 = host_system(&db, "体系一");
    let s2 = host_system(&db, "体系二");
    db.add_knowledge_concept(&concept(s1, "甲")).expect("甲");
    let w = db.add_knowledge_concept(&concept(s1, "乙")).expect("乙");
    db.update_knowledge_concept(w.id, None, None, None, None, Some("watching")).expect("watch");
    db.add_knowledge_concept(&concept(s2, "丙")).expect("丙");
    // Act
    let all = db.list_knowledge_concepts(None, None).expect("all");
    let s1_only = db.list_knowledge_concepts(Some(s1), None).expect("s1");
    let s1_watching = db.list_knowledge_concepts(Some(s1), Some("watching")).expect("s1 watching");
    // Assert
    assert_eq!(all.len(), 3);
    assert_eq!(s1_only.len(), 2);
    assert_eq!(s1_watching.len(), 1);
    assert_eq!(s1_watching[0].name, "乙");
}
