//! asr_pass2 纯逻辑单测（v0.20.2 / REQ-268，AAA 组织）。
//!
//! @ai-context: 覆盖验收门槛「精修采纳流单测（原料不可变断言）」——本文件
//!              断言 effective_segments 对原段列表零改写（纯值语义 + 覆盖断言）。

use super::*;

fn seg(start_ms: u64, end_ms: u64, text: &str) -> TimedText {
    TimedText { start_ms, end_ms, text: text.to_string() }
}

// ── plan_windows ──

#[test]
fn plan_windows_covers_entire_duration() {
    // Arrange/Act：60s 音频 → 30s 窗 + 2s 重叠 → 2 窗覆盖首尾
    let w = plan_windows(60_000);
    // Assert
    assert_eq!(w.first(), Some(&(0, 30_000)));
    assert_eq!(w.last().map(|x| x.1), Some(60_000));
    assert!(w.len() >= 2, "{w:?}");
}

#[test]
fn plan_windows_empty_and_short_guard() {
    assert!(plan_windows(0).is_empty());
    // 短音频（< 窗长）只产单窗，末窗不越界
    let w = plan_windows(10_000);
    assert_eq!(w, vec![(0, 10_000)]);
}

// ── window_base_text ──

#[test]
fn base_text_joins_overlapping_sorted() {
    let segs = vec![seg(5_000, 9_000, "B"), seg(0, 4_000, "A"), seg(20_000, 25_000, "C")];
    let base = window_base_text(&segs, (0, 10_000));
    assert_eq!(base, "A B", "仅与窗重叠的段按时间序拼接");
}

#[test]
fn base_text_skips_empty_segments() {
    let segs = vec![seg(0, 4_000, ""), seg(5_000, 8_000, "有内容")];
    assert_eq!(window_base_text(&segs, (0, 10_000)), "有内容");
}

#[test]
fn base_text_no_overlap_empty() {
    let segs = vec![seg(100, 200, "X")];
    assert_eq!(window_base_text(&segs, (0, 50)), "");
}

// ── normalized_similarity ──

#[test]
fn similarity_identical_is_one() {
    assert_eq!(normalized_similarity("今天讲熵减。", "今天讲熵减。"), 1.0);
}

#[test]
fn similarity_punct_only_diff_is_one() {
    // 标点差异不进距离（与 CER strip_punct 同口径）
    assert_eq!(normalized_similarity("今天讲熵减。", "今天讲熵减，"), 1.0);
}

#[test]
fn similarity_content_diff_below_one() {
    let sim = normalized_similarity("必须掌握", "毕需掌握");
    assert!(sim < 1.0 && sim > 0.0, "{sim}");
}

// ── propose_window ──

#[test]
fn propose_skips_identical_window() {
    let segs = vec![seg(0, 30_000, "今天讲熵减。")];
    let p = propose_window((0, 30_000), " 今天讲熵减。 ", &segs);
    assert!(p.is_none(), "相似度达门限不产草稿");
}

#[test]
fn propose_when_meaningful_diff() {
    let segs = vec![seg(0, 30_000, "必须掌握基本概念")];
    let p = propose_window((0, 30_000), "毕需掌握基本概念", &segs);
    let p = p.expect("有实质差异应产草稿");
    assert_eq!(p.base_text, "必须掌握基本概念");
    assert_eq!(p.refined_text, "毕需掌握基本概念");
}

#[test]
fn propose_recovers_missing_content() {
    // 原链路该窗无内容（base 空）而第二遍有转写 = 漏识恢复
    let p = propose_window((0, 30_000), "讲者内容", &[]).expect("空基线+有精修应提议");
    assert!(p.base_text.is_empty());
    assert_eq!(p.similarity, 0.0);
}

#[test]
fn propose_skips_empty_refined() {
    let segs = vec![seg(0, 30_000, "内容")];
    assert!(propose_window((0, 30_000), "   ", &segs).is_none());
}

// ── effective_segments（原料不可变断言）──

