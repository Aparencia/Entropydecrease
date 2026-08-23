//! db_knowledge_models 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::types::{NewKnowledgeModel, NewKnowledgeSystem};

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个体系并返回。
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

/// 模型入参助手。
fn model(system_id: i64, name: &str) -> NewKnowledgeModel {
    NewKnowledgeModel {
        system_id,
        name: name.to_string(),
        disciplines: r#"["数学", "统计"]"#.to_string(),
        claim: None,
        valid_when: None,
        invalid_when: None,
        cross_checks: None,
    }
}

#[test]
fn add_and_get_roundtrip() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    // Act
    let m = db.add_knowledge_model(&model(sid, "大数定律")).expect("create");
    let fetched = db.get_knowledge_model(m.id).expect("get").expect("exists");
    // Assert：disciplines JSON 文本按存储态往返
    assert_eq!(fetched.name, "大数定律");
    assert_eq!(fetched.disciplines, r#"["数学", "统计"]"#);
    assert_eq!(fetched.status, "active");
}

#[test]
fn update_model_fields() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let m = db.add_knowledge_model(&model(sid, "原名")).expect("create");
    // Act：改名字 + disciplines + 命题三要素 + 状态
    db.update_knowledge_model(
        m.id,
        Some("新模型名"),
        Some(r#"["物理"]"#.to_string().as_str()),
        Some(Some("主张")),
        Some(Some("生效条件")),
        Some(Some("失效条件")),
        Some(Some(r#"{"cross":"check"}"#)),
        Some("watching"),
    )
    .expect("update");
    let fetched = db.get_knowledge_model(m.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.name, "新模型名");
    assert_eq!(fetched.disciplines, r#"["物理"]"#);
    assert_eq!(fetched.claim.as_deref(), Some("主张"));
    assert_eq!(fetched.cross_checks.as_deref(), Some(r#"{"cross":"check"}"#));
    assert_eq!(fetched.status, "watching");
}

#[test]
fn clear_nullable_model_fields() {
    // Arrange：带可选字段的模型
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let m = db.add_knowledge_model(&model(sid, "模型")).expect("create");
    db.update_knowledge_model(
        m.id,
        None,
        None,
        Some(Some("主张")),
        None,
        None,
        None,
        None,
    )
    .expect("set");
    // Act：清空 claim（内层 None）
    db.update_knowledge_model(m.id, None, None, Some(None), None, None, None, None).expect("clear");
    let fetched = db.get_knowledge_model(m.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.claim, None);
    // 未传字段保持原值
    assert_eq!(fetched.disciplines, r#"["数学", "统计"]"#);
}

#[test]
fn list_models_scoped_to_system() {
    // Arrange：两体系各挂模型
    let db = mem_db();
    let s1 = host_system(&db, "体系一");
    let s2 = host_system(&db, "体系二");
    db.add_knowledge_model(&model(s1, "甲")).expect("甲");
    db.add_knowledge_model(&model(s2, "乙")).expect("乙");
    // Act
    let in_s1 = db.list_knowledge_models(s1).expect("list s1");
    let in_s2 = db.list_knowledge_models(s2).expect("list s2");
    // Assert
    assert_eq!(in_s1.len(), 1);
    assert_eq!(in_s1[0].name, "甲");
    assert_eq!(in_s2.len(), 1);
    assert_eq!(in_s2[0].name, "乙");
}
