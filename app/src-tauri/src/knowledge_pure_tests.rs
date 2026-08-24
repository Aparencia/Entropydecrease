//! knowledge_pure 单测（AAA 模式；golden 边界全覆盖——spec §三 + 规格精化 created_at_ms）。

use crate::knowledge_pure::{
    audit_due, concept_stale, promote_rules, validate_decision_input, AuditSignal,
    PromoteDecision, PromoteInput, StaleLevel, StaleSignal,
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

// validate_decision_input golden（kind 驱动结构契约；AAA + 边界注释）。

#[test]
fn validate_decision_entity_and_evidence_ok() {
    // Arrange：决策引用概念 + 证据（复合引用）
    let refs = r#"{"concept_ids":[3],"group_id":2}"#;
    // Act：合法决策（实体 + 证据）→ Ok，返回规范化 JSON
    let out = validate_decision_input(refs, "decision");
    // Assert
    assert!(out.is_ok());
    let s = out.expect("ok");
    assert!(s.contains("\"concept_ids\":[3]"));
    assert!(s.contains("\"group_id\":2"));
}

#[test]
fn validate_decision_no_ref_err() {
    // Arrange：空对象
    // Act：无任何引用 → Err（决策需引用体系实体或证据）
    let err = validate_decision_input("{}", "decision");
    // Assert
    assert_eq!(err, Err("决策需引用体系实体或证据".to_string()));
}

#[test]
fn validate_decision_model_only_ok() {
    // Arrange：仅引用模型
    // Act：合法决策（体系实体）
    let out = validate_decision_input(r#"{"model_ids":[7]}"#, "decision");
    // Assert
    assert!(out.is_ok());
}

#[test]
fn validate_decision_evidence_only_ok() {
    // Arrange：仅引用证据（组）——体系模式决策
    // Act：合法决策（体系实体或证据之一即可）
    assert!(validate_decision_input(r#"{"group_id":2}"#, "decision").is_ok());
}

#[test]
fn validate_decision_array_is_err() {
    // Arrange：JSON 是数组而非对象
    let err = validate_decision_input("[1,2]", "decision");
    // Assert：非对象 → Err「引用需为对象」
    assert_eq!(err, Err("引用需为对象".to_string()));
}

#[test]
fn validate_decision_negative_id_err() {
    // Arrange：node_id 为负
    let err = validate_decision_input(r#"{"node_ids":[-1]}"#, "decision");
    // Assert：≤0 → Err「无效的 id」
    assert_eq!(err, Err("无效的 id".to_string()));
}

#[test]
fn validate_decision_unknown_key_err() {
    // Arrange：含白名单外键
    let err = validate_decision_input(r#"{"unknown":1}"#, "decision");
    // Assert：未知键 → Err「不支持的引用键」
    assert_eq!(err, Err("不支持的引用键".to_string()));
}

#[test]
fn validate_invalid_json_err() {
    // Arrange：非法 JSON
    let err = validate_decision_input("not-json", "decision");
    // Assert：解析失败 → Err「引用格式错误」
    assert_eq!(err, Err("引用格式错误".to_string()));
}

#[test]
fn validate_application_empty_ids_err() {
    // Arrange：application 的 concept_ids 为空数组
    let err = validate_decision_input(r#"{"concept_ids":[]}"#, "application");
    // Assert：空数组不算引用 → Err「应用记录必须至少一个引用」
    assert_eq!(err, Err("应用记录必须至少一个引用".to_string()));
}

#[test]
fn validate_application_concept_and_card_ok() {
    // Arrange：application 引用概念 + 闪卡
    // Act：合法应用（概念 + 证据）
    let out = validate_decision_input(r#"{"concept_ids":[5],"card_id":9}"#, "application");
    // Assert
    assert!(out.is_ok());
}

#[test]
fn validate_application_group_evidence_ok() {
    // Arrange：application 仅引用组（体系模式证据引用——已批准修正）
    // Act：合法应用（至少一个引用即可，不强制概念）
    assert!(validate_decision_input(r#"{"group_id":2}"#, "application").is_ok());
}

#[test]
fn validate_bogus_kind_err() {
    // Arrange：非法 kind
    let err = validate_decision_input("{}", "bogus");
    // Assert：非白名单 kind → Err
    assert!(err.is_err());
}
