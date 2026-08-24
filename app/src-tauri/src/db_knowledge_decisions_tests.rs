//! db_knowledge_decisions 单测（内存库；AAA 模式——一表两面 CRUD/过滤/JSON 往返/幂等删除）。

use crate::db::Db;
use crate::types::{NewKnowledgeDecision, NewKnowledgeSystem};

/// 内存库（schema 经 Db::open 初始化——建表幂等路径同真库）。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个体系并返回（system_id 外键引用需要真实体系）。
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

/// 决策/应用入参助手。
fn decision(kind: &str, system_id: Option<i64>, content: &str) -> NewKnowledgeDecision {
    NewKnowledgeDecision {
        kind: kind.to_string(),
        system_id,
        question_id: None,
        used_refs: "{}".to_string(),
        content: content.to_string(),
        expectation: None,
        actual: None,
        reflection: None,
    }
}

#[test]
fn decision_roundtrip() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    // Act：建一条决策 → 读回
    let created = db
        .create_decision(&decision("decision", Some(sid), "决定采用本地优先"))
        .expect("create");
    let fetched = db.get_decision(created.id).expect("get").expect("exists");
    // Assert：kind/system/四行字段/时间戳齐全
    assert_eq!(fetched.kind, "decision");
    assert_eq!(fetched.system_id, Some(sid));
    assert_eq!(fetched.question_id, None);
    assert_eq!(fetched.used_refs, "{}");
    assert_eq!(fetched.content, "决定采用本地优先");
    assert_eq!(fetched.expectation, None);
    assert!(fetched.decided_at > 0);
    assert_eq!(fetched.created_at, fetched.decided_at);
}

#[test]
fn application_roundtrip_with_four_lines() {
    // Arrange
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let mut app = decision("application", Some(sid), "用贝叶斯定理复盘");
    app.used_refs = r#"{"concept_ids":[3],"group_id":2}"#.to_string();
    app.expectation = Some("预测更准".to_string());
    app.actual = Some("略准".to_string());
    app.reflection = Some("先建树再套公式".to_string());
    // Act
    let created = db.create_decision(&app).expect("create");
    let fetched = db.get_decision(created.id).expect("get").expect("exists");
    // Assert：application 一表两面落库，四行法与引用透传
    assert_eq!(fetched.kind, "application");
    assert_eq!(fetched.system_id, Some(sid));
    assert_eq!(fetched.used_refs, r#"{"concept_ids":[3],"group_id":2}"#);
    assert_eq!(fetched.expectation.as_deref(), Some("预测更准"));
    assert_eq!(fetched.actual.as_deref(), Some("略准"));
    assert_eq!(fetched.reflection.as_deref(), Some("先建树再套公式"));
}

#[test]
fn list_filters_by_kind() {
    // Arrange：同体系各插一条 decision 与应用
    let db = mem_db();
    let sid = host_system(&db, "体系");
    db.create_decision(&decision("decision", Some(sid), "思辨")).expect("d");
    db.create_decision(&decision("application", Some(sid), "应用")).expect("a");
    // Act
    let decisions = db.list_decisions(None, Some("decision"), 100).expect("decision");
    let apps = db.list_decisions(None, Some("application"), 100).expect("application");
    let all = db.list_decisions(None, None, 100).expect("all");
    // Assert：kind 过滤收敛正确；合表含两条
    assert_eq!(decisions.len(), 1);
    assert_eq!(decisions[0].kind, "decision");
    assert_eq!(apps.len(), 1);
    assert_eq!(apps[0].kind, "application");
    assert_eq!(all.len(), 2);
}

#[test]
fn list_filters_by_system() {
    // Arrange：两体系各一条决策
    let db = mem_db();
    let s1 = host_system(&db, "体系一");
    let _s2 = host_system(&db, "体系二");
    db.create_decision(&decision("decision", Some(s1), "体系一决策")).expect("d1");
    db.create_decision(&decision("decision", None, "无体系决策")).expect("d2");
    // Act：按体系过滤 + 全量
    let s1_only = db.list_decisions(Some(s1), None, 100).expect("s1");
    let all = db.list_decisions(None, None, 100).expect("all");
    // Assert：体系过滤只含该体系；无体系决策不计入体系过滤
    assert_eq!(s1_only.len(), 1);
    assert_eq!(s1_only[0].system_id, Some(s1));
    assert_eq!(all.len(), 2);
}

#[test]
fn list_limits_and_orders_desc() {
    // Arrange：连续插 3 条（id 递增）
    let db = mem_db();
    let sid = host_system(&db, "体系");
    for i in 1..=3 {
        db.create_decision(&decision("decision", Some(sid), &format!("决策{i}"))).expect("create");
    }
    // Act：LIMIT 2 → 取最新两条（id DESC）
    let top = db.list_decisions(None, None, 2).expect("top");
    let all = db.list_decisions(None, None, 10).expect("all");
    // Assert：新在前（id 倒序）；limit 收敛条数
    assert_eq!(top.len(), 2);
    assert_eq!(top[0].content, "决策3");
    assert_eq!(top[1].content, "决策2");
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].content, "决策3");
}

#[test]
fn used_refs_roundtrip_chinese_and_quotes() {
    // Arrange：used_refs 含中文与转义引号（JSON 存储态原样往返）
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let refs = "{\"concept_ids\":[3,10],\"group_id\":2,\"name\":\"中文\\\"测试\\\"\"}".to_string();
    let mut d = decision("application", Some(sid), "应用");
    d.used_refs = refs.clone();
    // Act
    let created = db.create_decision(&d).expect("create");
    let fetched = db.get_decision(created.id).expect("get").expect("exists");
    // Assert：used_refs 逐字节保真（中文/引号不丢失）
    assert_eq!(fetched.used_refs, refs);
}

#[test]
fn delete_decision_idempotent() {
    // Arrange：建一条，先删一次
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let created = db.create_decision(&decision("decision", Some(sid), "待删")).expect("create");
    // Act：删存在 / 再删 / 删不存在 id
    let first = db.delete_decision(created.id).expect("first");
    let second = db.delete_decision(created.id).expect("second");
    let miss = db.delete_decision(9_999).expect("miss");
    // Assert：首次删 true，重复删 false（幂等），不存在 false
    assert!(first);
    assert!(!second);
    assert!(!miss);
    assert!(db.get_decision(created.id).expect("get").is_none());
}
