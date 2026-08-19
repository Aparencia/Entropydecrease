//! 补缝式 AI 判定器单测（REQ-055 / v0.5.0 M8）。
//!
//! @ai-context: AAA 模式；决策矩阵（注入 fake 低置信/unknown/表格）+ 上下文构建。

use super::*;

fn ocr_block(ts: u64, text: &str, score: f32, region_kind: Option<&str>) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.into(),
        score,
        region: "full".into(),
        region_kind: region_kind.map(String::from),
    }
}

fn segment(start: u64, end: u64, text: &str) -> SessionSegment {
    SessionSegment {
        id: 0,
        session_id: 1,
        start_ms: start,
        end_ms: end,
        text: text.into(),
        source: "asr".into(),
        confidence: Some(0.9),
            volume: None,
    }
}

#[test]
fn unknown_region_flagged_as_candidate() {
    // Arrange：unknown 版面区域（高置信但类型未知）
    let blocks = vec![ocr_block(5000, "??", 0.9, Some("unknown"))];
    // Act
    let candidates = judge_candidates(&blocks, &[], &AiJudgeConfig::default());
    // Assert：公式候选（渲染公式最常见）+ 原因
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].request_type, AiRequestType::FormulaLatex);
    assert!(candidates[0].reason.contains("unknown"));
    assert_eq!(candidates[0].local_text.as_deref(), Some("??"));
}

#[test]
fn low_confidence_flagged_as_handwriting() {
    // Arrange：低置信文本（score 0.3 < 0.5）
    let blocks = vec![ocr_block(1000, "模糊文字", 0.3, None)];
    // Act
    let candidates = judge_candidates(&blocks, &[], &AiJudgeConfig::default());
    // Assert：手写候选
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].request_type, AiRequestType::Handwriting);
    assert!(candidates[0].reason.contains("低置信"));
}

#[test]
fn high_confidence_normal_block_not_flagged() {
    // Arrange：高置信常规文本（无任何失败信号）
    let blocks = vec![ocr_block(1000, "正常内容", 0.95, Some("text"))];
    // Act
    let candidates = judge_candidates(&blocks, &[], &AiJudgeConfig::default());
    // Assert：无候选（本地成功不补缝）
    assert!(candidates.is_empty());
}

#[test]
fn low_confidence_table_flagged_as_table() {
    // Arrange：表格区域低置信（重建失败信号）
    let blocks = vec![ocr_block(2000, "|a|", 0.4, Some("table"))];
    // Act
    let candidates = judge_candidates(&blocks, &[], &AiJudgeConfig::default());
    // Assert：表格候选
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].request_type, AiRequestType::Table);
}

#[test]
fn context_built_from_adjacent_segments() {
    // Arrange：段 [0,1000]"前句"、[2000,3000]"后句"；候选时刻 1500
    let segments = vec![segment(0, 1000, "前句"), segment(2000, 3000, "后句")];
    let blocks = vec![ocr_block(1500, "模糊", 0.3, None)];
    // Act
    let candidates = judge_candidates(&blocks, &segments, &AiJudgeConfig::default());
    // Assert：上下文 = 前句 + 后句
    assert_eq!(candidates[0].context.prev_asr.as_deref(), Some("前句"));
    assert_eq!(candidates[0].context.next_asr.as_deref(), Some("后句"));
}

#[test]
fn context_disabled_when_configured() {
    // Arrange：with_context=false
    let segments = vec![segment(0, 1000, "前句")];
    let blocks = vec![ocr_block(1500, "模糊", 0.3, None)];
    let config = AiJudgeConfig { with_context: false, ..Default::default() };
    // Act
    let candidates = judge_candidates(&blocks, &segments, &config);
    // Assert：上下文空（隐私最小化）
    assert_eq!(candidates[0].context.prev_asr, None);
    assert_eq!(candidates[0].context.next_asr, None);
}

#[test]
fn multiple_failure_types_all_flagged() {
    // Arrange：unknown + 低置信 + 表格低置信 + 正常 混合
    let blocks = vec![
        ocr_block(1000, "??", 0.9, Some("unknown")),
        ocr_block(2000, "模糊", 0.3, None),
        ocr_block(3000, "|x|", 0.4, Some("table")),
        ocr_block(4000, "正常", 0.95, Some("text")),
    ];
    // Act
    let candidates = judge_candidates(&blocks, &[], &AiJudgeConfig::default());
    // Assert：3 个候选（正常块排除）
    assert_eq!(candidates.len(), 3);
}

#[test]
fn empty_inputs_safe() {
    // Act/Assert：空输入安全
    assert!(judge_candidates(&[], &[], &AiJudgeConfig::default()).is_empty());
}

#[test]
fn to_request_maps_candidate() {
    // Arrange
    let blocks = vec![ocr_block(5000, "??", 0.9, Some("unknown"))];
    let candidates = judge_candidates(&blocks, &[], &AiJudgeConfig::default());
    // Act
    let req = to_request(&candidates[0]);
    // Assert：类型/源引用映射
    assert_eq!(req.request_type, AiRequestType::FormulaLatex);
    assert_eq!(req.source_ref.crop_image.as_deref(), Some("full/5000.webp"));
}
