//! db_flashcards 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::types::NewNoteGroup;

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建一个组并返回 id（flashcards.group_id 外键前提）。
fn make_group(db: &Db) -> i64 {
    db.create_group(&NewNoteGroup {
        name: "测试组".to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("group")
    .id
}

/// 卡片入参助手（新卡状态 JSON + 指定到期时刻）。
fn card(group_id: i64, front: &str, due_at: i64) -> NewFlashcard {
    NewFlashcard {
        group_id,
        note_id: None,
        fragment_id: None,
        front: front.to_string(),
        back: format!("{} 的释义", front),
        kind: "fact".to_string(),
        state_json: "{}".to_string(),
        due_at,
    }
}

#[test]
fn create_and_get_card_roundtrip() {
    // Arrange
    let db = mem_db();
    let gid = make_group(&db);
    // Act
    let created = db.create_card(&card(gid, "极限", 1000)).expect("create");
    let fetched = db.get_card(created.id).expect("get").expect("exists");
    // Assert
    assert_eq!(fetched.front, "极限");
    assert_eq!(fetched.group_id, gid);
    assert_eq!(fetched.due_at, 1000);
}

#[test]
fn card_by_fragment_is_idempotency_judge() {
    // Arrange：碎片绑定卡（v0.12.2 升卡幂等判据）
    let db = mem_db();
    let gid = make_group(&db);
    let f = db
        .create_fragment(&crate::db_fragments::NewFragment {
            text: "多句碎片：先晕染再定妆。".to_string(),
            image_path: None,
            domain_tag: None,
            group_id: Some(gid),
            source: "manual".to_string(),
        })
        .expect("frag");
    let mut c = card(gid, "晕染步骤", 1000);
    c.fragment_id = Some(f.id);
    db.create_card(&c).expect("card");
    // Act/Assert：命中返回卡；无卡碎片返回 None
    let hit = db.card_by_fragment(f.id).expect("hit").expect("应命中");
    assert_eq!(hit.front, "晕染步骤");
    let miss = db.card_by_fragment(9999).expect("miss");
    assert!(miss.is_none());
}

#[test]
fn front_exists_dedup_key() {
    // Arrange：同组同 front 幂等查重（生成防重）
    let db = mem_db();
    let gid = make_group(&db);
    db.create_card(&card(gid, "导数", 1000)).expect("create");
    // Act/Assert
    assert!(db.card_front_exists(gid, "导数").expect("exists"));
    assert!(!db.card_front_exists(gid, "积分").expect("miss"));
}

#[test]
fn due_queue_filters_by_time_and_group() {
    // Arrange：两卡一到期一未到期；另一组一张到期卡
    let db = mem_db();
    let g1 = make_group(&db);
    let g2 = db
        .create_group(&NewNoteGroup {
            name: "二组".to_string(),
            terrain: "container".to_string(),
            kind: "standalone".to_string(),
            domain_tag: None,
            source: "route".to_string(),
            series_key: None,
            route_reason: None,
        })
        .expect("g2")
        .id;
    db.create_card(&card(g1, "到期卡", 1000)).expect("c1");
    db.create_card(&card(g1, "未到期卡", 9999)).expect("c2");
    db.create_card(&card(g2, "二组到期卡", 500)).expect("c3");
    // Act：now=2000 全量队列 / 按组过滤
    let all = db.list_due_cards(None, 2000, 100).expect("all");
    let only_g1 = db.list_due_cards(Some(g1), 2000, 100).expect("g1");
    // Assert：到期最紧在前；组过滤正确
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].front, "二组到期卡");
    assert_eq!(only_g1.len(), 1);
    assert_eq!(only_g1[0].front, "到期卡");
    assert_eq!(db.count_due_cards(Some(g1), 2000).expect("count"), 1);
}

