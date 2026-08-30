//! db_graph 单测（内存库；AAA 模式；v0.14 C2 spec §6 命令层用例）。
//!
//! @ai-context: 覆盖三类边聚合正确性——link（体系实体→内容，node_id 引用跳过）、
//!              trace（同源会话互连，2~6 张边界）、belong（笔记→组）；节点四表
//!              全量 + 笔记显式色解析。

use crate::db::Db;
use crate::types::{
    NewKnowledgeConcept, NewKnowledgeLink, NewKnowledgeModel, NewKnowledgeNode,
    NewKnowledgeSystem, NewNote, NewNoteGroup, NewSession,
};

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个体系并返回 id。
fn host_system(db: &Db) -> i64 {
    db.create_knowledge_system(&NewKnowledgeSystem {
        name: "摄影体系".to_string(),
        kind: "domain".to_string(),
        parent_system_id: None,
        core_question: None,
    })
    .expect("create system")
    .id
}

/// 建组（kind 默认 standalone；color 经 update_group_color——create_group 无 color 入参）。
fn add_group(db: &Db, name: &str, color: Option<&str>) -> i64 {
    let gid = db
        .create_group(&NewNoteGroup {
            name: name.to_string(),
            terrain: "container".to_string(),
            kind: "standalone".to_string(),
            domain_tag: None,
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("create group")
        .id;
    if let Some(c) = color {
        db.update_group_color(gid, Some(c)).expect("set group color");
    }
    gid
}

/// 建笔记（session_id/group_id/properties 可指定）。
fn add_note(db: &Db, title: &str, session_id: Option<i64>, group_id: Option<i64>, properties: Option<&str>) -> i64 {
    db.create_note(&NewNote {
        title: title.to_string(),
        content: "内容".to_string(),
        source: "classroom".to_string(),
        session_id,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: properties.map(String::from),
        group_id,
    })
    .expect("create note")
    .id
}

/// 建会话（notes.session_id 外键目标；返回 id）。
fn add_session(db: &Db, title: &str) -> i64 {
    db.create_session(&NewSession {
        title: title.to_string(),
        source_window: None,
        profile: None,
        kind: None,
    })
    .expect("create session")
    .id
}

#[test]
fn empty_db_returns_empty_snapshot() {
    // Arrange
    let db = mem_db();
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert
    assert!(snap.nodes.is_empty());
    assert!(snap.edges.is_empty());
}

#[test]
fn aggregates_four_kinds_of_nodes_with_labels_and_colors() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db);
    let gid = add_group(&db, "化妆课", Some("red"));
    add_note(&db, "底妆笔记", None, Some(gid), Some(r#"{"color":"blue"}"#));
    db.add_knowledge_concept(&NewKnowledgeConcept {
        system_id: sid,
        name: "妆前保湿".to_string(),
        essence: None,
        boundary: None,
        relation: None,
    })
    .expect("concept");
    db.add_knowledge_model(&NewKnowledgeModel {
        system_id: sid,
        name: "三庭五眼".to_string(),
        disciplines: "[\"美学\"]".to_string(),
        claim: None,
        valid_when: None,
        invalid_when: None,
        cross_checks: None,
    })
    .expect("model");
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert：四类节点齐全，label/color/system_id 正确
    assert_eq!(snap.nodes.len(), 4);
    let note = snap.nodes.iter().find(|n| n.kind == "note").expect("note");
    assert_eq!(note.label, "底妆笔记");
    assert_eq!(note.color.as_deref(), Some("blue"), "笔记显式色进图谱");
    let group = snap.nodes.iter().find(|n| n.kind == "group").expect("group");
    assert_eq!(group.color.as_deref(), Some("red"), "组色进图谱");
    let concept = snap.nodes.iter().find(|n| n.kind == "concept").expect("concept");
    assert_eq!(concept.label, "妆前保湿");
    assert_eq!(concept.system_id, Some(sid), "概念带体系归属供跳转");
    let model = snap.nodes.iter().find(|n| n.kind == "model").expect("model");
    assert_eq!(model.label, "三庭五眼");
    assert_eq!(model.system_id, Some(sid));
}

#[test]
fn link_edges_cover_concept_and_model_targets() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db);
    let gid = add_group(&db, "化妆课", None);
    let nid = add_note(&db, "底妆笔记", None, Some(gid), None);
    let cid = db
        .add_knowledge_concept(&NewKnowledgeConcept {
            system_id: sid,
            name: "妆前保湿".to_string(),
            essence: None,
            boundary: None,
            relation: None,
        })
        .expect("concept")
        .id;
    let mid = db
        .add_knowledge_model(&NewKnowledgeModel {
            system_id: sid,
            name: "三庭五眼".to_string(),
            disciplines: "[\"美学\"]".to_string(),
            claim: None,
            valid_when: None,
            invalid_when: None,
            cross_checks: None,
        })
        .expect("model")
        .id;
    // 概念 → 笔记；模型 → 组
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: None,
        concept_id: Some(cid),
        model_id: None,
        target_type: "note".to_string(),
        target_id: nid,
    })
    .expect("link c->note");
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: None,
        concept_id: None,
        model_id: Some(mid),
        target_type: "note_group".to_string(),
        target_id: gid,
    })
    .expect("link m->group");
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert
    let links: Vec<_> = snap.edges.iter().filter(|e| e.edge_type == "link").collect();
    assert_eq!(links.len(), 2);
    assert!(links.iter().any(|e| e.source == format!("concept:{cid}") && e.target == format!("note:{nid}")));
    assert!(links.iter().any(|e| e.source == format!("model:{mid}") && e.target == format!("group:{gid}")));
}

