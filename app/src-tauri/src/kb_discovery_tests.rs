//! kb_discovery.rs 单测（发现建议——证据/排除已链接/跨体系相似提示 golden）。

use crate::db::Db;
use crate::db_fragments::NewFragment;
use crate::kb_discovery::{concept_name_overlap, normalize_name};
use crate::types::{NewKnowledgeLink, NewNote};

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

/// 建体系（返回 id）——原料直接 SQL（非被测面，含 NOT NULL 默认列最小集）。
fn insert_system(db: &Db, name: &str) -> i64 {
    db.with_conn(|c| {
        c.execute(
            "INSERT INTO knowledge_systems (name, created_at, updated_at) VALUES (?1, 1, 1)",
            [name],
        )?;
        Ok(c.last_insert_rowid())
    })
    .expect("system")
}

fn insert_concept(db: &Db, system_id: i64, name: &str) -> i64 {
    db.with_conn(|c| {
        c.execute(
            "INSERT INTO knowledge_concepts (system_id, name, created_at, updated_at)
             VALUES (?1, ?2, 1, 1)",
            rusqlite::params![system_id, name],
        )?;
        Ok(c.last_insert_rowid())
    })
    .expect("concept")
}

fn make_note(content: &str) -> NewNote {
    NewNote {
        title: "素材".into(),
        content: content.into(),
        source: "manual".into(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: None,
    }
}

#[test]
fn overlap_detects_contains_both_ways_and_rejects_single_char() {
    // Arrange/Act/Assert（归一化后双向包含；短边 <2 字不参与）
    assert!(concept_name_overlap("眼影晕染", "眼影晕染技巧"));
    assert!(concept_name_overlap("眼影晕染技巧", "眼影晕染"));
    assert!(!concept_name_overlap("晕染", "雾面"));
    assert!(!concept_name_overlap("影", "眼影晕染"), "单字不参与");
    // 全角/空格/大小写归一化（"A" 用全角 Ａ）
    assert_eq!(normalize_name("  Ｂ站 教程 "), "b站教程");
    assert_eq!(normalize_name("B站教程"), "b站教程");
}

#[test]
fn evidence_excludes_already_linked_targets() {
    // Arrange：两篇同义素材，其中一篇已由概念挂引用
    let db = mem_db();
    let system = insert_system(&db, "化妆");
    let concept = insert_concept(&db, system, "眼影晕染手法");
    let note_a = db.create_note(&make_note("# 眼影晕染手法\n\n晕染少量多次。")).expect("nA");
    let note_b = db.create_note(&make_note("# 眼影晕染手法\n\n晕染少量多次。")).expect("nB");
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: system,
        node_id: None,
        concept_id: Some(concept),
        model_id: None,
        target_type: "note".to_string(),
        target_id: note_a.id,
    })
    .expect("link");
    // Act
    let res = db.kb_discovery_suggest(concept).expect("suggest").expect("exists");
    // Assert：A 已被链接 → 排除；B 仍建议
    assert!(
        !res.evidence.iter().any(|h| h.note_id == Some(note_a.id)),
        "已链接素材不得重复建议"
    );
    assert!(res.evidence.iter().any(|h| h.note_id == Some(note_b.id)));
}

#[test]
fn fragment_target_excluded_too() {
    // Arrange：碎片已链 → 排除
    let db = mem_db();
    let system = insert_system(&db, "化妆");
    let concept = insert_concept(&db, system, "高光点涂");
    let frag = db
        .create_fragment(&NewFragment {
            text: "高光点涂在颧骨上方，少量多次。".into(),
            image_path: None,
            domain_tag: None,
            group_id: None,
            source: "manual".into(),
        })
        .expect("frag");
    db.add_knowledge_link(&NewKnowledgeLink {
        system_id: system,
        node_id: None,
        concept_id: Some(concept),
        model_id: None,
        target_type: "fragment".to_string(),
        target_id: frag.id,
    })
    .expect("link");
    // Act/Assert
    let res = db.kb_discovery_suggest(concept).expect("suggest").expect("exists");
    assert!(!res.evidence.iter().any(|h| h.fragment_id == Some(frag.id)));
}

#[test]
fn similar_hints_only_cross_system() {
    // Arrange：体系 A 概念 X；体系 B 有高度相似名概念；同体系另有概念不得提示
    let db = mem_db();
    let sys_a = insert_system(&db, "化妆体系");
    let sys_b = insert_system(&db, "绘画体系");
    let x = insert_concept(&db, sys_a, "眼影晕染");
    insert_concept(&db, sys_a, "眼影晕染同体系近名"); // 同体系 → 不提示
    let y = insert_concept(&db, sys_b, "眼影晕染技巧");
    insert_concept(&db, sys_b, "素描排线");
    // Act
    let res = db.kb_discovery_suggest(x).expect("suggest").expect("exists");
    // Assert：仅跨体系相似概念入提示
    assert_eq!(res.similar.len(), 1, "similar={:?}", res.similar);
    assert_eq!(res.similar[0].concept_id, y);
    assert_eq!(res.similar[0].system_name, "绘画体系");
}

#[test]
fn missing_concept_returns_none() {
    // Arrange/Act/Assert
    let db = mem_db();
    assert!(db.kb_discovery_suggest(9999).expect("suggest").is_none());
}
