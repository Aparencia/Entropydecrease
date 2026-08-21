//! db_note_groups 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::types::{NewNote, NewNoteGroup};

/// 内存库（schema 经 Db::open 初始化——建表幂等路径同真库）。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 组入参助手（container/standalone/route 默认）。
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
fn create_and_get_roundtrip() {
    // Arrange
    let db = mem_db();
    // Act
    let created = db.create_group(&group("微积分")).expect("create");
    let fetched = db.get_group(created.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.name, "微积分");
    assert_eq!(fetched.terrain, "container");
    assert_eq!(fetched.route_overridden, 0);
}

#[test]
fn series_key_lookup_idempotent() {
    // Arrange：同系列名的课程组幂等查找（组化接线依赖）
    let db = mem_db();
    let mut g = group("零基础化妆");
    g.kind = "course".to_string();
    g.source = "series".to_string();
    g.series_key = Some("零基础化妆".to_string());
    db.create_group(&g).expect("create");
    // Act
    let hit = db.find_group_by_series_key("零基础化妆").expect("find");
    let miss = db.find_group_by_series_key("不存在的系列").expect("find");
    // Assert
    assert!(hit.is_some());
    assert_eq!(hit.unwrap().kind, "course");
    assert!(miss.is_none());
}

#[test]
fn topic_group_lookup_by_domain_and_terrain() {
    // Arrange：feed 与 container 两地形的同领域主题组互不串台
    let db = mem_db();
    let mut g = group("化妆美妆");
    g.kind = "topic".to_string();
    g.domain_tag = Some("beauty".to_string());
    db.create_group(&g).expect("create container topic");
    // Act
    let hit = db.find_topic_group("beauty", "container").expect("find");
    let feed_miss = db.find_topic_group("beauty", "feed").expect("find");
    // Assert
    assert!(hit.is_some());
    assert!(feed_miss.is_none());
}

#[test]
fn list_groups_counts_notes() {
    // Arrange：两组——一组挂两条笔记，一组空
    let db = mem_db();
    let g1 = db.create_group(&group("组一")).expect("g1");
    let _g2 = db.create_group(&group("组二")).expect("g2");
    for title in ["笔记A", "笔记B"] {
        db.create_note(&NewNote {
            title: title.to_string(),
            content: "x".to_string(),
            source: "manual".to_string(),
            session_id: None,
            rule_version: None,
            purify_stats: None,
            tags: None,
            properties: None,
            group_id: Some(g1.id),
        })
        .expect("note");
    }
    // Act
    let groups = db.list_groups(None).expect("list");
    // Assert：空组也呈现（LEFT JOIN）；计数正确
    assert_eq!(groups.len(), 2);
    let one = groups.iter().find(|g| g.name == "组一").unwrap();
    let two = groups.iter().find(|g| g.name == "组二").unwrap();
    assert_eq!(one.note_count, 2);
    assert_eq!(two.note_count, 0);
}

#[test]
fn list_groups_filters_by_terrain() {
    // Arrange
    let db = mem_db();
    db.create_group(&group("容器组")).expect("c");
    let mut feed = group("碎片组");
    feed.terrain = "feed".to_string();
    db.create_group(&feed).expect("f");
    // Act
    let containers = db.list_groups(Some("container")).expect("list");
    // Assert
    assert_eq!(containers.len(), 1);
    assert_eq!(containers[0].name, "容器组");
}

#[test]
fn override_route_marks_and_updates() {
    // Arrange：自动路由的组被用户改判（REQ-198 修改即记忆）
    let db = mem_db();
    let g = db.create_group(&group("待改判")).expect("create");
    // Act
    let ok = db
        .override_group_route(g.id, "topic", Some("programming"), "用户改判：归编程主题组")
        .expect("override");
    let fetched = db.get_group(g.id).expect("get").expect("exists");
    // Assert
    assert!(ok);
    assert_eq!(fetched.kind, "topic");
    assert_eq!(fetched.domain_tag.as_deref(), Some("programming"));
    assert_eq!(fetched.route_overridden, 1);
    assert!(fetched.route_reason.unwrap().contains("用户改判"));
}

#[test]
fn override_course_group_clears_series_key() {
    // Arrange：课程组带系列键（审查修复回归：改判后系列键不得残留，
    // 否则后续同系列会话经 find_group_by_series_key 误归入已改判的组）
    let db = mem_db();
    let mut course = group("零基础化妆");
    course.kind = "course".to_string();
    course.source = "series".to_string();
    course.series_key = Some("零基础化妆".to_string());
    let g = db.create_group(&course).expect("create");
    // Act：改判为主题组
    db.override_group_route(g.id, "topic", Some("beauty"), "用户改判").expect("override");
    // Assert：系列键清空，系列查找不再命中
    let fetched = db.get_group(g.id).expect("get").expect("exists");
    assert_eq!(fetched.series_key, None);
    assert!(db.find_group_by_series_key("零基础化妆").expect("find").is_none());
}

#[test]
fn move_note_between_groups() {
    // Arrange
    let db = mem_db();
    let g1 = db.create_group(&group("甲组")).expect("g1");
    let g2 = db.create_group(&group("乙组")).expect("g2");
    let note = db
        .create_note(&NewNote {
            title: "待移动".to_string(),
            content: "x".to_string(),
            source: "manual".to_string(),
            session_id: None,
            rule_version: None,
            purify_stats: None,
            tags: None,
            properties: None,
            group_id: Some(g1.id),
        })
        .expect("note");
    // Act：甲→乙→移出
    db.update_note_group(note.id, Some(g2.id)).expect("move");
    assert_eq!(db.list_notes_by_group(g2.id).expect("l2").len(), 1);
    db.update_note_group(note.id, None).expect("ungroup");
    // Assert
    assert!(db.list_notes_by_group(g1.id).expect("l1").is_empty());
    assert!(db.list_notes_by_group(g2.id).expect("l2b").is_empty());
    assert_eq!(db.get_note(note.id).expect("get").unwrap().group_id, None);
}

#[test]
fn delete_group_keeps_notes() {
    // Arrange：删组只断关联不删笔记（笔记是用户资产）
    let db = mem_db();
    let g = db.create_group(&group("将删")).expect("create");
    let note = db
        .create_note(&NewNote {
            title: "幸存".to_string(),
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
    db.with_conn(|conn| {
        conn.execute("DELETE FROM note_groups WHERE id = ?1", rusqlite::params![g.id])
            .map_err(Into::into)
    })
    .expect("delete");
    // Assert：笔记存活且 group_id 置空（ON DELETE SET NULL）
    let fetched = db.get_note(note.id).expect("get").expect("exists");
    assert_eq!(fetched.group_id, None);
}
