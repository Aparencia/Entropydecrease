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
    // 片段须长于预算才触发"部分截断+诚实信号"（pack 语义：按相关性降序逐项
    // 塞入，超剩余则截断该段尾部并置 truncated——2026-09-03 全量复现原断言用
    // 短片断在 20 字符预算内可全收（正文 8 字 + 换行符计入用量仍 <20），断言
    // 必假；按 v0.18.2 批次遗留修正：加长高相关段保证部分截断必触发）
    let frags = vec![
        ("低".to_string(), 0.2),
        ("高相关片段一二三四五六七八九十一二三四五六七八九十".to_string(), 0.9),
        ("中".to_string(), 0.5),
    ];
    let (out, truncated) = pack_fragments(&frags, 20);
    assert!(out.contains("高相关片段"), "高相关优先入包: {}", out);
    assert!(truncated, "预算 20 字符必截断——诚实信号");
    assert!(!out.contains("中"), "预算耗尽后低相关段不入包（余量 0 即停）: {}", out);
    let (all, t2) = pack_fragments(&frags, 10_000);
    assert!(all.contains("低"));
    assert!(all.find("高相关片段").unwrap() < all.find("中").unwrap());
    assert!(all.find("中").unwrap() < all.find("低").unwrap());
    assert!(!t2);
}

#[test]
fn honest_note_only_when_truncated() {
    assert_eq!(honest_truncation_note(false), "");
    assert!(honest_truncation_note(true).contains("已按相关性精简"));
}
