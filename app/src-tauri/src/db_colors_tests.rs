//! db_colors.rs 单测（内存库，环境隔离；v0.14 B 视觉系统）。

use crate::db::Db;

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

#[test]
fn set_get_roundtrip() {
    // Arrange
    let db = mem_db();
    // Act
    db.set_tag_color("化妆", "pink").expect("set");
    // Assert
    assert_eq!(db.get_tag_color("化妆").expect("get").as_deref(), Some("pink"));
    assert_eq!(db.list_tag_colors().expect("list").len(), 1);
}

#[test]
fn upsert_overwrites_existing() {
    // Arrange
    let db = mem_db();
    db.set_tag_color("化妆", "pink").expect("first");
    // Act
    db.set_tag_color("化妆", "purple").expect("second");
    // Assert：覆盖而非新增
    let all = db.list_tag_colors().expect("list");
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].color, "purple");
}

#[test]
fn reset_removes_entry_idempotent() {
    // Arrange
    let db = mem_db();
    db.set_tag_color("化妆", "pink").expect("set");
    // Act
    db.reset_tag_color("化妆").expect("reset");
    // Assert：删除后读不到；重复 reset 幂等不报错
    assert_eq!(db.get_tag_color("化妆").expect("get"), None);
    db.reset_tag_color("化妆").expect("reset again");
    assert!(db.list_tag_colors().expect("list").is_empty());
}

#[test]
fn unknown_tag_returns_none() {
    // Arrange
    let db = mem_db();
    // Act / Assert：无记录返回 None 而非错误
    assert_eq!(db.get_tag_color("不存在").expect("get"), None);
}

#[test]
fn list_orders_by_tag() {
    // Arrange
    let db = mem_db();
    db.set_tag_color("b", "blue").expect("b");
    db.set_tag_color("a", "red").expect("a");
    // Act
    let all = db.list_tag_colors().expect("list");
    // Assert：按 tag 字典序
    assert_eq!(all.iter().map(|t| t.tag.as_str()).collect::<Vec<_>>(), vec!["a", "b"]);
}
