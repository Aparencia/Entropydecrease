//! commands_knowledge_decisions 单测（内存库；AAA —— 校验/挂载规则/事务原子性/指标计数）。

use crate::commands_knowledge_decisions::{
    delete_decision_inner, get_decision_inner, list_decisions_inner, log_application_inner,
    log_decision_inner,
};
use crate::db::{unix_seconds, Db};
use crate::types::{NewKnowledgeConcept, NewKnowledgeSystem, NewNoteGroup};

/// 内存库（schema 经 Db::open 初始化——建表幂等路径同真库）。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个体系（system_id 外键引用需要真实体系）。
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

/// 建一个概念（概念引用 need 真实概念）。
fn add_concept(db: &Db, system_id: i64, name: &str) -> i64 {
    db.add_knowledge_concept(&NewKnowledgeConcept {
        system_id,
        name: name.to_string(),
        essence: None,
        boundary: None,
        relation: None,
    })
    .expect("create concept")
    .id
}

/// 建一个笔记组（证据引用 need 真实组）。
fn add_group(db: &Db) -> i64 {
    db.create_group(&NewNoteGroup {
        name: "证据组".to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("create group")
    .id
}

// ---- 校验：content 空/超长 ----

#[test]
fn log_decision_rejects_empty_content() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let err = log_decision_inner(&db, sid, None, "   ".to_string(), None, None, None, r#"{"concept_ids":[1]}"#.to_string()).unwrap_err();
    assert!(err.contains("决策内容不能为空"), "got: {}", err);
}

#[test]
fn log_decision_rejects_overlong_content() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let long = "字".repeat(2001);
    let err = log_decision_inner(&db, sid, None, long, None, None, None, r#"{"concept_ids":[1]}"#.to_string()).unwrap_err();
    assert!(err.contains("决策内容超长"), "got: {}", err);
}

// ---- 校验：used_refs 空 / 引用不存在 ----

#[test]
fn log_decision_rejects_empty_refs() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let err = log_decision_inner(&db, sid, None, "内容".to_string(), None, None, None, "{}".to_string()).unwrap_err();
    assert_eq!(err, "决策需引用体系实体或证据");
}

#[test]
fn log_decision_rejects_missing_concept_ref() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let err = log_decision_inner(&db, sid, None, "内容".to_string(), None, None, None, r#"{"concept_ids":[9999]}"#.to_string()).unwrap_err();
    assert_eq!(err, "引用不存在: concept/9999");
}

#[test]
fn log_decision_rejects_missing_note_ref() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let err = log_decision_inner(&db, sid, None, "内容".to_string(), None, None, None, r#"{"note_id":9999}"#.to_string()).unwrap_err();
    assert_eq!(err, "引用不存在: note/9999");
}

#[test]
fn log_decision_rejects_missing_question_node() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let err = log_decision_inner(&db, sid, Some(4242), "内容".to_string(), None, None, None, r#"{"concept_ids":[1]}"#.to_string()).unwrap_err();
    assert_eq!(err, "引用不存在: node/4242");
}

// ---- 成功路径 + 指标 + 四行法 trim ----

#[test]
fn log_decision_success_and_metric() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let cid = add_concept(&db, sid, "本地优先");
    let rec = log_decision_inner(&db, sid, None, "决定采用本地优先".to_string(),
        Some("数据不出机".to_string()), None, None, format!(r#"{{"concept_ids":[{}]}}"#, cid)).expect("decision");
    assert_eq!(rec.kind, "decision");
    assert_eq!(rec.system_id, Some(sid));
    assert_eq!(rec.content, "决定采用本地优先");
    assert_eq!(db.count_metric_events("decision_logged").expect("metric"), 1);
    assert_eq!(db.count_metric_events("application_logged").expect("metric"), 0);
}

#[test]
fn four_line_empty_strings_become_none() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let cid = add_concept(&db, sid, "概念");
    let rec = log_decision_inner(&db, sid, None, "内容".to_string(),
        Some("   ".to_string()), Some("".to_string()), Some("  \n ".to_string()),
        format!(r#"{{"concept_ids":[{}]}}"#, cid)).expect("decision");
    assert_eq!(rec.expectation, None);
    assert_eq!(rec.actual, None);
    assert_eq!(rec.reflection, None);
}

// ---- 校验：application 挂载规则 ----

#[test]
fn log_application_rejects_no_mount() {
    let db = mem_db();
    let err = log_application_inner(&db, None, None, "应用".to_string(), None, None, None, r#"{"concept_ids":[1]}"#.to_string()).unwrap_err();
    assert_eq!(err, "应用记录必须挂概念或体系");
}

#[test]
fn log_application_rejects_missing_concept() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let err = log_application_inner(&db, Some(9999), Some(sid), "应用".to_string(), None, None, None, r#"{"concept_ids":[9999]}"#.to_string()).unwrap_err();
    assert_eq!(err, "概念不存在: 9999");
}

#[test]
fn log_application_rejects_cross_system() {
    let db = mem_db();
    let s1 = host_system(&db, "体系一");
    let s2 = host_system(&db, "体系二");
    let cid = add_concept(&db, s1, "概念");
    let err = log_application_inner(&db, Some(cid), Some(s2), "应用".to_string(), None, None, None, format!(r#"{{"concept_ids":[{}]}}"#, cid)).unwrap_err();
    assert_eq!(err, "应用概念不属于该体系");
}

#[test]
fn log_application_system_mode_requires_evidence() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    // 体系模式仅引用概念（无证据引用）→ 拒绝；概念引用不存在也先命中证据规则
    let err = log_application_inner(&db, None, Some(sid), "应用".to_string(), None, None, None, r#"{"concept_ids":[9999]}"#.to_string()).unwrap_err();
    assert_eq!(err, "体系级应用需证据引用");
}

// ---- 事务：概念模式成功 → 行 + last_applied_at + 指标 ----

#[test]
fn log_application_concept_mode_success_lands_all() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let cid = add_concept(&db, sid, "贝叶斯定理");
    let before = unix_seconds();
    let rec = log_application_inner(&db, Some(cid), None, "用贝叶斯定理复盘".to_string(),
        Some("预测更准".to_string()), None, Some("先建树再套公式".to_string()),
        format!(r#"{{"concept_ids":[{}]}}"#, cid)).expect("apply");
    let after = unix_seconds();
    // 应用行：kind=application、挂概念所属体系、四行法透传
    assert_eq!(rec.kind, "application");
    assert_eq!(rec.system_id, Some(sid));
    assert_eq!(rec.content, "用贝叶斯定理复盘");
    assert_eq!(rec.expectation.as_deref(), Some("预测更准"));
    assert_eq!(rec.reflection.as_deref(), Some("先建树再套公式"));
    // last_applied_at 同步为当前秒（within [before, after] 容差）
    let concept = db.get_knowledge_concept(cid).expect("get").expect("exists");
    let applied = concept.last_applied_at.expect("applied");
    assert!(applied >= before && applied <= after, "applied={} not in [{},{}]", applied, before, after);
    // metric application_logged 计数 1
    assert_eq!(db.count_metric_events("application_logged").expect("metric"), 1);
}

#[test]
fn log_application_system_mode_success() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let gid = add_group(&db);
    let rec = log_application_inner(&db, None, Some(sid), "体系级应用".to_string(), None, None, None,
        format!(r#"{{"group_id":{}}}"#, gid)).expect("apply");
    assert_eq!(rec.kind, "application");
    assert_eq!(rec.system_id, Some(sid));
    assert_eq!(db.count_metric_events("application_logged").expect("metric"), 1);
}

// ---- 原子性：db 层事务方法 + 命令前置拦截（半写防线） ----

#[test]
fn create_application_tx_lands_row_and_applied() {
    use crate::types::NewKnowledgeDecision;
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let cid = add_concept(&db, sid, "概念");
    let now = unix_seconds();
    let rec = db.create_application_tx(&NewKnowledgeDecision {
        kind: "application".to_string(),
        system_id: Some(sid),
        question_id: None,
        used_refs: format!(r#"{{"concept_ids":[{}]}}"#, cid),
        content: "应用".to_string(),
        expectation: None,
        actual: None,
        reflection: None,
    }, Some(cid), now).expect("tx");
    // 行落库
    assert_eq!(rec.kind, "application");
    assert_eq!(db.get_decision(rec.id).expect("get").expect("exists").content, "应用");
    // set_concept_applied 同步
    let concept = db.get_knowledge_concept(cid).expect("get").expect("exists");
    assert_eq!(concept.last_applied_at, Some(now));
}

#[test]
fn log_application_intercepts_before_tx_on_missing_concept() {
    let db = mem_db();
    let _sid = host_system(&db, "体系");
    // 概念不存在 → 命令层在事务前拦截（不产生半写）
    let err = log_application_inner(&db, Some(4242), None, "应用".to_string(), None, None, None, r#"{"concept_ids":[4242]}"#.to_string()).unwrap_err();
    assert_eq!(err, "概念不存在: 4242");
    // 无应用行落库（半写防线）
    assert_eq!(db.list_decisions(None, None, 100).expect("list").len(), 0);
    // 无指标事件（事务未进入）
    assert_eq!(db.count_metric_events("application_logged").expect("metric"), 0);
}

// ---- list / get / delete ----

#[test]
fn list_rejects_illegal_kind() {
    let db = mem_db();
    let err = list_decisions_inner(&db, None, Some("bogus".to_string()), None).unwrap_err();
    assert!(err.contains("不支持的类型"), "got: {}", err);
}

#[test]
fn list_rejects_bad_limit() {
    let db = mem_db();
    assert!(list_decisions_inner(&db, None, None, Some(0)).unwrap_err().contains("limit"));
    assert!(list_decisions_inner(&db, None, None, Some(501)).unwrap_err().contains("limit"));
}

#[test]
fn list_decisions_wires_through() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let cid = add_concept(&db, sid, "概念");
    log_decision_inner(&db, sid, None, "决策".to_string(), None, None, None, format!(r#"{{"concept_ids":[{}]}}"#, cid)).expect("d");
    let recs = list_decisions_inner(&db, None, Some("decision".to_string()), Some(50)).expect("list");
    assert_eq!(recs.len(), 1);
    assert_eq!(recs[0].kind, "decision");
}

#[test]
fn get_decision_missing_errors() {
    let db = mem_db();
    let err = get_decision_inner(&db, 4242).unwrap_err();
    assert!(err.contains("决策不存在"), "got: {}", err);
}

#[test]
fn delete_decision_idempotent() {
    let db = mem_db();
    let sid = host_system(&db, "体系");
    let cid = add_concept(&db, sid, "概念");
    let rec = log_decision_inner(&db, sid, None, "内容".to_string(), None, None, None,
        format!(r#"{{"concept_ids":[{}]}}"#, cid)).expect("decision");
    assert!(delete_decision_inner(&db, rec.id).expect("del1"));
    assert!(!delete_decision_inner(&db, rec.id).expect("del2"));
}
