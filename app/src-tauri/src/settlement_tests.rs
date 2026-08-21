//! settlement 单测（AAA 模式；阈值/周期边界 + 合并判据 golden 用例）。

use crate::settlement::{
    find_merge_pairs, settlement_due, text_similarity, SettlementSignals,
};

/// 基准：30 条、建组 100 天前、从未结算、当前时刻。
fn base_signals() -> SettlementSignals {
    SettlementSignals {
        item_count: 30,
        last_settled_at: None,
        created_at: 1_000_000,
        now_secs: 1_000_000 + 100 * 86_400,
    }
}

#[test]
fn threshold_triggers_regardless_of_time() {
    // Arrange：刚建组但已 50 条（重度膨胀）
    let s = SettlementSignals {
        item_count: 50,
        last_settled_at: None,
        created_at: 1_000_000,
        now_secs: 1_000_001,
    };
    // Act/Assert：阈值触发（沼泽化前兆不等周期）
    assert!(settlement_due(&s));
}

#[test]
fn cycle_triggers_after_ninety_days() {
    // Arrange：30 条、建组 100 天从未结算
    let s = base_signals();
    // Act/Assert：周期触发（≥20 条且 ≥90 天）
    assert!(settlement_due(&s));
}

#[test]
fn recently_settled_not_due() {
    // Arrange：30 条、10 天前刚结算
    let s = SettlementSignals {
        last_settled_at: Some(1_000_000 + 90 * 86_400),
        ..base_signals()
    };
    // Act/Assert：周期重置不打扰
    assert!(!settlement_due(&s));
}

#[test]
fn small_group_never_bothered() {
    // Arrange：10 条老组（仪式有成本，条目太少不值得）
    let s = SettlementSignals { item_count: 10, ..base_signals() };
    // Act/Assert
    assert!(!settlement_due(&s));
}

#[test]
fn similarity_identical_and_disjoint() {
    // Arrange/Act/Assert：全同=1，无关≈0
    assert!(text_similarity("眼影晕染技巧", "眼影晕染技巧") > 0.99);
    assert!(text_similarity("眼影晕染技巧", "Python 装饰器原理") < 0.2);
    assert_eq!(text_similarity("", "任何文本"), 0.0);
}

#[test]
fn similarity_near_duplicate_above_threshold() {
    // Arrange：轻微改写的重复碎片（典型重复形态）
    let a = "眼影晕染要用松软的刷子少量多次";
    let b = "眼影晕染要用松软的刷子，少量多次！";
    // Act/Assert：标点差异不影响重复判定
    assert!(text_similarity(a, b) >= 0.7, "sim={}", text_similarity(a, b));
}

#[test]
fn merge_pairs_keep_longer_and_greedy() {
    // Arrange：三条——前两条重复，第三条独立
    let items = vec![
        (1, "眼影晕染要用松软的刷子".to_string()),
        (2, "眼影晕染要用松软的刷子少量多次才不会脏".to_string()),
        (3, "Python 装饰器的执行时机".to_string()),
    ];
    // Act
    let pairs = find_merge_pairs(&items);
    // Assert：一对（保留较长的 id=2，丢弃 id=1）；独立项不配对
    assert_eq!(pairs.len(), 1);
    assert_eq!(pairs[0], (2, 1));
}

#[test]
fn merge_pairs_each_item_at_most_once() {
    // Arrange：三条互相近似（防链式合并丢内容）
    let items = vec![
        (1, "化妆前要做好保湿打底".to_string()),
        (2, "化妆前要做好保湿打底工作".to_string()),
        (3, "化妆前要做好保湿打底步骤".to_string()),
    ];
    // Act
    let pairs = find_merge_pairs(&items);
    // Assert：贪心一对一——最多一对，第三条留待下轮结算
    assert_eq!(pairs.len(), 1);
}
