//! 笔记过滤 AI 复核单测（REQ-085 / v0.6.0 M1：边界段分类 + 三态判定应用）。
//!
//! @ai-context: AAA 模式；覆盖六类边界段分类、delete/merge/keep 应用、
//!              防御性兜底（不存在的段/无相邻段 → 保守跳过）。
//! @ai-context: 与 note_filter_tests.rs 同属 note_filter 模块测试（第二测试文件，
//!              保持单文件 ≤300 行，AGENTS.md §3）。

use super::*;
use crate::ai_protocol::{TextFilterAction, TextFilterDecision};
use crate::ui_junk::UiJunkList;

/// 构造会话段（与 note_filter_tests.rs 同口径——AI 判定作用于规则保留段）。
fn seg(id: i64, start: u64, end: u64, text: &str, source: &str, conf: Option<f32>) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms: start,
        end_ms: end,
        text: text.to_string(),
        source: source.to_string(),
        confidence: conf,
    }
}

fn asr(id: i64, start: u64, end: u64, text: &str) -> SessionSegment {
    seg(id, start, end, text, "asr", Some(0.9))
}

fn junk() -> UiJunkList {
    UiJunkList::defaults()
}

#[test]
fn boundary_filler_detected() {
    let kept = vec![asr(1, 0, 1000, "嗯 那个 就是")];
    let candidates = boundary_candidates(&kept);
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].kind, BoundaryKind::Filler);
}

#[test]
fn boundary_greeting_and_transition_detected() {
    let kept = vec![asr(1, 0, 1000, "大家好"), asr(2, 1000, 2000, "接下来我们看第三章")];
    let candidates = boundary_candidates(&kept);
    assert_eq!(candidates.len(), 2);
    assert_eq!(candidates[0].kind, BoundaryKind::Greeting);
    assert_eq!(candidates[1].kind, BoundaryKind::Transition);
}

#[test]
fn boundary_truncated_needs_context() {
    // 有上下文（前后段）→ Truncated；孤立段无上下文 → 不判
    let kept = vec![asr(1, 0, 1000, "前面一句"), asr(2, 1000, 2000, "所以这个"), asr(3, 2000, 3000, "后面一句")];
    let candidates = boundary_candidates(&kept);
    // 仅截断段入选（首尾段与相邻段无重叠，不进候选）
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].kind, BoundaryKind::Truncated);
    assert_eq!(candidates[0].segment_id, 2);
    assert!(candidates[0].prev.is_some() && candidates[0].next.is_some());
}

#[test]
fn boundary_broken_detected() {
    let kept = vec![asr(1, 0, 1000, "好的，")];
    let candidates = boundary_candidates(&kept);
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].kind, BoundaryKind::Broken);
}

#[test]
fn boundary_semantic_dup_detected() {
    let kept = vec![
        asr(1, 0, 1000, "卷积神经网络的核心是反向传播"),
        asr(2, 1000, 2000, "反向传播是核心"),
    ];
    let candidates = boundary_candidates(&kept);
    assert!(candidates.iter().any(|c| c.kind == BoundaryKind::SemanticDup && c.segment_id == 2));
}

#[test]
fn boundary_hint_matches_kind() {
    // Act & Assert：类别提示（送 AI 的 hint 字段）与类别一致
    assert_eq!(BoundaryKind::Filler.hint(), "filler");
    assert_eq!(BoundaryKind::Greeting.hint(), "greeting");
    assert_eq!(BoundaryKind::Broken.hint(), "broken");
    assert_eq!(BoundaryKind::Truncated.hint(), "truncated");
    assert_eq!(BoundaryKind::SemanticDup.hint(), "semantic-dup");
    assert_eq!(BoundaryKind::Transition.hint(), "transition");
}

#[test]
fn normal_segments_not_boundary() {
    let kept = vec![asr(1, 0, 1000, "卷积神经网络的梯度下降算法详解")];
    assert!(boundary_candidates(&kept).is_empty());
}

#[test]
fn ai_delete_applied() {
    // Arrange：规则保留 3 段，AI 判删第 2 段
    let segments = vec![asr(1, 0, 1000, "第一句"), asr(2, 1000, 2000, "口头禅废话"), asr(3, 2000, 3000, "第三句")];
    let result = filter_note("测试", &segments, &[], &junk());
    let decisions = vec![TextFilterDecision {
        segment_id: 2,
        action: TextFilterAction::Delete,
        confidence: 0.9,
        reason: "寒暄离题".into(),
        merge_with: None,
    }];
    // Act
    let result = apply_ai_decisions(result, &decisions);
    // Assert：进过滤表 + 统计 + markdown 重建
    assert_eq!(result.kept.len(), 2);
    assert_eq!(result.stats.ai_delete, 1);
    assert_eq!(result.filtered.last().unwrap().reason, FilterReason::AiDelete);
    assert!(!result.markdown.contains("口头禅废话"));
}

