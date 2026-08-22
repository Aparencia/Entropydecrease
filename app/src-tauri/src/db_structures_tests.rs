//! 结构图记录存储单测（REQ-183 / v0.7.7，AAA 模式）。
//!
//! @ai-context: 内存库隔离（不触碰真实数据）；外键 ON——记录必须先建真实会话；
//!              覆盖建表幂等/CRUD/删除返回/排序/外键级联（删会话清记录）。

use super::*;
use crate::db::Db;

/// 建会话（外键约束前置）→ 返回 session id。
fn session(db: &Db) -> i64 {
    db.create_session(&crate::types::NewSession {
        title: "测试会话".to_string(),
        source_window: None,
        profile: None,
        kind: None,
    })
    .unwrap()
    .id
}

/// 构造记录（id 由 DB 分配）。
fn rec(session_id: i64, kind: &str, ts: u64) -> StructureImageRecord {
    StructureImageRecord {
        id: 0,
        session_id,
        screen_id: Some(1),
        kind: kind.to_string(),
        bbox: r#"{"x":10,"y":20,"w":100,"h":50}"#.to_string(),
        source_ts_ms: ts,
        crop_path: format!("struct/{}.webp", ts),
        source: "auto".to_string(),
        created_at: ts,
    }
}

#[test]
fn insert_and_list_roundtrip() {
    // Arrange：内存库 + 会话 + 两条记录
    let db = Db::open(":memory:").unwrap();
    let sid = session(&db);
    let a = rec(sid, "table", 1_000);
    let b = rec(sid, "image", 2_000);

    // Act
    let id_a = insert_structure_image(&db, &a).unwrap();
    let id_b = insert_structure_image(&db, &b).unwrap();
    let list = list_structure_images(&db, sid).unwrap();

    // Assert：id 分配 + 按入库时间升序 + 字段完整
    assert!(id_a < id_b);
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].crop_path, "struct/1000.webp");
    assert_eq!(list[1].kind, "image");
    assert_eq!(list[1].source_ts_ms, 2_000);
    assert_eq!(list[0].screen_id, Some(1));
}

#[test]
fn list_scoped_to_session() {
    // Arrange：两个会话各一条
    let db = Db::open(":memory:").unwrap();
    let s1 = session(&db);
    let s2 = session(&db);
    insert_structure_image(&db, &rec(s1, "code", 1_000)).unwrap();
    insert_structure_image(&db, &rec(s2, "manual", 5_000)).unwrap();

    // Act
    let list = list_structure_images(&db, s1).unwrap();

    // Assert：只返回会话 1
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].session_id, s1);
}

#[test]
fn delete_returns_record_then_missing() {
    // Arrange
    let db = Db::open(":memory:").unwrap();
    let sid = session(&db);
    let id = insert_structure_image(&db, &rec(sid, "formula", 3_000)).unwrap();

    // Act：删除（返回记录）+ 再删（None）
    let removed = delete_structure_image(&db, id).unwrap();
    let again = delete_structure_image(&db, id).unwrap();

    // Assert：首删返回记录（文件删除由命令层驱动），再删 None
    assert_eq!(removed.as_ref().unwrap().kind, "formula");
    assert_eq!(removed.unwrap().crop_path, "struct/3000.webp");
    assert!(again.is_none());
    assert!(list_structure_images(&db, sid).unwrap().is_empty());
}

#[test]
fn init_is_idempotent_and_supports_null_screen() {
    // Arrange：重复 init 不报错
    let db = Db::open(":memory:").unwrap();
    let sid = session(&db);

    // Act：再次建表（幂等）+ 无屏记录（旧数据降级形态）
    {
        let conn = db.conn.lock().unwrap();
        init(&conn).unwrap();
    }
    let mut old = rec(sid, "image", 1_000);
    old.screen_id = None;
    insert_structure_image(&db, &old).unwrap();
    let list = list_structure_images(&db, sid).unwrap();

    // Assert：幂等成功 + NULL screen_id 往返
    assert_eq!(list[0].screen_id, None);
}

#[test]
fn session_cascade_deletes_records() {
    // Arrange：建会话 + 结构图记录
    let db = Db::open(":memory:").unwrap();
    let sid = session(&db);
    insert_structure_image(&db, &rec(sid, "table", 1_000)).unwrap();
    assert_eq!(list_structure_images(&db, sid).unwrap().len(), 1);

    // Act：删除会话（外键级联）
    db.delete_session(sid).unwrap();

    // Assert：记录随会话清除
    assert!(list_structure_images(&db, sid).unwrap().is_empty());
}