#[test]
fn review_updates_schedule_and_logs() {
    // Arrange
    let db = mem_db();
    let gid = make_group(&db);
    let c = db.create_card(&card(gid, "极限", 1000)).expect("create");
    // Act：复习后调度更新 + 日志落库
    db.update_card_schedule(c.id, r#"{"reps":1}"#, 9000).expect("update");
    db.add_review_log(c.id, "good", 2000).expect("log");
    // Assert
    let fetched = db.get_card(c.id).expect("get").expect("exists");
    assert_eq!(fetched.due_at, 9000);
    assert_eq!(fetched.state_json, r#"{"reps":1}"#);
    assert!(db.group_has_reviews(gid).expect("has reviews"));
}

#[test]
fn group_without_reviews_reports_false() {
    // Arrange
    let db = mem_db();
    let gid = make_group(&db);
    // Act/Assert：北极星组成①诚实为假
    assert!(!db.group_has_reviews(gid).expect("query"));
}

#[test]
fn metric_events_record_and_count() {
    // Arrange
    let db = mem_db();
    // Act：三类指标各记
    db.add_metric_event("card_reviewed", r#"{"cardId":1}"#).expect("m1");
    db.add_metric_event("card_reviewed", r#"{"cardId":2}"#).expect("m2");
    db.add_metric_event("fragment_upgraded", r#"{"fragmentId":1}"#).expect("m3");
    // Assert：过程指标读数正确
    assert_eq!(db.count_metric_events("card_reviewed").expect("c"), 2);
    assert_eq!(db.count_metric_events("fragment_upgraded").expect("f"), 1);
    assert_eq!(db.count_metric_events("group_settled").expect("s"), 0);
}

/// 指定 kind 的卡（kind 过滤/模型卡数据源测试用；区别于默认 fact 的 card()）。
fn card_kind(group_id: i64, front: &str, kind: &str) -> NewFlashcard {
    NewFlashcard {
        group_id,
        note_id: None,
        fragment_id: None,
        front: front.to_string(),
        back: format!("{} 的释义", front),
        kind: kind.to_string(),
        state_json: "{}".to_string(),
        due_at: 1000,
    }
}

#[test]
fn list_cards_by_group_filters_by_kind() {
    // Arrange：同组建 fact + model 两卡；按创建序（id 升序）应稳定排
    let db = mem_db();
    let gid = make_group(&db);
    db.create_card(&card(gid, "极限", 1000)).expect("fact");
    db.create_card(&card_kind(gid, "安全边际", "model")).expect("model");
    db.create_card(&card_kind(gid, "复利", "model")).expect("model2");
    // Act：无 kind 过滤 / model 过滤 / fact 过滤 / 不存在 kind
    let all = db.list_cards_by_group(gid, None).expect("all");
    let models = db.list_cards_by_group(gid, Some("model")).expect("model");
    let facts = db.list_cards_by_group(gid, Some("fact")).expect("fact");
    // Assert：ORDER BY id 升序；kind 过滤正确；他组不受影响
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].front, "极限");
    assert_eq!(all[1].front, "安全边际");
    assert_eq!(all[2].front, "复利");
    assert_eq!(models.len(), 2);
    assert!(models.iter().all(|c| c.kind == "model"));
    assert_eq!(facts.len(), 1);
    assert_eq!(facts[0].front, "极限");
    assert_eq!(facts[0].kind, "fact");
    assert_eq!(db.list_cards_by_group(9999, None).expect("other").len(), 0);
}

#[test]
fn find_card_by_front_hit_and_miss() {
    // Arrange：同组建一卡（同组同 front 幂等取卡——升格判据）
    let db = mem_db();
    let gid = make_group(&db);
    db.create_card(&card_kind(gid, "安全边际", "model")).expect("create");
    // Act/Assert：命中返回整卡；未命中返回 None
    let hit = db.find_card_by_front(gid, "安全边际").expect("hit").expect("应命中");
    assert_eq!(hit.front, "安全边际");
    assert_eq!(hit.kind, "model");
    assert!(db.find_card_by_front(gid, "不存在").expect("miss").is_none());
}

#[test]
fn update_card_back_roundtrip() {
    // Arrange：建卡后升格追加锚点再写回
    let db = mem_db();
    let gid = make_group(&db);
    let c = db.create_card(&card(gid, "极限", 1000)).expect("create");
    // Act：把锚点独立行追加到 back 并写回
    let new_back = format!("{}\n→ 概念「安全边际」", c.back);
    let updated = db.update_card_back(c.id, &new_back).expect("update");
    // Assert：往返命中；不存在的 id 返回 false（无该行可更新）
    assert!(updated);
    let fetched = db.get_card(c.id).expect("get").expect("exists");
    assert_eq!(fetched.back, new_back);
    assert!(!db.update_card_back(9999, "x").expect("miss"));
}
