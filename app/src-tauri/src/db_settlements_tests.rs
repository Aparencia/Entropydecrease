//! db_settlements 单测（内存库；AAA 模式）。

use crate::db::Db;
use crate::db_flashcards::NewFlashcard;
use crate::db_fragments::NewFragment;
use crate::types::NewNoteGroup;

/// 内存库。
fn mem_db() -> Db {
    Db::open(":memory:").expect("内存库打开")
}

/// 建组助手。
fn make_group(db: &Db) -> i64 {
    db.create_group(&NewNoteGroup {
        name: "结算组".to_string(),
        terrain: "feed".to_string(),
        kind: "topic".to_string(),
        domain_tag: Some("beauty".to_string()),
        source: "route".to_string(),
        series_key: None,
        route_reason: None,
    })
    .expect("group")
    .id
}

/// 碎片入参助手。
fn frag(group_id: i64, text: &str) -> NewFragment {
    NewFragment {
        text: text.to_string(),
        image_path: None,
        domain_tag: None,
        group_id: Some(group_id),
        source: "manual".to_string(),
    }
}

#[test]
fn settlement_record_and_latest_lookup() {
    // Arrange
    let db = mem_db();
    let g = make_group(&db);
    assert_eq!(db.latest_settlement_at(g).expect("none"), None);
    // Act：两次结算取最新
    db.create_settlement(g, r#"{"merged":1}"#).expect("s1");
    db.create_settlement(g, r#"{"merged":2}"#).expect("s2");
    // Assert：最近结算时刻可读（周期触发器判据源）
    assert!(db.latest_settlement_at(g).expect("some").is_some());
}

#[test]
fn fragment_card_binding_blocks_archive() {
    // Arrange：两碎片——一有卡绑定一没有
    let db = mem_db();
    let g = make_group(&db);
    let with_card = db.create_fragment(&frag(g, "有卡碎片")).expect("f1");
    let bare = db.create_fragment(&frag(g, "裸碎片")).expect("f2");
    db.create_card(&NewFlashcard {
        group_id: g,
        note_id: None,
        fragment_id: Some(with_card.id),
        front: "有卡碎片".to_string(),
        back: "back".to_string(),
        kind: "fact".to_string(),
        state_json: "{}".to_string(),
        due_at: 0,
    })
    .expect("card");
    // Act/Assert：绑定判定正确（有卡碎片不进归档——学习循环资产）
    assert!(db.fragment_has_card(with_card.id).expect("q1"));
    assert!(!db.fragment_has_card(bare.id).expect("q2"));
}
