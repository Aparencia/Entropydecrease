//! db_knowledge_links 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::db_fragments::NewFragment;
use crate::db_knowledge_links::LinkTarget;
use crate::types::{
    NewKnowledgeConcept, NewKnowledgeLink, NewKnowledgeModel, NewKnowledgeNode,
    NewKnowledgeSystem, NewNote, NewNoteGroup,
};

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
fn add_and_list_and_delete_roundtrip() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db);
    let l = db
        .add_knowledge_link(&NewKnowledgeLink {
            system_id: sid,
            node_id: None,
            concept_id: None,
            model_id: None,
            target_type: "note_group".to_string(),
            target_id: 5,
        })
        .expect("create");
    // Act：列出 + 删除
    let links = db.list_knowledge_links(sid, None, None, None).expect("list");
    let del = db.delete_knowledge_link(l.id).expect("delete");
    let after = db.list_knowledge_links(sid, None, None, None).expect("after");
    // Assert
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].target_type, "note_group");
    assert!(del);
    assert!(after.is_empty());
}

#[test]
fn list_filters_by_node_concept_model() {
    // Arrange：先建节点/概念/模型（FK 引用须指向真实行），三引用各挂一种
    let db = mem_db();
    let sid = host_system(&db);
    let node = db
        .add_knowledge_node(&NewKnowledgeNode {
            system_id: sid,
            parent_id: None,
            r#type: "question".to_string(),
            text: "节点".to_string(),
            order_idx: 0,
        })
        .expect("node");
    let concept = db
        .add_knowledge_concept(&NewKnowledgeConcept {
            system_id: sid,
            name: "概念".to_string(),
            essence: None,
            boundary: None,
            relation: None,
        })
        .expect("concept");
    let model = db
        .add_knowledge_model(&NewKnowledgeModel {
            system_id: sid,
            name: "模型".to_string(),
            disciplines: r#"["a"]"#.to_string(),
            claim: None,
            valid_when: None,
            invalid_when: None,
            cross_checks: None,
        })
        .expect("model");
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: Some(node.id),
        concept_id: None,
        model_id: None,
        target_type: "note".to_string(),
        target_id: 1,
    })
    .expect("node link");
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: None,
        concept_id: Some(concept.id),
        model_id: None,
        target_type: "fragment".to_string(),
        target_id: 2,
    })
    .expect("concept link");
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: sid,
        node_id: None,
        concept_id: None,
        model_id: Some(model.id),
        target_type: "flashcard".to_string(),
        target_id: 3,
    })
    .expect("model link");
    // Act
    let nodes = db.list_knowledge_links(sid, Some(node.id), None, None).expect("nodes");
    let concepts = db.list_knowledge_links(sid, None, Some(concept.id), None).expect("concepts");
    let models = db.list_knowledge_links(sid, None, None, Some(model.id)).expect("models");
    // Assert：过滤正确
    assert_eq!(nodes.len(), 1);
    assert_eq!(concepts.len(), 1);
    assert_eq!(models.len(), 1);
}

#[test]
fn link_target_exists_four_types() {
    // Arrange：四类目标各建一条
    let db = mem_db();
    let group = db.create_group(&NewNoteGroup {
        name: "组".to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("group");
    let note = db
        .create_note(&NewNote {
            title: "笔记".to_string(),
            content: "x".to_string(),
            source: "manual".to_string(),
            session_id: None,
            rule_version: None,
            purify_stats: None,
            tags: None,
            properties: None,
            group_id: Some(group.id),
        })
        .expect("note");
    let card = db
        .create_card(&NewFlashcard {
            group_id: group.id,
            note_id: Some(note.id),
            fragment_id: None,
            front: "f".to_string(),
            back: "b".to_string(),
            kind: "fact".to_string(),
            state_json: "{}".to_string(),
            due_at: 0,
        })
        .expect("card");
    let frag = db
        .create_fragment(&NewFragment {
            text: "碎片".to_string(),
            image_path: None,
            domain_tag: None,
            group_id: Some(group.id),
            source: "manual".to_string(),
        })
        .expect("frag");
    // Act：四类 true；不存在 id false
    let ok_group = db.link_target_exists(LinkTarget::NoteGroup, group.id).expect("g");
    let ok_note = db.link_target_exists(LinkTarget::Note, note.id).expect("n");
    let ok_card = db.link_target_exists(LinkTarget::Flashcard, card.id).expect("c");
    let ok_frag = db.link_target_exists(LinkTarget::Fragment, frag.id).expect("f");
    let miss_group = db.link_target_exists(LinkTarget::NoteGroup, 999_999).expect("gm");
    let miss_note = db.link_target_exists(LinkTarget::Note, 999_999).expect("nm");
    let miss_card = db.link_target_exists(LinkTarget::Flashcard, 999_999).expect("cm");
    let miss_frag = db.link_target_exists(LinkTarget::Fragment, 999_999).expect("fm");
    // Assert
    assert!(ok_group);
    assert!(ok_note);
    assert!(ok_card);
    assert!(ok_frag);
    assert!(!miss_group);
    assert!(!miss_note);
    assert!(!miss_card);
    assert!(!miss_frag);
}
