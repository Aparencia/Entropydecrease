//! db_knowledge_nodes 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::types::{NewKnowledgeLink, NewKnowledgeNode, NewKnowledgeSystem};

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个体系并返回（节点测试宿主）。
fn host_system(db: &Db, name: &str) -> i64 {
    db.create_knowledge_system(&NewKnowledgeSystem {
        name: name.to_string(),
        kind: "domain".to_string(),
        parent_system_id: None,
        core_question: None,
    })
    .expect("create system")
    .id
}

/// 节点入参助手。
fn node(system_id: i64, parent_id: Option<i64>, text: &str, order_idx: i64) -> NewKnowledgeNode {
    NewKnowledgeNode {
        system_id,
        parent_id,
        r#type: "question".to_string(),
        text: text.to_string(),
        order_idx,
    }
}

#[test]
fn add_and_get_roundtrip() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    // Act
    let created = db.add_knowledge_node(&node(sid, None, "主问题", 0)).expect("create");
    let fetched = db.get_knowledge_node(created.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.text, "主问题");
    assert_eq!(fetched.system_id, sid);
    assert_eq!(fetched.status, "active");
}

#[test]
fn list_nodes_flat_and_ordered() {
    // Arrange：同级三个节点，order_idx 打乱插入
    let db = mem_db();
    let sid = host_system(&db, "体系");
    db.add_knowledge_node(&node(sid, None, "乙", 2)).expect("乙");
    db.add_knowledge_node(&node(sid, None, "甲", 0)).expect("甲");
    db.add_knowledge_node(&node(sid, None, "丙", 1)).expect("丙");
    // Act
    let flat = db.list_knowledge_nodes(sid).expect("list");
    // Assert：扁平全树按 order_idx, id 排序
    assert_eq!(flat.len(), 3);
    assert_eq!(flat.iter().map(|n| n.text.as_str()).collect::<Vec<_>>(), vec!["甲", "丙", "乙"]);
}

#[test]
fn update_node_fields_and_order() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let n = db.add_knowledge_node(&node(sid, None, "原文本", 0)).expect("create");
    // Act：改文本 + 改排序 + 改状态
    db.update_knowledge_node(n.id, Some("新文本"), Some(5), Some("watching")).expect("update");
    // Assert
    let fetched = db.get_knowledge_node(n.id).expect("get").expect("exists");
    assert_eq!(fetched.text, "新文本");
    assert_eq!(fetched.order_idx, 5);
    assert_eq!(fetched.status, "watching");
}

#[test]
fn delete_node_cascades_subtree_and_nulls_link() {
    // Arrange：根 + 子 + 孙；一个引用挂在子节点上
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let root = db.add_knowledge_node(&node(sid, None, "根", 0)).expect("root");
    let child = db
        .add_knowledge_node(&node(sid, Some(root.id), "子", 0))
        .expect("child");
    let grand = db
        .add_knowledge_node(&node(sid, Some(child.id), "孙", 0))
        .expect("grand");
    let link = db
        .add_knowledge_link(&NewKnowledgeLink {
            system_id: sid,
            node_id: Some(child.id),
            concept_id: None,
            model_id: None,
            target_type: "note".to_string(),
            target_id: 1,
        })
        .expect("link");
    // Act：删根节点 → 级联清子树；引用该节点的 link.node_id 置 NULL
    let ok = db.delete_knowledge_node(root.id).expect("delete");
    // Assert
    assert!(ok);
    assert!(db.get_knowledge_node(child.id).expect("get").is_none());
    assert!(db.get_knowledge_node(grand.id).expect("get").is_none());
    // 引用键保留（ON DELETE SET NULL），node_id=NULL（按体系查回，node_id 无过滤）
    let links = db.list_knowledge_links(sid, None, None, None).expect("links");
    let link_fetched = links.iter().find(|l| l.id == link.id).expect("link remains");
    assert_eq!(link_fetched.node_id, None);
}

#[test]
fn list_nodes_scoped_to_system() {
    // Arrange：两体系各挂节点
    let db = mem_db();
    let s1 = host_system(&db, "体系一");
    let s2 = host_system(&db, "体系二");
    db.add_knowledge_node(&node(s1, None, "一", 0)).expect("n1");
    db.add_knowledge_node(&node(s2, None, "二", 0)).expect("n2");
    // Act
    let in_s1 = db.list_knowledge_nodes(s1).expect("list s1");
    let in_s2 = db.list_knowledge_nodes(s2).expect("list s2");
    // Assert：按体系隔离
    assert_eq!(in_s1.len(), 1);
    assert_eq!(in_s1[0].text, "一");
    assert_eq!(in_s2.len(), 1);
    assert_eq!(in_s2[0].text, "二");
}
