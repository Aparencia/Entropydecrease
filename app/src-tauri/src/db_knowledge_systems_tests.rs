//! db_knowledge_systems 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::types::{
    NewKnowledgeConcept, NewKnowledgeLink, NewKnowledgeModel, NewKnowledgeNode,
    NewKnowledgeSystem,
};

/// 内存库（schema 经 Db::open 初始化——建表幂等路径同真库）。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 体系入参助手（顶层领域体系默认）。
fn system(name: &str) -> NewKnowledgeSystem {
    NewKnowledgeSystem {
        name: name.to_string(),
        kind: "domain".to_string(),
        parent_system_id: None,
        core_question: None,
    }
}

#[test]
fn create_and_get_roundtrip() {
    // Arrange
    let db = mem_db();
    // Act
    let created = db.create_knowledge_system(&system("化妆体系")).expect("create");
    let fetched = db.get_knowledge_system(created.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.name, "化妆体系");
    assert_eq!(fetched.kind, "domain");
    assert_eq!(fetched.status, "active");
    assert_eq!(fetched.node_count, 0);
}

#[test]
fn global_kind_unique_fallback() {
    // Arrange：先建一个 global 体系
    let db = mem_db();
    let mut global = system("全局核心问题域");
    global.kind = "global".to_string();
    global.core_question = Some("如何系统化自学？".to_string());
    db.create_knowledge_system(&global).expect("create global");
    // Act：再插第二个 global——唯一索引兜底报 Err
    let second = db.create_knowledge_system(&global);
    // Assert：global 唯一（防多核心稀释）
    assert!(second.is_err());
    // find_global_system 仍应返回第一条
    assert!(db.find_global_system().expect("find").is_some());
}

#[test]
fn global_system_found() {
    // Arrange：非 global 先行，再插 global
    let db = mem_db();
    db.create_knowledge_system(&system("编程")).expect("domain");
    let mut global = system("全局");
    global.kind = "global".to_string();
    global.core_question = Some("核心问题".to_string());
    db.create_knowledge_system(&global).expect("global");
    // Act
    let found = db.find_global_system().expect("find").expect("exists");
    // Assert
    assert_eq!(found.kind, "global");
    assert_eq!(found.core_question.as_deref(), Some("核心问题"));
}

#[test]
fn list_systems_counts_subqueries() {
    // Arrange：一体系挂 3 节点 + 1 概念 + 1 模型；另一空体系
    let db = mem_db();
    let s1 = db.create_knowledge_system(&system("体系一")).expect("s1");
    let s2 = db.create_knowledge_system(&system("体系二")).expect("s2");
    for i in 0..3 {
        db.add_knowledge_node(&NewKnowledgeNode {
            system_id: s1.id,
            parent_id: None,
            r#type: "question".to_string(),
            text: format!("子问题{}", i),
            order_idx: i,
        })
        .expect("node");
    }
    db.add_knowledge_concept(&NewKnowledgeConcept {
        system_id: s1.id,
        name: "核心概念".to_string(),
        essence: None,
        boundary: None,
        relation: None,
    })
    .expect("concept");
    db.add_knowledge_model(&NewKnowledgeModel {
        system_id: s1.id,
        name: "命题模型".to_string(),
        disciplines: r#"["数学"]"#.to_string(),
        claim: None,
        valid_when: None,
        invalid_when: None,
        cross_checks: None,
    })
    .expect("model");
    // Act
    let systems = db.list_knowledge_systems().expect("list");
    // Assert：计数子查询正确（3/1/1）
    let one = systems.iter().find(|s| s.id == s1.id).unwrap();
    let two = systems.iter().find(|s| s.id == s2.id).unwrap();
    assert_eq!(one.node_count, 3);
    assert_eq!(one.concept_count, 1);
    assert_eq!(one.model_count, 1);
    assert_eq!(two.node_count, 0);
}

#[test]
fn update_system_fields() {
    // Arrange
    let db = mem_db();
    let s = db.create_knowledge_system(&system("待更新")).expect("create");
    // Act：改名 + 置 core_question + 改状态
    let ok = db
        .update_knowledge_system(s.id, Some("已改名"), Some(Some("新的核心问题")), Some("watching"))
        .expect("update");
    // Assert
    assert!(ok);
    let fetched = db.get_knowledge_system(s.id).expect("get").expect("exists");
    assert_eq!(fetched.name, "已改名");
    assert_eq!(fetched.core_question.as_deref(), Some("新的核心问题"));
    assert_eq!(fetched.status, "watching");
}

#[test]
fn update_core_question_three_state() {
    // Arrange：带 core_question 的体系
    let db = mem_db();
    let mut g = system("体系");
    g.kind = "global".to_string();
    g.core_question = Some("问题".to_string());
    let s = db.create_knowledge_system(&g).expect("create");
    // Act：外层 Some + 内层 None → 清空为 NULL；外层 None → 不改
    db.update_knowledge_system(s.id, None, Some(None), None).expect("clear");
    let cleared = db.get_knowledge_system(s.id).expect("get").expect("exists");
    db.update_knowledge_system(s.id, None, None, None).expect("noop");
    let kept = db.get_knowledge_system(s.id).expect("get").expect("exists");
    // Assert：清空生效；None 不改
    assert_eq!(cleared.core_question, None);
    assert_eq!(kept.core_question, None);
}

#[test]
fn archive_system_idempotent() {
    // Arrange
    let db = mem_db();
    let s = db.create_knowledge_system(&system("将归档")).expect("create");
    // Act：两次归档
    let first = db.archive_knowledge_system(s.id).expect("a1");
    let second = db.archive_knowledge_system(s.id).expect("a2");
    // Assert：幂等，status=archived
    assert!(first);
    assert!(second);
    assert_eq!(db.get_knowledge_system(s.id).expect("get").expect("exists").status, "archived");
}

#[test]
fn delete_system_cascades_children() {
    // Arrange：体系挂节点/概念/模型/引用
    let db = mem_db();
    let s = db.create_knowledge_system(&system("将删")).expect("create");
    let node = db
        .add_knowledge_node(&NewKnowledgeNode {
            system_id: s.id,
            parent_id: None,
            r#type: "question".to_string(),
            text: "子问题".to_string(),
            order_idx: 0,
        })
        .expect("node");
    db.add_knowledge_concept(&NewKnowledgeConcept {
        system_id: s.id,
        name: "概念".to_string(),
        essence: None,
        boundary: None,
        relation: None,
    })
    .expect("concept");
    db.add_knowledge_model(&NewKnowledgeModel {
        system_id: s.id,
        name: "模型".to_string(),
        disciplines: r#"["a"]"#.to_string(),
        claim: None,
        valid_when: None,
        invalid_when: None,
        cross_checks: None,
    })
    .expect("model");
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: s.id,
        node_id: Some(node.id),
        concept_id: None,
        model_id: None,
        target_type: "note".to_string(),
        target_id: 99,
    })
    .expect("link");
    // Act：删体系 → 子表外键级联清空
    db.with_conn(|conn| {
        conn.execute("DELETE FROM knowledge_systems WHERE id = ?1", rusqlite::params![s.id])
            .map_err(Into::into)
    })
    .expect("delete system");
    // Assert：子表清空（节点/概念/模型/链接）
    assert!(db.list_knowledge_nodes(s.id).expect("nodes").is_empty());
    assert!(db.list_knowledge_concepts(Some(s.id), None).expect("concepts").is_empty());
    assert!(db.list_knowledge_models(s.id).expect("models").is_empty());
    assert!(db
        .list_knowledge_links(s.id, None, None, None)
        .expect("links")
        .is_empty());
}
