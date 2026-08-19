//! 练习段识别单测（REQ-070 / v0.6.0 M4）。
//!
//! @ai-context: AAA 模式；合成静音+静止样本（练习点命中）、误判保护
//!              （仅静音/仅静止/视频卡顿不判）、空输入安全。

use super::*;

fn seg(id: i64, start: u64, end: u64, text: &str) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms: start,
        end_ms: end,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: Some(0.9),
            volume: None,
            speech_rate: None,
            pause_ms: None,
            speaker: None,
    }
}

fn block(ts: u64, text: &str) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score: 0.9,
        region: "full".to_string(),
        region_kind: None,
    }
}

#[test]
fn silence_plus_still_screen_detects_practice() {
    // Arrange：窗0 讲解（画面变化）→ 窗1 练习（7s 静音 + 画面静止单页）
    let segments = vec![
        seg(1, 0, 5_000, "第一步操作讲解"),
        seg(2, 25_000, 30_000, "讲解结束"), // 窗0（gap 20s 但画面变化）
        seg(3, 40_000, 45_000, "现在大家自己练习一下"), // 窗1
        seg(4, 52_000, 57_000, "练习结束继续讲解"), // 窗1（gap 7s）
    ];
    let ocr_blocks = vec![
        block(1_000, "步骤一"),
        block(6_000, "步骤二"), // 窗0 画面变化（2 种文本）→ 非静止
        block(41_000, "练习页标题"), // 窗1 单一文本（静止）
    ];
    // Act
    let points = detect_practice_points(&segments, &ocr_blocks, &PracticeDetectConfig::default());
    // Assert：仅窗1 练习点（窗内首段时刻 40s；静音 7s）
    assert_eq!(points.len(), 1);
    assert_eq!(points[0].start_ms, 40_000);
    assert_eq!(points[0].end_ms, 57_000);
    assert_eq!(points[0].silence_secs, 7);
}

#[test]
fn silence_without_still_screen_not_detected() {
    // Arrange：静音但画面在变（翻页/视频播放）——不是练习（老师在看别的）
    let segments = vec![
        seg(1, 0, 5_000, "讲解"),
        seg(2, 15_000, 20_000, "稍等一下"), // 10s gap
    ];
    let ocr_blocks = vec![block(1_000, "第一页"), block(16_000, "第二页"), block(19_000, "第三页")];
    // Act
    let points = detect_practice_points(&segments, &ocr_blocks, &PracticeDetectConfig::default());
    // Assert：画面持续变化 → 不判练习点
    assert!(points.is_empty());
}

#[test]
fn still_screen_without_silence_not_detected() {
    // Arrange：画面静止但老师持续讲（无长静音）——不是练习
    let segments = vec![
        seg(1, 0, 5_000, "第一句"),
        seg(2, 5_500, 10_000, "第二句"), // gap 500ms < 3s
        seg(3, 10_500, 15_000, "第三句"),
    ];
    let ocr_blocks = vec![block(1_000, "固定板书")];
    // Act
    let points = detect_practice_points(&segments, &ocr_blocks, &PracticeDetectConfig::default());
    // Assert
    assert!(points.is_empty());
}

#[test]
fn video_stutter_not_detected() {
    // Arrange：视频卡顿模拟——短静音（4s < min_silence 6s）+ 画面静止 → 不判
    let segments = vec![seg(1, 0, 5_000, "讲解"), seg(2, 9_000, 14_000, "继续")];
    let ocr_blocks = vec![block(1_000, "标题页")];
    // Act
    let points = detect_practice_points(&segments, &ocr_blocks, &PracticeDetectConfig::default());
    // Assert：短静音不足 → 不判（卡顿阈值校准）
    assert!(points.is_empty(), "短静音卡顿不得判练习点");
}

#[test]
fn empty_inputs_safe() {
    // Act & Assert
    assert!(detect_practice_points(&[], &[], &PracticeDetectConfig::default()).is_empty());
    assert!(detect_practice_points(&[seg(1, 0, 1000, "x")], &[], &PracticeDetectConfig::default()).is_empty());
}

#[test]
fn subtitle_region_blocks_ignored() {
    // Arrange：字幕区 OCR 块不参与画面静止判定（字幕文本会"变化"——只有全帧块算画面）
    let segments = vec![
        seg(1, 0, 5_000, "讲解"),
        seg(2, 15_000, 20_000, "练习时间"), // gap 10s
    ];
    let ocr_blocks = vec![SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: 1_000,
        text: "字幕内容".into(),
        score: 0.9,
        region: "subtitle".into(),
        region_kind: None,
    }];
    // Act：仅字幕块 → 画面静止判定无全帧基准 → 首窗不判（不误报）
    let points = detect_practice_points(&segments, &ocr_blocks, &PracticeDetectConfig::default());
    assert!(points.is_empty());
}
