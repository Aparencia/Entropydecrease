//! budget_allocator 单测（档位矩阵/O(1) 恒量/截断与诚实信号）。

use crate::budget_allocator::{
    honest_truncation_note, pack_fragments, plan_budget, tier_tokens, truncate_retrieval,
};

#[test]
fn tier_matrix() {
    assert_eq!(tier_tokens("light"), 4_000);
    assert_eq!(tier_tokens("standard"), 10_000);
    assert_eq!(tier_tokens("deep"), 30_000);
    assert_eq!(tier_tokens(""), 10_000, "未知回落标准");
    assert_eq!(tier_tokens("huge"), 10_000);
}

#[test]
fn budget_plan_constant_components() {
    let s = plan_budget("standard");
    assert_eq!(s.retrieval_tokens, 10_000 - 2_300 - 2_000);
    assert_eq!(s.retrieval_chars, s.retrieval_tokens * 2);
    let d = plan_budget("deep");
    assert_eq!(d.retrieval_tokens, 30_000 - 2_300 - 2_000);
    // O(1)：输出上界与输入规模无关——budget 恒定
    assert_eq!(s.retrieval_chars, (10_000 - 4_300) * 2);
}

#[test]
fn truncate_respects_char_budget() {
    let text = "中".repeat(1000);
    let out = truncate_retrieval(&text, 100);
    assert_eq!(out.chars().count(), 100);
    assert_eq!(truncate_retrieval(&text, 0), "");
    let short = truncate_retrieval("短", 100);
    assert_eq!(short, "短");
}

#[test]
fn pack_fragments_orders_by_score_and_bounds_total() {
    let frags = vec![
        ("低".to_string(), 0.2),
        ("高相关片段".to_string(), 0.9),
        ("中".to_string(), 0.5),
    ];
    let (out, truncated) = pack_fragments(&frags, 20);
    assert!(out.contains("高相关片段"), "高相关优先入包: {}", out);
    assert!(out.find("高相关片段").unwrap() < out.find("中").unwrap());
    assert!(truncated, "预算 20 字符必截断——诚实信号");
    let (all, t2) = pack_fragments(&frags, 10_000);
    assert!(all.contains("低"));
    assert!(!t2);
}

#[test]
fn honest_note_only_when_truncated() {
    assert_eq!(honest_truncation_note(false), "");
    assert!(honest_truncation_note(true).contains("已按相关性精简"));
}
