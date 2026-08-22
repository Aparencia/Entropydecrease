//! db_contracts 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::types::NewNoteGroup;
use crate::week_contract::week_start_secs;

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建组助手（contracts/flashcards 外键前置）。
fn make_group(db: &Db, name: &str) -> crate::types::NoteGroup {
    db.create_group(&NewNoteGroup {
        name: name.to_string(),
        terrain: "container".to_string(),
        kind: "standalone".to_string(),
        domain_tag: None,
        source: "manual".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("group")
}

/// 建卡助手（review_logs 外键前置；新卡 due 不限制）。
fn make_card(db: &Db, group_id: i64, front: &str) -> crate::types::Flashcard {
    db.create_card(&NewFlashcard {
        group_id,
        note_id: None,
        fragment_id: None,
        front: front.to_string(),
        back: "验证材料".to_string(),
        kind: "fact".to_string(),
        state_json: "{}".to_string(),
        due_at: 0,
    })
    .expect("card")
}

#[test]
fn upsert_creates_and_overrides_this_week() {
    // Arrange
    let db = mem_db();
    let group = make_group(&db, "契约组");
    let ws = week_start_secs(1_767_225_600);
    // Act：首次写入 → 再次写入覆盖（幂等语义）
    let c1 = db
        .upsert_week_contract(group.id, ws, 3, 15)
        .expect("first");
    let c2 = db
        .upsert_week_contract(group.id, ws, 5, 30)
        .expect("override");
    // Assert：同周同组仅一份契约，目标值已覆盖；created_at 单调不倒退
    //         （秒级时间戳同秒两次 upsert 相等属正常——幂等覆盖语义）
    let fetched = db.get_week_contract(group.id, ws).expect("get");
    let fetched = fetched.expect("契约应存在");
    assert_eq!(fetched.id, c1.id);
    assert_eq!(fetched.target_days, 5);
    assert_eq!(fetched.target_cards, 30);
    assert_eq!(fetched.created_at, c2.created_at, "upsert 返回值与落库一致");
    assert!(c2.created_at >= c1.created_at, "created_at 单调不倒退（同秒幂等允许相等）");
}

#[test]
fn different_weeks_coexist() {
    // Arrange
    let db = mem_db();
    let group = make_group(&db, "双周组");
    let wk1 = week_start_secs(1_767_225_600);
    let wk2 = wk1 + 604_800; // 下一周
    // Act：两周各立一约
    db.upsert_week_contract(group.id, wk1, 2, 10).expect("wk1");
    db.upsert_week_contract(group.id, wk2, 4, 20).expect("wk2");
    // Assert：互不覆盖
    assert_eq!(db.get_week_contract(group.id, wk1).expect("g1").expect("c1").target_cards, 10);
    assert_eq!(db.get_week_contract(group.id, wk2).expect("g2").expect("c2").target_cards, 20);
}

#[test]
fn missing_contract_returns_none() {
    // Arrange：组存在但从未立约
    let db = mem_db();
    let group = make_group(&db, "无约组");
    // Act/Assert：诚实 None（UI 显示设定表单）
    assert!(db.get_week_contract(group.id, week_start_secs(1_767_225_600)).expect("get").is_none());
}

#[test]
fn review_ats_in_week_filters_group_and_range() {
    // Arrange：两组各一卡；本周 3 次复习 + 下周 1 次（reviewed_at 为毫秒口径）
    let db = mem_db();
    let g1 = make_group(&db, "组一");
    let g2 = make_group(&db, "组二");
    let card1 = make_card(&db, g1.id, "卡一");
    let card2 = make_card(&db, g2.id, "卡二");
    let ws = week_start_secs(1_767_225_600);
    let ws_ms = ws * 1000;
    db.add_review_log(card1.id, "good", ws_ms + 3_600_000).expect("r1"); // 本周
    db.add_review_log(card1.id, "good", ws_ms + 86_400_000).expect("r2"); // 本周
    db.add_review_log(card2.id, "easy", ws_ms + 43_200_000).expect("r3"); // 本周·他组
    db.add_review_log(card1.id, "again", ws_ms + 604_800_000 + 100).expect("r4"); // 下周
    // Act
    let ats = db.review_ats_in_week(g1.id, ws).expect("query");
    // Assert：仅组一本周 2 条（下周归下周、他组不计；返回毫秒原值）
    assert_eq!(ats.len(), 2);
    assert!(ats.contains(&(ws_ms + 3_600_000)));
    assert!(ats.contains(&(ws_ms + 86_400_000)));
}

#[test]
fn upsert_rejects_unknown_group() {
    // Arrange：不存在的组 id
    let db = mem_db();
    // Act/Assert：外键约束报错（不静默写孤儿契约）
    assert!(db.upsert_week_contract(9999, 0, 3, 15).is_err());
}
