//! commands_knowledge_cards 命令层单测（内存库；AAA 模式）。
//!
//! @ai-context: 只测 inner 编排与校验——薄 `#[tauri::command]` 壳需装配 Tauri
//!              State/AppState，无业务逻辑；inner 等价于测全命令（:memory: 隔离，
//!              不触真实数据，AGENTS.md §7）。校验用例断言 Err 而非 panic（spec §六：
//!              空名不得触发 promote_rules panic）。

use crate::commands_knowledge_cards::{create_model_card_inner, list_group_cards_inner};
use crate::commands_knowledge_cards_promote::promote_card_to_concept_inner;
use crate::commands_knowledge_core::add_knowledge_concept_inner;
use crate::commands_knowledge_systems::create_knowledge_system_inner;
use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::knowledge_card::back_has_anchor;
use crate::scheduler::CardState;
use crate::types::NewNoteGroup;

/// 内存库（schema 经 Db::open 初始化——建表幂等路径同真库）。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个 standalone 组（返回 id）。
fn make_group(db: &Db) -> i64 {
    db.create_group(&NewNoteGroup {
        name: "组".to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("组创建")
    .id
}

/// 建全局体系（返回 id）。
fn make_global(db: &Db) -> i64 {
    create_knowledge_system_inner(db, "全局".to_string(), "global".to_string(), None, Some("核心问题".to_string()))
        .expect("全局体系")
        .id
}

/// 建领域体系（返回 id）。
fn make_domain(db: &Db, name: &str) -> i64 {
    create_knowledge_system_inner(db, name.to_string(), "domain".to_string(), None, None)
        .expect("领域体系")
        .id
}

/// 直接建 model 卡（绕过命令校验——构造"空名/非空 front 但需极端场景"入参）。
fn make_raw_model_card(db: &Db, group_id: i64, front: &str) -> i64 {
    let state = serde_json::to_string(&CardState::default()).unwrap_or_default();
    let card = db
        .create_card(&NewFlashcard {
            group_id,
            note_id: None,
            fragment_id: None,
            front: front.to_string(),
            back: "本质：\n边界：\n联系：".to_string(),
            kind: "model".to_string(),
            state_json: state,
            due_at: 0,
        })
        .expect("卡创建");
    card.id
}

// ── 校验 ─────────────────────────────────────────────

#[test]
fn create_model_card_group_not_exists() {
    // Act：组不存在 → Err
    assert!(create_model_card_inner(&mem_db(), 999_999, "概念".to_string(), None, None, None).is_err());
}

#[test]
fn create_model_card_empty_name() {
    let db = mem_db();
    let group = make_group(&db);
    // Act：空名/纯空白拒绝（不 panic）
    assert!(create_model_card_inner(&db, group, "   ".to_string(), None, None, None).is_err());
}

#[test]
fn create_model_card_back_contract_and_kind() {
    let db = mem_db();
    let group = make_group(&db);
    // Act：三问全填
    let card = create_model_card_inner(
        &db,
        group,
        "概念".to_string(),
        Some("本质值".to_string()),
        Some("边界值".to_string()),
        Some("联系值".to_string()),
    )
    .expect("卡");
    // Assert：kind=model、front=归一化名、back 三行契约 + 首尾空白折叠
    assert_eq!(card.kind, "model");
    assert_eq!(card.front, "概念");
    assert_eq!(card.back, "本质：本质值\n边界：边界值\n联系：联系值");
}

#[test]
fn create_model_card_idempotent() {
    let db = mem_db();
    let group = make_group(&db);
    // Act：同组同名二次
    let c1 = create_model_card_inner(&db, group, "概念".to_string(), None, None, None).expect("c1");
    let c2 = create_model_card_inner(&db, group, "概念".to_string(), Some("x".to_string()), None, None).expect("c2");
    // Assert：返回既有卡（同 id），不新建
    assert_eq!(c1.id, c2.id);
    // 另一组同名可各自建（幂等只在组内）
    let group2 = make_group(&db);
    let c3 = create_model_card_inner(&db, group2, "概念".to_string(), None, None, None).expect("c3");
    assert_ne!(c1.id, c3.id);
}

#[test]
fn list_group_cards_kind_whitelist() {
    let db = mem_db();
    let group = make_group(&db);
    create_model_card_inner(&db, group, "概念".to_string(), None, None, None).expect("卡");
    // Act：无过滤取全组；按 kind 过滤；非法 kind
    assert_eq!(list_group_cards_inner(&db, group, None).expect("all").len(), 1);
    assert_eq!(list_group_cards_inner(&db, group, Some("model".to_string())).expect("model").len(), 1);
    assert_eq!(list_group_cards_inner(&db, group, Some("fact".to_string())).expect("fact").len(), 0);
    assert!(list_group_cards_inner(&db, group, Some("bogus".to_string())).is_err());
}

#[test]
fn promote_card_non_model_rejected() {
    let db = mem_db();
    let group = make_group(&db);
    let global = make_global(&db);
    // Arrange：fact 卡
    let card = db
        .create_card(&NewFlashcard {
            group_id: group,
            note_id: None,
            fragment_id: None,
            front: "事实".to_string(),
            back: "b".to_string(),
            kind: "fact".to_string(),
            state_json: "{}".to_string(),
            due_at: 0,
        })
        .expect("fact 卡");
    // Act：非 model 卡升格 → Err
    assert!(promote_card_to_concept_inner(&db, card.id, Some(global)).is_err());
}

#[test]
fn promote_card_empty_name_no_panic() {
    let db = mem_db();
    let group = make_group(&db);
    let global = make_global(&db);
    let card_id = make_raw_model_card(&db, group, " ");
    // Act：空名升格（normalize_text 拒空）→ Err 而非 panic
    assert!(promote_card_to_concept_inner(&db, card_id, Some(global)).is_err());
}

#[test]
fn promote_card_target_system_not_exists() {
    let db = mem_db();
    let group = make_group(&db);
    let card = create_model_card_inner(&db, group, "概念".to_string(), None, None, None).expect("卡");
    // Act：目标体系不存在 → Err
    assert!(promote_card_to_concept_inner(&db, card.id, Some(999_999)).is_err());
}

#[test]
fn promote_card_no_global_and_no_target() {
    let db = mem_db();
    let group = make_group(&db);
    let card = create_model_card_inner(&db, group, "概念".to_string(), None, None, None).expect("卡");
    // Act：未传目标且无全局体系 → Err 引导先建全局体系
    assert!(promote_card_to_concept_inner(&db, card.id, None).is_err());
}

// ── 升格四分支 ───────────────────────────────────────

#[test]
fn promote_created_writes_concept_link_anchor_metric() {
    let db = mem_db();
    let global = make_global(&db);
    let group = make_group(&db);
    let card = create_model_card_inner(
        &db,
        group,
        "安全边际".to_string(),
        Some("本质甲".to_string()),
        Some("边界乙".to_string()),
        Some("联系丙".to_string()),
    )
    .expect("卡");
    // Act：默认全局升格
    let r = promote_card_to_concept_inner(&db, card.id, None).expect("升格");
    // Assert：created + 概念落库（name/三问与卡 back 解析一致）
    assert_eq!(r.action, "created");
    assert_eq!(r.concept.system_id, global);
    assert_eq!(r.concept.name, "安全边际");
    assert_eq!(r.concept.essence.as_deref(), Some("本质甲"));
    assert_eq!(r.concept.boundary.as_deref(), Some("边界乙"));
    assert_eq!(r.concept.relation.as_deref(), Some("联系丙"));
    // link(flashcard)
    let link = r.link.expect("引用");
    assert_eq!(link.target_type, "flashcard");
    assert_eq!(link.target_id, card.id);
    assert_eq!(link.concept_id, Some(r.concept.id));
    // back 尾部锚点（整行一次）
    let updated = db.get_card(card.id).expect("取卡").expect("卡在");
    assert!(back_has_anchor(&updated.back));
    assert_eq!(updated.back.matches("→ 概念「安全边际」").count(), 1);
    // metric 计数 1
    assert_eq!(db.count_metric_events("concept_promoted").expect("metric"), 1);
}

#[test]
fn promote_already_idempotent() {
    let db = mem_db();
    let global = make_global(&db);
    let group = make_group(&db);
    let card = create_model_card_inner(&db, group, "安全边际".to_string(), None, None, None).expect("卡");
    promote_card_to_concept_inner(&db, card.id, None).expect("首升格");
    // Act：再次升格
    let r = promote_card_to_concept_inner(&db, card.id, None).expect("重复升格");
    // Assert：already、概念数不变、锚点不二次追加
    assert_eq!(r.action, "already");
    assert_eq!(r.concept.name, "安全边际");
    assert_eq!(db.list_knowledge_concepts(Some(global), None).expect("概念数").len(), 1);
    let updated = db.get_card(card.id).expect("取卡").expect("卡在");
    assert_eq!(updated.back.matches("→ 概念「安全边际」").count(), 1);
    assert_eq!(db.count_metric_events("concept_promoted").expect("metric"), 1);
}

#[test]
fn promote_merged_links_existing_concept() {
    let db = mem_db();
    let domain = make_domain(&db, "领域");
    // Arrange：预建同名概念在目标体系
    let risk = add_knowledge_concept_inner(&db, domain, "风险".to_string(), Some("损失".to_string()), None, None).expect("既有概念");
    let group = make_group(&db);
    let card = create_model_card_inner(&db, group, "风险".to_string(), Some("损失".to_string()), None, None).expect("卡");
    // Act：升格到目标体系
    let r = promote_card_to_concept_inner(&db, card.id, Some(domain)).expect("升格");
    // Assert：merged、无新概念、有 link + 锚点
    assert_eq!(r.action, "merged");
    assert_eq!(r.concept.id, risk.id);
    assert_eq!(db.list_knowledge_concepts(Some(domain), None).expect("概念数").len(), 1);
    let link = r.link.expect("引用");
    assert_eq!(link.concept_id, Some(risk.id));
    assert_eq!(link.target_type, "flashcard");
    assert_eq!(link.target_id, card.id);
    assert!(back_has_anchor(&db.get_card(card.id).expect("取卡").expect("卡在").back));
}

#[test]
fn promote_hinted_does_not_persist() {
    let db = mem_db();
    let sys_a = make_domain(&db, "体系A");
    let sys_b = make_domain(&db, "体系B");
    // Arrange：同名概念在体系 B
    let opp = add_knowledge_concept_inner(&db, sys_b, "机会".to_string(), None, None, None).expect("体系B概念");
    let group = make_group(&db);
    let card = create_model_card_inner(&db, group, "机会".to_string(), None, None, None).expect("卡");
    // Act：升格到体系 A（跨体系同名）
    let r = promote_card_to_concept_inner(&db, card.id, Some(sys_a)).expect("升格");
    // Assert：hinted、无新概念、无 link、无 metric、back 无锚点
    assert_eq!(r.action, "hinted");
    assert_eq!(r.concept.id, opp.id);
    assert!(r.link.is_none());
    assert_eq!(db.list_knowledge_concepts(Some(sys_a), None).expect("体系A概念").len(), 0);
    assert!(db.list_knowledge_links(sys_a, None, None, None).expect("体系A引用").is_empty());
    assert_eq!(db.count_metric_events("concept_promoted").expect("metric"), 0);
    assert!(!back_has_anchor(&db.get_card(card.id).expect("取卡").expect("卡在").back));
}

#[test]
fn promote_target_system_switch() {
    let db = mem_db();
    let global = make_global(&db);
    let domain = make_domain(&db, "领域");
    let group = make_group(&db);
    let card = create_model_card_inner(&db, group, "边际".to_string(), None, None, None).expect("卡");
    // Act：明确传领域体系 id
    let r = promote_card_to_concept_inner(&db, card.id, Some(domain)).expect("升格");
    // Assert：created 且概念/引用落在领域体系，不在全局
    assert_eq!(r.action, "created");
    assert_eq!(r.concept.system_id, domain);
    assert_eq!(r.link.expect("引用").system_id, domain);
    assert_eq!(db.list_knowledge_concepts(Some(global), None).expect("全局概念").len(), 0);
}
