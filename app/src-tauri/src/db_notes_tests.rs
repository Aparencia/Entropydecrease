//! db_notes.rs 单测（H3 拆分：原 db.rs tests 模块整体迁移，语义不变）。

use crate::db::Db;
use crate::types::NewNote;

fn mem_db() -> Db {
    // Arrange：内存库，绝不触碰真实文件（环境隔离）
    Db::open(":memory:").expect("open in-memory db")
}

#[test]
fn create_and_get_note_roundtrip() {
    // Arrange
    let db = mem_db();
    let new = NewNote { title: "物理".into(), content: "# 牛顿\nF=ma".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None };
    // Act
    let created = db.create_note(&new).expect("create");
    let fetched = db.get_note(created.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.title, "物理");
    assert_eq!(fetched.content, "# 牛顿\nF=ma");
    assert_eq!(fetched.source, "manual");
}

#[test]
fn list_orders_by_updated_desc() {
    // Arrange
    let db = mem_db();
    db.create_note(&NewNote { title: "A".into(), content: "a".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    db.create_note(&NewNote { title: "B".into(), content: "b".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    // Act
    let notes = db.list_notes().expect("list");
    // Assert
    assert_eq!(notes.len(), 2);
}

#[test]
fn update_note_changes_content() {
    // Arrange
    let db = mem_db();
    let created = db.create_note(&NewNote { title: "旧".into(), content: "旧内容".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    // Act
    let ok = db.update_note(created.id, "新标题", "新内容").expect("update");
    let fetched = db.get_note(created.id).unwrap().unwrap();
    // Assert
    assert!(ok);
    assert_eq!(fetched.title, "新标题");
    assert_eq!(fetched.content, "新内容");
}

#[test]
fn delete_note_removes_row() {
    // Arrange
    let db = mem_db();
    let created = db.create_note(&NewNote { title: "待删".into(), content: "x".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    // Act
    let ok = db.delete_note(created.id).expect("delete");
    let fetched = db.get_note(created.id).expect("get");
    // Assert
    assert!(ok);
    assert!(fetched.is_none());
}

#[test]
fn search_matches_title_and_content() {
    // Arrange
    let db = mem_db();
    db.create_note(&NewNote { title: "化学课".into(), content: "讲分子".into(), source: "classroom".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    db.create_note(&NewNote { title: "随笔".into(), content: "含熵减概念".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    // Act
    let by_title = db.search_notes("化学").expect("search");
    let by_content = db.search_notes("熵减").expect("search");
    // Assert
    assert_eq!(by_title.len(), 1);
    assert_eq!(by_title[0].title, "化学课");
    assert_eq!(by_content.len(), 1);
}

#[test]
fn search_escapes_wildcards() {
    // Arrange：用户输入含 % 应作为字面量
    let db = mem_db();
    db.create_note(&NewNote { title: "50%off".into(), content: "促销".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    db.create_note(&NewNote { title: "normal".into(), content: "普通".into(), source: "manual".into(), session_id: None, rule_version: None, purify_stats: None, tags: None, properties: None, group_id: None }).unwrap();
    // Act：搜索字面 "%"
    let result = db.search_notes("%off").expect("search");
    // Assert：只命中含字面 %off 的，不应命中所有
    assert_eq!(result.len(), 1);
}

// ── v0.7.1 会话↔笔记关联（迁移 / SET NULL / find_note_by_session）──

/// 旧库（无 session_id 列）打开后列补齐，旧笔记 session_id=NULL（诚实不猜）。
#[test]
fn migration_adds_session_id_to_notes() {
    // Arrange：手工造旧 schema 库（notes 无 session_id 列，含一条旧数据）
    let path = std::env::temp_dir().join(format!("entropy_mig_notes_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    {
        let conn = rusqlite::Connection::open(&path).expect("open old db");
        conn.execute_batch(
            "CREATE TABLE notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            INSERT INTO notes (title, content, source, created_at, updated_at)
                VALUES ('旧笔记', 'v0.6.0 数据', 'classroom', 1, 1);",
        )
        .expect("create old schema");
    }
    // Act：以新代码打开旧库（触发 ensure_column 迁移）
    let db = Db::open(path.to_str().unwrap()).expect("open migrated db");
    let old = db.list_notes().expect("list").pop().expect("old note");
    // Assert：列补齐、旧数据读回、session_id 诚实为 None
    assert_eq!(old.title, "旧笔记");
    assert_eq!(old.session_id, None);
    let _ = std::fs::remove_file(&path);
}

// ── v0.7.5 规则版本/净化统计元数据（REQ-171：迁移 / 落库 / 旧数据 NULL）──

/// 旧库（无 rule_version/purify_stats 列）打开后列补齐，旧笔记两字段 NULL
/// （诚实降级——不猜不填，ADR-014 先例）。
#[test]
fn migration_adds_rule_metadata_to_notes() {
    // Arrange：手工造旧 schema 库（notes 无 v0.7.5 两列，含一条旧数据）
    let path = std::env::temp_dir().join(format!("entropy_mig_rules_{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    {
        let conn = rusqlite::Connection::open(&path).expect("open old db");
        conn.execute_batch(
            "CREATE TABLE notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                session_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            INSERT INTO notes (title, content, source, session_id, created_at, updated_at)
                VALUES ('旧笔记', 'v0.7.4 数据', 'classroom', 1, 1, 1);",
        )
        .expect("create old schema");
    }
    // Act：以新代码打开旧库（触发 ensure_column 迁移）
    let db = Db::open(path.to_str().unwrap()).expect("open migrated db");
    let old = db.list_notes().expect("list").pop().expect("old note");
    // Assert：列补齐、旧数据读回、两字段诚实为 None
    assert_eq!(old.title, "旧笔记");
    assert_eq!(old.rule_version, None);
    assert_eq!(old.purify_stats, None);
    let _ = std::fs::remove_file(&path);
}

/// 新笔记落库携带规则版本与净化统计（会话→笔记链路口径）；读回一致。
#[test]
fn create_note_roundtrips_rule_metadata() {
    // Arrange（外键 ON：先建会话再关联）
    let db = mem_db();
    let session = db
        .create_session(&crate::types::NewSession {
            title: "会话".into(),
            source_window: None,
            profile: None,
        })
        .expect("create session");
    let new = NewNote {
        title: "净化笔记".into(),
        content: "内容".into(),
        source: "classroom".into(),
        session_id: Some(session.id),
        rule_version: Some("note-rules-0.7.5".into()),
        purify_stats: Some(r#"{"filler":2,"verbal":3}"#.into()),
        tags: None,
        properties: None, group_id: None,
    };
    // Act
    let created = db.create_note(&new).expect("create");
    let fetched = db.get_note(created.id).expect("get").expect("exists");
    // Assert：元数据落库并读回
    assert_eq!(fetched.rule_version.as_deref(), Some("note-rules-0.7.5"));
    assert_eq!(fetched.purify_stats.as_deref(), Some(r#"{"filler":2,"verbal":3}"#));
}

/// 删除会话 → 笔记保留、关联断开（ON DELETE SET NULL 生效）。
#[test]
fn delete_session_keeps_note_and_breaks_link() {        // Arrange
    let db = mem_db();
    let session = db.create_session(&crate::types::NewSession {
        title: "待删会话".into(),
        source_window: None,
        profile: None,
    }).expect("create session");
    let note = db.create_note(&NewNote {
        title: "关联笔记".into(),
        content: "内容".into(),
        source: "classroom".into(),
        session_id: Some(session.id),
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None, group_id: None,
    }).expect("create note");
    // Act：删除会话
    let deleted = db.delete_session(session.id).expect("delete session");
    let fetched = db.get_note(note.id).expect("get note").expect("note kept");
    // Assert：会话删除成功、笔记仍在、关联已断开
    assert!(deleted);
    assert_eq!(fetched.session_id, None);
    assert!(db.get_session(session.id).unwrap().is_none());
}

/// find_note_by_session：无关联 / 单条 / 多次转换取最新。
#[test]
fn find_note_by_session_picks_latest() {
    // Arrange：两条会话笔记（先旧后新）+ 一条手动笔记
    let db = mem_db();
    let session = db.create_session(&crate::types::NewSession {
        title: "会话".into(),
        source_window: None,
        profile: None,
    }).expect("create session");
    let older = db.create_note(&NewNote {
        title: "第一版".into(),
        content: "v1".into(),
        source: "classroom".into(),
        session_id: Some(session.id),
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None, group_id: None,
    }).expect("create older");
    let newer = db.create_note(&NewNote {
        title: "第二版".into(),
        content: "v2".into(),
        source: "classroom".into(),
        session_id: Some(session.id),
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None, group_id: None,
    }).expect("create newer");
    db.create_note(&NewNote {
        title: "手动".into(),
        content: "m".into(),
        source: "manual".into(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None, group_id: None,
    }).expect("create manual");
    // Act
    let found = db.find_note_by_session(session.id).expect("find");
    let none = db.find_note_by_session(999).expect("find none");
    // Assert：取最新（第二版）；无关会话返回 None；手动笔记不干扰
    assert_eq!(found.as_ref().unwrap().id, newer.id);
    assert_ne!(found.as_ref().unwrap().id, older.id);
    assert!(none.is_none());
}