#[test]
fn ai_merge_with_prev_joins_text() {
    // Arrange：截断句 merge prev（展示层拼接）
    let segments = vec![asr(1, 0, 1000, "我们看"), asr(2, 1000, 2000, "下一部分"), asr(3, 2000, 3000, "正常句")];
    let result = filter_note("测试", &segments, &[], &junk());
    let decisions = vec![TextFilterDecision {
        segment_id: 2,
        action: TextFilterAction::Merge,
        confidence: 0.85,
        reason: "截断句衔接上一段".into(),
        merge_with: Some("prev".into()),
    }];
    // Act
    let result = apply_ai_decisions(result, &decisions);
    // Assert：文本拼接、段数减一、合并表记录
    assert_eq!(result.kept.len(), 2);
    assert!(result.kept[0].text.contains("我们看下一部分"));
    assert_eq!(result.merged.len(), 1);
    assert!(result.markdown.contains("我们看下一部分"));
}

#[test]
fn ai_merge_with_next_joins_text() {
    let segments = vec![asr(1, 0, 1000, "这个公式"), asr(2, 1000, 2000, "很重要"), asr(3, 2000, 3000, "正常句")];
    let result = filter_note("测试", &segments, &[], &junk());
    let decisions = vec![TextFilterDecision {
        segment_id: 1,
        action: TextFilterAction::Merge,
        confidence: 0.8,
        reason: "截断句衔接下一段".into(),
        merge_with: Some("next".into()),
    }];
    let result = apply_ai_decisions(result, &decisions);
    assert!(result.kept[0].text.contains("这个公式很重要"));
    assert_eq!(result.kept.len(), 2);
}

#[test]
fn ai_decisions_defensive_fallbacks() {
    // Arrange：判定引用不存在的段 / merge 无相邻段（首段 merge prev）→ 保守跳过
    let segments = vec![asr(1, 0, 1000, "第一句"), asr(2, 1000, 2000, "第二句")];
    let result = filter_note("测试", &segments, &[], &junk());
    let decisions = vec![
        TextFilterDecision {
            segment_id: 999,
            action: TextFilterAction::Delete,
            confidence: 0.9,
            reason: "不存在".into(),
            merge_with: None,
        },
        TextFilterDecision {
            segment_id: 1,
            action: TextFilterAction::Merge,
            confidence: 0.9,
            reason: "无前段".into(),
            merge_with: Some("prev".into()),
        },
    ];
    // Act
    let result = apply_ai_decisions(result, &decisions);
    // Assert：两判定均保守跳过（段数不变、无删除统计）
    assert_eq!(result.kept.len(), 2);
    assert_eq!(result.stats.ai_delete, 0);
    assert!(result.merged.is_empty());
}

#[test]
fn ai_keep_leaves_unchanged() {
    let segments = vec![asr(1, 0, 1000, "第一句"), asr(2, 1000, 2000, "第二句")];
    let result = filter_note("测试", &segments, &[], &junk());
    let decisions = vec![TextFilterDecision {
        segment_id: 1,
        action: TextFilterAction::Keep,
        confidence: 0.5,
        reason: "保守保留".into(),
        merge_with: None,
    }];
    let result = apply_ai_decisions(result, &decisions);
    assert_eq!(result.kept.len(), 2);
    assert_eq!(result.stats.ai_delete, 0);
}

#[test]
fn ai_merge_with_deleted_target_recovers_segment() {
    // Arrange：审查回归——前序判定已删除 merge 目标段，后续 merge 判定
    // 不得把文本错拼到无关段（旧实现 unwrap_or(0) 损坏数据）
    let segments = vec![asr(1, 0, 1000, "第一句"), asr(2, 1000, 2000, "第二句"), asr(3, 2000, 3000, "第三句")];
    let result = filter_note("测试", &segments, &[], &junk());
    let decisions = vec![
        // 先删 target（段 1）……
        TextFilterDecision {
            segment_id: 1,
            action: TextFilterAction::Delete,
            confidence: 0.9,
            reason: "寒暄".into(),
            merge_with: None,
        },
        // ……段 3 merge prev 指向已不存在的段 2 的前邻？不——段 3 merge prev =
        // 段 2，段 2 仍在。构造真正丢失场景：段 2 merge prev（段 1 已被删）
        TextFilterDecision {
            segment_id: 2,
            action: TextFilterAction::Merge,
            confidence: 0.8,
            reason: "截断".into(),
            merge_with: Some("prev".into()),
        },
    ];
    // Act
    let result = apply_ai_decisions(result, &decisions);
    // Assert：段 2 的 merge 目标（段 1）已被删 → 保守恢复（不删不并）；
    // kept 保留 2 段且文本不被拼错
    assert_eq!(result.kept.len(), 2);
    assert!(result.kept.iter().any(|s| s.text == "第二句"), "段 2 应原样保留");
    assert!(result.kept.iter().any(|s| s.text == "第三句"));
    assert!(!result.kept.iter().any(|s| s.text.contains("第二句第三句")), "不得错拼到无关段");
    assert!(result.merged.is_empty(), "目标丢失时不得登记合并");
    assert_eq!(result.stats.ai_delete, 1, "仅段 1 删除生效");
}
