//! db_knowledge_canvas 数据层单测（内存库；AAA 模式）。
//!
//! @ai-context: 只测数据层契约（命令层校验不入本层）——写路径幂等、读路径
//!              None 兜底、更新不存在节点返回 false（command 层据此报业务错误）。

use crate::commands_knowledge_systems::{add_knowledge_node_inner, create_knowledge_system_inner};
use crate::db::Db;

fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

fn make_global(db: &Db) -> i64 {
    create_knowledge_system_inner(db, "全局".to_string(), "global".to_string(), None, Some("核心问题".to_string()))
        .expect("全局体系")
        .id
}

#[test]
fn update_missing_node_returns_false() {
    // Arrange
    let db = mem_db();
    // Act：不存在节点更新（数据层不校验存在性——返回 false 由 command 层转业务错误）
    let ok = db.update_node_canvas_position(99999, 1.0, 2.0).expect("数据层调用");
    // Assert
    assert!(!ok);
}

#[test]
fn set_positions_updates_rows_batch() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    let n1 = add_knowledge_node_inner(&db, sid, None, "question".to_string(), "一".to_string()).expect("n1").id;
    let n2 = add_knowledge_node_inner(&db, sid, Some(n1), "scenario".to_string(), "二".to_string()).expect("n2").id;
    // Act：批量写入（含不存在节点行——数据层只更新命中行，不报错）
    let ok = db.set_node_canvas_positions(&[(n1, 1.0, 2.0), (n2, 3.0, 4.0), (99999, 5.0, 5.0)]).expect("批量");
    // Assert
    assert!(ok);
    let nodes = db.list_knowledge_nodes(sid).expect("list");
    let get = |id: i64| nodes.iter().find(|n| n.id == id).expect("存在");
    assert_eq!(get(n1).canvas_x, Some(1.0));
    assert_eq!(get(n1).canvas_y, Some(2.0));
    assert_eq!(get(n2).canvas_x, Some(3.0));
    assert_eq!(get(n2).canvas_y, Some(4.0));
}

#[test]
fn viewport_upsert_and_empty_read() {
    // Arrange
    let db = mem_db();
    let sid = make_global(&db);
    // Act：无记录读取 None
    assert_eq!(db.get_canvas_viewport(sid).expect("读"), None);
    // 保存两次（upsert 覆盖）
    db.save_canvas_viewport(sid, 1.0, 2.0, 1.0).expect("第一次");
    db.save_canvas_viewport(sid, 3.0, 4.0, 2.0).expect("第二次");
    // Assert：后写覆盖
    let (x, y, z) = db.get_canvas_viewport(sid).expect("读").expect("有记录");
    assert_eq!((x, y, z), (3.0, 4.0, 2.0));
}
