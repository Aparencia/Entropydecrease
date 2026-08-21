//! db_fragments 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::db_fragments::NewFragment;
use crate::types::NewNoteGroup;

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 碎片入参助手。
fn frag(text: &str, domain: Option<&str>, group_id: Option<i64>) -> NewFragment {
    NewFragment {
        text: text.to_string(),
        image_path: None,
        domain_tag: domain.map(|d| d.to_string()),
        group_id,
        source: "manual".to_string(),
    }
}

#[test]
fn create_and_list_roundtrip() {
    // Arrange
    let db = mem_db();
    db.create_fragment(&frag("眼影晕染技巧", Some("beauty"), None)).expect("c1");
    db.create_fragment(&frag("第二条碎片", None, None)).expect("c2");
    // Act
    let all = db.list_fragments(None, 100).expect("list");
    // Assert：倒序（最新在前）且字段完整
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].text, "第二条碎片");
    assert_eq!(all[1].domain_tag.as_deref(), Some("beauty"));
    assert_eq!(all[1].status, "active");
}

#[test]
fn list_by_group_only_active() {
    // Arrange：组内两条——一条归档
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "化妆美妆".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f1 = db.create_fragment(&frag("活跃碎片", Some("beauty"), Some(group.id))).expect("f1");
    let f2 = db.create_fragment(&frag("将归档碎片", Some("beauty"), Some(group.id))).expect("f2");
    db.set_fragment_status(f2.id, "archived").expect("archive");
    // Act
    let active = db.list_fragments_by_group(group.id).expect("list");
    // Assert：归档项不进学习循环
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].id, f1.id);
}

#[test]
fn count_by_group_and_status() {
    // Arrange：先建组（fragments.group_id 外键约束）
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "计数组".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    db.create_fragment(&frag("a", None, Some(group.id))).expect("a");
    db.create_fragment(&frag("b", None, Some(group.id))).expect("b");
    db.create_fragment(&frag("c", None, None)).expect("c");
    // Act/Assert：各口径计数正确
    assert_eq!(db.count_fragments(None, None).expect("all"), 3);
    assert_eq!(db.count_fragments(Some(group.id), None).expect("g1"), 2);
    assert_eq!(db.count_fragments(Some(group.id), Some("active")).expect("g1a"), 2);
    assert_eq!(db.count_fragments(Some(group.id), Some("archived")).expect("g1arch"), 0);
}

#[test]
fn move_fragment_between_groups() {
    // Arrange
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "目标组".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("fitness".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f = db.create_fragment(&frag("待移动", None, None)).expect("f");
    // Act
    db.update_fragment_group(f.id, Some(group.id)).expect("move");
    db.update_fragment_group(f.id, None).expect("ungroup");
    // Assert
    let fetched = db.list_fragments(None, 10).expect("list");
    assert_eq!(fetched[0].group_id, None);
}

#[test]
fn delete_group_keeps_fragments() {
    // Arrange：删组只断关联（碎片是用户资产，同笔记口径）
    let db = mem_db();
    let group = db
        .create_group(&NewNoteGroup {
            name: "将删".to_string(),
            terrain: "feed".to_string(),
            kind: "topic".to_string(),
            domain_tag: Some("beauty".to_string()),
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("group");
    let f = db.create_fragment(&frag("幸存", None, Some(group.id))).expect("f");
    // Act
    db.with_conn(|conn| {
        conn.execute("DELETE FROM note_groups WHERE id = ?1", rusqlite::params![group.id])
            .map_err(Into::into)
    })
    .expect("delete");
    // Assert
    let fetched = db.list_fragments(None, 10).expect("list");
    assert_eq!(fetched.len(), 1);
    assert_eq!(fetched[0].id, f.id);
    assert_eq!(fetched[0].group_id, None);
}
