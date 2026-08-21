//! commands_note_images 单测（AAA；内存库 + 临时目录，环境隔离）。

use std::fs;

use crate::commands_note_images::{import_image_file, resolve_note_image_path};
use crate::db::Db;
use crate::types::{NewNote, Note};

/// 构造带指定来源会话的笔记（内存库；会话外键需先存在）。
fn make_note(session_id: Option<i64>) -> Note {
    let db = Db::open(":memory:").expect("in-memory db");
    if let Some(sid) = session_id {
        db.conn.lock().unwrap()
            .execute(
                "INSERT INTO sessions (id, title, started_at) VALUES (?1, '测试会话', 1)",
                rusqlite::params![sid],
            )
            .expect("建会话");
    }
    let new = NewNote {
        title: "测试笔记".into(),
        content: "内容".into(),
        source: "manual".into(),
        session_id,
        rule_version: None,
        purify_stats: None,
        tags: None,
        properties: None,
    };
    db.create_note(&new).expect("create")
}

#[test]
fn resolve_session_image_with_matching_sid() {
    // Arrange
    let note = make_note(Some(5));
    let dir = tempfile::tempdir().unwrap();
    // Act
    let p = resolve_note_image_path(dir.path(), &note, note.id, "session-images/5/full/123.webp");
    // Assert
    assert_eq!(p.unwrap(), dir.path().join("session-images/5/full/123.webp"));
}

#[test]
fn resolve_rejects_foreign_session_image() {
    // Arrange：笔记来自会话 5，引用会话 6 / 手动笔记引用任何会话图
    let note = make_note(Some(5));
    let manual = make_note(None);
    let dir = tempfile::tempdir().unwrap();
    // Act & Assert
    assert!(resolve_note_image_path(dir.path(), &note, note.id, "session-images/6/full/1.webp").is_none());
    assert!(resolve_note_image_path(dir.path(), &manual, manual.id, "session-images/5/full/1.webp").is_none());
}

#[test]
fn resolve_notes_image_requires_matching_note() {
    // Arrange
    let note = make_note(None);
    let dir = tempfile::tempdir().unwrap();
    // Act & Assert：本笔记可引用；其他笔记 id 拒绝
    let own = format!("notes-images/{}/a.png", note.id);
    assert!(resolve_note_image_path(dir.path(), &note, note.id, &own).is_some());
    assert!(resolve_note_image_path(dir.path(), &note, note.id, "notes-images/999/a.png").is_none());
}

#[test]
fn resolve_bare_path_uses_note_session() {
    // Arrange
    let note = make_note(Some(7));
    let manual = make_note(None);
    let dir = tempfile::tempdir().unwrap();
    // Act
    let p = resolve_note_image_path(dir.path(), &note, note.id, "full/42.webp");
    // Assert：产物转笔记裸路径按来源会话解析；手动笔记拒绝
    assert_eq!(p.unwrap(), dir.path().join("session-images/7/full/42.webp"));
    assert!(resolve_note_image_path(dir.path(), &manual, manual.id, "full/42.webp").is_none());
}

#[test]
fn resolve_rejects_traversal_and_external() {
    // Arrange
    let note = make_note(Some(5));
    let dir = tempfile::tempdir().unwrap();
    // Act & Assert：穿越/外部 URL/data URL/绝对路径一律 None
    assert!(resolve_note_image_path(dir.path(), &note, note.id, "session-images/5/../6/full/1.webp").is_none());
    assert!(resolve_note_image_path(dir.path(), &note, note.id, "https://example.com/a.png").is_none());
    assert!(resolve_note_image_path(dir.path(), &note, note.id, "data:image/png;base64,xxx").is_none());
    assert!(resolve_note_image_path(dir.path(), &note, note.id, "C:/evil/full/1.webp").is_none());
}

#[test]
fn import_copies_and_returns_relative_ref() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("shot.png");
    fs::write(&src, b"fake-png-bytes").unwrap();
    // Act
    let rel = import_image_file(src.to_str().unwrap(), dir.path(), 9, 1024 * 1024).unwrap();
    // Assert
    assert!(rel.starts_with("notes-images/9/") && rel.ends_with(".png"));
    let abs = dir.path().join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    assert!(abs.is_file());
    assert_eq!(fs::read(&abs).unwrap(), b"fake-png-bytes");
}

#[test]
fn import_second_file_same_second_gets_sequence_suffix() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("a.png");
    fs::write(&src, b"x").unwrap();
    // Act
    let rel1 = import_image_file(src.to_str().unwrap(), dir.path(), 9, 1024).unwrap();
    let rel2 = import_image_file(src.to_str().unwrap(), dir.path(), 9, 1024).unwrap();
    // Assert：同秒重名 → 序号后缀
    assert_ne!(rel1, rel2);
    assert!(rel2.contains('_'));
}

#[test]
fn import_rejects_bad_source() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    // Act & Assert：源不存在 / 非法扩展名 / 超限（max_bytes=100，文件 200 字节）
    assert!(import_image_file(dir.path().join("nope.png").to_str().unwrap(), dir.path(), 9, 1024).is_err());
    let txt = dir.path().join("a.txt");
    fs::write(&txt, b"x").unwrap();
    assert!(import_image_file(txt.to_str().unwrap(), dir.path(), 9, 1024).is_err());
    let big = dir.path().join("big.png");
    fs::write(&big, vec![0u8; 200]).unwrap();
    assert!(import_image_file(big.to_str().unwrap(), dir.path(), 9, 100).is_err());
}
