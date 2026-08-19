//! 会话质量报告单测（REQ-076 / v0.6.0 M6；v0.7.0 M1 REQ-100 引擎计数接入）。
//!
//! @ai-context: AAA 模式；合成会话数据覆盖低置信列表/OCR 低分双源/unknown 区/
//!              AI 候选数/引擎计数转发聚合。纯函数（build_quality_report_from_counts）
//!              直接测；engine 接入（build_quality_report_with_engine）用
//!              EnginePool::dummy()（计数恒 0）验证转发路径。

use super::*;
use crate::engine::EnginePool;

fn seg(id: i64, start: u64, text: &str, conf: Option<f32>) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms: start,
        end_ms: start + 3_000,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: conf,
            volume: None,
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
    // Arrange：低置信段 ×2 + 正常段；低分 OCR + unknown 区 + 正常块（引擎计数 0）
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
    let report = build_quality_report_from_counts(&segments, &ocr_blocks, 0, 0, 0);
    // Assert
    assert_eq!(report.total_segments, 3);
    assert_eq!(report.low_confidence_count, 2);
    assert_eq!(report.low_confidence_segments[0].segment_id, 1);
    assert!(report.low_confidence_segments.iter().all(|i| i.confidence < 0.6));
    assert_eq!(report.low_score_ocr_count, 1);
    assert_eq!(report.unknown_region_count, 1);
    assert_eq!(report.total_ocr_blocks, 3);
    // 引擎计数全 0（无引擎诊断数据 → 仅落库源）
    assert_eq!(report.engine_ocr_failures, 0);
    assert_eq!(report.asr_failures, 0);
    assert_eq!(report.rescore_timeouts, 0);
}

#[test]
fn none_confidence_not_counted() {
    // Arrange：旧数据（None 置信度）不计数（无证据不指控）
    let segments = vec![seg(1, 0, "字幕段", None)];
    // Act
    let report = build_quality_report_from_counts(&segments, &[], 0, 0, 0);
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
    let report = build_quality_report_from_counts(&segments, &[], 0, 0, 0);
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
    let report = build_quality_report_from_counts(&segments, &[], 0, 0, 0);
    // Assert：按时间排序
    assert_eq!(report.low_confidence_segments[0].start_ms, 0);
    assert_eq!(report.low_confidence_segments[1].start_ms, 20_000);
}

#[test]
fn empty_inputs_safe() {
    let report = build_quality_report_from_counts(&[], &[], 0, 0, 0);
    assert_eq!(report.total_segments, 0);
    assert_eq!(report.low_confidence_count, 0);
    assert_eq!(report.ai_candidate_count, 0);
}

#[test]
fn engine_counts_wired_into_report() {
    // Arrange：引擎诊断计数非零（REQ-100：指标从恒 0 变真实）
    let segments = vec![seg(1, 0, "清晰内容", Some(0.9))];
    let ocr_blocks = vec![block(1_000, "正文", 0.9, None)];
    // Act：asr 失败 5 / ocr 失败 3 / 重打分超时 2
    let report = build_quality_report_from_counts(&segments, &ocr_blocks, 5, 3, 2);
    // Assert：计数原样进入报告
    assert_eq!(report.asr_failures, 5);
    assert_eq!(report.engine_ocr_failures, 3);
    assert_eq!(report.rescore_timeouts, 2);
}

#[test]
fn low_score_ocr_count_dual_source_additive() {
    // Arrange：1 个落库低分块 + engine 运行期 OCR 失败 4（识别失败未落库）
    let ocr_blocks = vec![
        block(1_000, "噪声", 0.2, None),
        block(2_000, "正文", 0.9, None),
    ];
    // Act
    let report = build_quality_report_from_counts(&[], &ocr_blocks, 0, 4, 0);
    // Assert：双源相加（落库 1 + 运行期 4 = 5）——两源含义不同，相加不重复
    assert_eq!(report.low_score_ocr_count, 5);
}

#[test]
fn with_engine_forwards_dummy_zero_counts() {
    // Arrange：空引擎池（dummy 计数恒 0）+ 1 个落库低分块
    let engine = EnginePool::dummy();
    let ocr_blocks = vec![block(1_000, "噪声", 0.2, None)];
    // Act：engine 接入版（转发路径）
    let report = build_quality_report_with_engine(&[], &ocr_blocks, &engine);
    // Assert：转发生效——引擎字段为 dummy 快照（0），落库源独立计数
    assert_eq!(report.engine_ocr_failures, 0);
    assert_eq!(report.asr_failures, 0);
    assert_eq!(report.rescore_timeouts, 0);
    assert_eq!(report.low_score_ocr_count, 1);
}
