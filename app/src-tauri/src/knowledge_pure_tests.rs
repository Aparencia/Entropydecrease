//! knowledge_pure 单测（AAA 模式；golden 边界全覆盖——spec §三 + 规格精化 created_at_ms）。

use crate::knowledge_pure::{
    audit_due, concept_stale, promote_rules, AuditSignal, PromoteDecision, PromoteInput,
    StaleLevel, StaleSignal,
};

// audit_due golden：首次（last_audit=None）以 created_at_ms 为基线；二次以 last_audit 为基线。

#[test]
fn audit_first_89_days_not_due() {
    // Arrange：从未审计，创建 89 天前
    let s = AuditSignal {
        item_count: 0,
        last_audit_at_ms: None,
        created_at_ms: 0,
        now_ms: 89 * 86_400_000 + 100,
    };
    // Act/Assert：89 天不触发
    assert!(!audit_due(&s));
}

#[test]
fn audit_first_90_days_due() {
    // Arrange：从未审计，创建 90 天前
    let s = AuditSignal {
        item_count: 0,
        last_audit_at_ms: None,
        created_at_ms: 0,
        now_ms: 90 * 86_400_000,
    };
    // Act/Assert：90 天触发（首次仅周期，无条目下限）
    assert!(audit_due(&s));
}

#[test]
fn audit_second_89_days_not_due() {
    // Arrange：上次审计 89 天前，条目充足
    let s = AuditSignal {
        item_count: 30,
        last_audit_at_ms: Some(100),
        created_at_ms: 0,
        now_ms: 100 + 89 * 86_400_000 + 100,
    };
    // Act/Assert：距上次 <90 天不触发
    assert!(!audit_due(&s));
}

#[test]
fn audit_second_90_days_below_min_not_due() {
    // Arrange：上次审计 90 天前，条目 19（<20）
    let s = AuditSignal {
        item_count: 19,
        last_audit_at_ms: Some(100),
        created_at_ms: 0,
        now_ms: 100 + 90 * 86_400_000,
    };
    // Act/Assert：距上次 ≥90 天但条目不足 20 → 不触发（仪式有成本）
    assert!(!audit_due(&s));
}

#[test]
fn audit_second_90_days_above_min_due() {
    // Arrange：上次审计 90 天前，条目 20
    let s = AuditSignal {
        item_count: 20,
        last_audit_at_ms: Some(100),
        created_at_ms: 0,
        now_ms: 100 + 90 * 86_400_000,
    };
    // Act/Assert：距上次 ≥90 天且条目 ≥20 → 触发
    assert!(audit_due(&s));
}

// concept_stale golden：以最近引用为老化基线，从未引用退化为创建时刻。

#[test]
fn stale_referenced_recently_none() {
    // Arrange：10 天前被引用
    let s = StaleSignal {
        last_referenced_at_ms: Some(200),
        last_applied_at_ms: Some(300),
        created_at_ms: 100,
        now_ms: 200 + 10 * 86_400_000,
    };
    // Act/Assert：<90 天 → 新鲜
    assert_eq!(concept_stale(&s), StaleLevel::None);
}

#[test]
fn stale_90_to_179_unreferenced_watching() {
    // Arrange：从未被引用（创建已 120 天），从未应用
    let s = StaleSignal {
        last_referenced_at_ms: None,
        last_applied_at_ms: None,
        created_at_ms: 100,
        now_ms: 100 + 120 * 86_400_000,
    };
    // Act/Assert：90~179 天无引用 → Watching
    assert_eq!(concept_stale(&s), StaleLevel::Watching);
}

#[test]
fn stale_180_unreferenced_never_applied_archive() {
    // Arrange：从未被引用（创建已 200 天），从未应用
    let s = StaleSignal {
        last_referenced_at_ms: None,
        last_applied_at_ms: None,
        created_at_ms: 100,
        now_ms: 100 + 200 * 86_400_000,
    };
    // Act/Assert：≥180 天且从未应用 → Archive
    assert_eq!(concept_stale(&s), StaleLevel::Archive);
}

#[test]
fn stale_180_unreferenced_but_applied_watching() {
    // Arrange：从未被引用（创建已 200 天），但有应用记录
    let s = StaleSignal {
        last_referenced_at_ms: None,
        last_applied_at_ms: Some(500),
        created_at_ms: 100,
        now_ms: 100 + 200 * 86_400_000,
    };
    // Act/Assert：≥180 天但有应用 → Watching（仍活跃，归档过激）
    assert_eq!(concept_stale(&s), StaleLevel::Watching);
}

// promote_rules golden：归一化后命中/跨体系/未命中/空名。

/// 归一化后的卡片名与 existing 名称含多余空白也应命中（判定前置归一化）。
#[test]
fn promote_new_name_creates() {
    // Arrange：未命中任何既有概念
    let input = PromoteInput {
        card_name: "贝叶斯定理".to_string(),
        existing: vec![(1, "微积分".to_string(), 10)],
        target_system_id: 10,
    };
    // Act/Assert
    assert_eq!(promote_rules(&input), PromoteDecision::Create);
}

#[test]
fn promote_same_name_merges() {
    // Arrange：卡片名与既有概念同体系同名（且书写含多余空格）
    let input = PromoteInput {
        card_name: "  贝叶斯 定理  ".to_string(),
        existing: vec![(7, "贝叶斯 定理".to_string(), 10)],
        target_system_id: 10,
    };
    // Act/Assert：同体系同名 → Merge
    assert_eq!(promote_rules(&input), PromoteDecision::Merge { concept_id: 7 });
}

#[test]
fn promote_cross_system_hints() {
    // Arrange：卡片名命中跨体系同名概念
    let input = PromoteInput {
        card_name: "贝叶斯定理".to_string(),
        existing: vec![(9, "贝叶斯定理".to_string(), 42)],
        target_system_id: 10,
    };
    // Act/Assert：跨体系 → CrossSystemHint（v0.13.4 交叉点数据源）
    assert_eq!(
        promote_rules(&input),
        PromoteDecision::CrossSystemHint { concept_id: 9, other_system_id: 42 }
    );
}

#[test]
#[should_panic(expected = "command 层须先校验拒绝空名")]
fn promote_empty_name_panics() {
    // Arrange：卡片名仅空白（归一化后为空）
    let input = PromoteInput {
        card_name: "   \t  ".to_string(),
        existing: vec![],
        target_system_id: 10,
    };
    // Act：应 panic（提示 command 层须先校验）
    let _ = promote_rules(&input);
}
