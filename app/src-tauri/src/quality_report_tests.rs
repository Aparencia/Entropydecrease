//! 会话质量报告单测（REQ-076 / v0.6.0 M6）。
//!
//! @ai-context: AAA 模式；合成会话数据覆盖低置信列表/OCR 低分/unknown 区/
//!              AI 候选数聚合。

use super::*;

fn seg(id: i64, start: u64, text: &str, conf: Option<f32>) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms: start,
        end_ms: start + 3_000,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: conf,
    }
}

fn block(ts: u64, text: &str, score: f32, kind: Option<&str>) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score,
        region: "full".to_string(),
        region_kind: kind.map(|k| k.to_string()),
    }
}

#[test]
fn aggregates_confidence_and_failures() {
    // Arrange：低置信段 ×2 + 正常段；低分 OCR + unknown 区 + 正常块
    let segments = vec![
        seg(1, 0, "听不清的内容", Some(0.4)),
        seg(2, 5_000, "清晰内容", Some(0.9)),
        seg(3, 10_000, "另一段模糊", Some(0.5)),
    ];
    let ocr_blocks = vec![
        block(1_000, "噪声", 0.2, None),
        block(2_000, "正文", 0.9, None),
        block(3_000, "不可识别区域", 0.6, Some("unknown")),
    ];
    // Act
    let report = build_quality_report(&segments, &ocr_blocks);
    // Assert
    assert_eq!(report.total_segments, 3);
    assert_eq!(report.low_confidence_count, 2);
    assert_eq!(report.low_confidence_segments[0].segment_id, 1);
    assert!(report.low_confidence_segments.iter().all(|i| i.confidence < 0.6));
    assert_eq!(report.low_score_ocr_count, 1);
    assert_eq!(report.unknown_region_count, 1);
    assert_eq!(report.total_ocr_blocks, 3);
}

#[test]
fn none_confidence_not_counted() {
    // Arrange：旧数据（None 置信度）不计数（无证据不指控）
    let segments = vec![seg(1, 0, "字幕段", None)];
    // Act
    let report = build_quality_report(&segments, &[]);
    // Assert
    assert_eq!(report.low_confidence_count, 0);
    assert!(report.low_confidence_segments.is_empty());
}

#[test]
fn ai_candidate_count_from_boundary_segments() {
    // Arrange：口头禅边界段（规则层判不了 → AI 复核候选）+ 正常讲解段
    let segments = vec![
        seg(1, 0, "嗯 那个 就是", Some(0.9)),
        seg(2, 5_000, "卷积神经网络的梯度下降算法详解", Some(0.9)),
    ];
    // Act
    let report = build_quality_report(&segments, &[]);
    // Assert：1 个边界候选（口头禅段；正常段无边界特征）
    assert_eq!(report.ai_candidate_count, 1);
}

#[test]
fn low_confidence_sorted_by_time() {
    // Arrange：乱序低置信段
    let segments = vec![
        seg(1, 20_000, "后段", Some(0.3)),
        seg(2, 0, "前段", Some(0.3)),
    ];
    // Act
    let report = build_quality_report(&segments, &[]);
    // Assert：按时间排序
    assert_eq!(report.low_confidence_segments[0].start_ms, 0);
    assert_eq!(report.low_confidence_segments[1].start_ms, 20_000);
}

#[test]
fn empty_inputs_safe() {
    let report = build_quality_report(&[], &[]);
    assert_eq!(report.total_segments, 0);
    assert_eq!(report.low_confidence_count, 0);
    assert_eq!(report.ai_candidate_count, 0);
}