#[test]
fn effective_drops_fully_covered_and_keeps_partial() {
    // Arrange
    let segs = vec![
        seg(0, 20_000, "A"), // 完全落在采纳窗 [0,30s] → 让位
        seg(31_000, 33_000, "B"), // 窗外 → 保留
        seg(26_000, 40_000, "C"), // 与窗重叠 4s/14s ≈ 0.29 < 0.6 → 保留
    ];
    let adopted = vec![TimedText { start_ms: 0, end_ms: 30_000, text: "P".into() }];
    // Act
    let eff = effective_segments(&segs, &adopted);
    // Assert：原料未被改写（纯值，长度/内容断言）
    assert_eq!(segs.len(), 3, "原料表结构零改动");
    assert!(eff.iter().any(|t| t.text == "P"), "采纳窗文本入有效轴");
    assert!(eff.iter().any(|t| t.text == "B") && eff.iter().any(|t| t.text == "C"), "部分覆盖保留");
    assert!(!eff.iter().any(|t| t.text == "A"), "完全覆盖让位");
}

#[test]
fn effective_no_adopted_returns_copy() {
    let segs = vec![seg(0, 5_000, "A"), seg(6_000, 10_000, "B")];
    let eff = effective_segments(&segs, &[]);
    assert_eq!(eff, segs);
}

#[test]
fn effective_merges_overlapping_adopted_windows() {
    // 相邻窗 2s 重叠：两采纳块应合并为一块（同句跨窗去重）
    let adopted = vec![
        TimedText { start_ms: 0, end_ms: 30_000, text: "甲句乙句。".into() },
        TimedText { start_ms: 28_000, end_ms: 60_000, text: "丙句。".into() },
    ];
    let eff = effective_segments(&[], &adopted);
    assert_eq!(eff.len(), 1, "重叠采纳块合并");
    assert!(eff[0].start_ms <= 28_000 && eff[0].end_ms >= 30_000);
    assert!(eff[0].text.contains("丙句"));
}

#[test]
fn effective_result_sorted_and_empty_safe() {
    let segs = vec![seg(40_000, 50_000, "B"), seg(0, 5_000, "A")];
    let adopted = vec![TimedText { start_ms: 10_000, end_ms: 20_000, text: "P".into() }];
    let eff = effective_segments(&segs, &adopted);
    let starts: Vec<u64> = eff.iter().map(|t| t.start_ms).collect();
    assert_eq!(starts, vec![0, 10_000, 40_000], "时间轴升序");
    assert!(effective_segments(&[], &[]).is_empty());
}

// ── overlay_segments（转笔记装载：保留行结构与 id 锚点）──

fn row(id: i64, start_ms: u64, end_ms: u64, text: &str) -> crate::types::SessionSegment {
    crate::types::SessionSegment {
        id,
        session_id: 7,
        start_ms,
        end_ms,
        text: text.to_string(),
        source: "asr".into(),
        confidence: None,
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }
}

#[test]
fn overlay_drops_dominant_and_keeps_ids() {
    // Arrange：窗 [0,30s) 完全覆盖行 1、仅小部分覆盖行 3（保留）
    let segs = vec![row(11, 0, 20_000, "A"), row(12, 24_000, 28_000, "B"), row(13, 28_000, 50_000, "C")];
    let adopted = vec![(0u64, 30_000u64, "P".to_string())];
    // Act
    let out = overlay_segments(&segs, &adopted);
    // Assert：行 1/2 让位（合成行沿用最小 id 11），行 3 部分覆盖保留
    assert_eq!(out.iter().filter(|r| r.text == "P").count(), 1);
    let p = out.iter().find(|r| r.text == "P").unwrap();
    assert_eq!(p.id, 11, "合成行沿用覆盖原段最小 id（锚点稳定）");
    assert!(out.iter().any(|r| r.id == 13 && r.text == "C"), "部分覆盖行保留");
    assert!(!out.iter().any(|r| r.text == "B"), "完全覆盖行让位");
}

#[test]
fn overlay_pure_insert_uses_negative_id() {
    // 无覆盖原段的纯插入块 → 负 id 占位（不冲突、唯一）
    let out = overlay_segments(&[], &[(0u64, 30_000u64, "X".to_string())]);
    assert_eq!(out.len(), 1);
    assert!(out[0].id < 0, "纯插入块负 id 占位");
}

#[test]
fn overlay_empty_adopted_returns_identical_copy() {
    let segs = vec![row(1, 0, 1_000, "A")];
    assert_eq!(overlay_segments(&segs, &[]), segs);
}
