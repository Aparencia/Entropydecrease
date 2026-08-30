//! commands_groups 删除命令单测（v0.14.1；inner 纯编排——内存库 AAA 模式）。

use crate::commands_groups::{delete_note_group_inner, get_group_delete_impact_inner};
use crate::db::Db;
use crate::types::{NewNote, NewNoteGroup};

fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

fn group(name: &str) -> NewNoteGroup {
    NewNoteGroup {
        name: name.to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    }
}

#[test]
fn impact_rejects_invalid_id() {
    // Arrange
    let db = mem_db();
    // Act / Assert
    assert!(get_group_delete_impact_inner(&db, 0).is_err());
    assert!(get_group_delete_impact_inner(&db, -1).is_err());
}

#[test]
fn impact_rejects_missing_group() {
    // Arrange
    let db = mem_db();
    // Act
    let err = get_group_delete_impact_inner(&db, 999).expect_err("missing");
    // Assert
    assert!(err.contains("不存在"));
}

#[test]
fn impact_returns_counts_for_existing_group() {
    // Arrange：组 + 1 笔记
    let db = mem_db();
    let g = db.create_group(&group("将删")).expect("create");
    db.create_note(&NewNote {
        title: "A".to_string(),
        content: "x".to_string(),
        source: "manual".to_string(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
        group_id: Some(g.id),
    })
    .expect("note");
    // Act
    let impact = get_group_delete_impact_inner(&db, g.id).expect("impact");
    // Assert
    assert_eq!(impact.notes, 1);
    assert_eq!(impact.cards, 0);
    assert_eq!(impact.system_refs, 0);
}

#[test]
fn delete_rejects_invalid_and_missing() {
    // Arrange
    let db = mem_db();
    // Act / Assert
    assert!(delete_note_group_inner(&db, 0).is_err());
    assert!(delete_note_group_inner(&db, 999).is_err());
}

#[test]
fn delete_removes_group() {
    // Arrange
    let db = mem_db();
    let g = db.create_group(&group("将删")).expect("create");
    // Act
    let ok = delete_note_group_inner(&db, g.id).expect("delete");
    // Assert
    assert!(ok);
    assert!(db.get_group(g.id).expect("get").is_none());
}