#[test]
fn node_only_and_non_graph_target_links_are_skipped() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db);
    // 真实知识节点（node_id 外键约束）；node_id 引用不进图谱（问题节点无图谱节点类型）
    let nid = db
        .add_knowledge_node(&NewKnowledgeNode {
            system_id: sid,
            parent_id: None,
            r#type: "question".to_string(),
            text: "如何上底妆".to_string(),
            order_idx: 0,
        })
        .expect("node")
        .id;
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: Some(nid),
        concept_id: None,
        model_id: None,
        target_type: "note".to_string(),
        target_id: 1,
    })
    .expect("node-only link");
    // 真实概念（concept_id 外键约束）；flashcard 目标无图谱节点类型 → 跳过
    let cid = db
        .add_knowledge_concept(&NewKnowledgeConcept {
            system_id: sid,
            name: "妆前保湿".to_string(),
            essence: None,
            boundary: None,
            relation: None,
        })
        .expect("concept")
        .id;
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: None,
        concept_id: Some(cid),
        model_id: None,
        target_type: "flashcard".to_string(),
        target_id: 1,
    })
    .expect("flashcard link");
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert：两类都不产生 link 边
    assert!(snap.edges.iter().all(|e| e.edge_type != "link"));
}

#[test]
fn belong_edges_connect_notes_to_groups() {
    // Arrange
    let db = mem_db();
    let gid = add_group(&db, "化妆课", None);
    let nid = add_note(&db, "底妆笔记", None, Some(gid), None);
    add_note(&db, "手动笔记", None, None, None); // 无组 → 无 belong 边
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert
    let belongs: Vec<_> = snap.edges.iter().filter(|e| e.edge_type == "belong").collect();
    assert_eq!(belongs.len(), 1);
    assert_eq!(belongs[0].source, format!("note:{nid}"));
    assert_eq!(belongs[0].target, format!("group:{gid}"));
}

#[test]
fn trace_edges_link_same_session_notes() {
    // Arrange：同一会话 3 张笔记（两两互连 3 条）+ 另一会话 2 张（1 条）+ 单张（无边）
    let db = mem_db();
    let s1 = add_session(&db, "会话1");
    let s2 = add_session(&db, "会话2");
    let s3 = add_session(&db, "会话3");
    add_note(&db, "A1", Some(s1), None, None);
    add_note(&db, "A2", Some(s1), None, None);
    add_note(&db, "A3", Some(s1), None, None);
    add_note(&db, "B1", Some(s2), None, None);
    add_note(&db, "B2", Some(s2), None, None);
    add_note(&db, "C1", Some(s3), None, None);
    add_note(&db, "手动", None, None, None);
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert
    let traces: Vec<_> = snap.edges.iter().filter(|e| e.edge_type == "trace").collect();
    assert_eq!(traces.len(), 4, "会话1 三张两两互连(3) + 会话2 两张(1)");
    assert!(traces.iter().all(|e| e.source.starts_with("note:") && e.target.starts_with("note:")));
}

#[test]
fn trace_edges_skip_single_and_oversized_sessions() {
    // Arrange：会话 1 单张（无边）；会话 2 七张（>TRACE_MAX_PER_SESSION=6，跳过防毛线球）
    let db = mem_db();
    let s1 = add_session(&db, "会话1");
    let s2 = add_session(&db, "会话2");
    add_note(&db, "Solo", Some(s1), None, None);
    for i in 0..7 {
        add_note(&db, &format!("F{i}"), Some(s2), None, None);
    }
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert
    assert!(snap.edges.iter().all(|e| e.edge_type != "trace"));
}

#[test]
fn combined_snapshot_mixes_all_edge_types() {
    // Arrange：一库全场景（体系+概念+组+笔记+三类边）
    let db = mem_db();
    let sid = host_system(&db);
    let gid = add_group(&db, "化妆课", None);
    let s1 = add_session(&db, "会话1");
    let n1 = add_note(&db, "底妆笔记", Some(s1), Some(gid), None);
    let n2 = add_note(&db, "眼妆笔记", Some(s1), Some(gid), None);
    let cid = db
        .add_knowledge_concept(&NewKnowledgeConcept {
            system_id: sid,
            name: "妆前保湿".to_string(),
            essence: None,
            boundary: None,
            relation: None,
        })
        .expect("concept")
        .id;
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: None,
        concept_id: Some(cid),
        model_id: None,
        target_type: "note".to_string(),
        target_id: n1,
    })
    .expect("link");
    // Act
    let snap = db.graph_snapshot().expect("snapshot");
    // Assert：三类边并存（1 link + 1 trace + 2 belong）
    assert_eq!(snap.edges.iter().filter(|e| e.edge_type == "link").count(), 1);
    assert_eq!(snap.edges.iter().filter(|e| e.edge_type == "trace").count(), 1);
    assert_eq!(snap.edges.iter().filter(|e| e.edge_type == "belong").count(), 2);
    assert_eq!(snap.edges.iter().find(|e| e.edge_type == "trace").expect("t").source, format!("note:{n1}"));
    assert_eq!(snap.edges.iter().find(|e| e.edge_type == "trace").expect("t2").target, format!("note:{n2}"));
}
