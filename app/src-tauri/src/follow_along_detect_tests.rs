//! 跟练档案步骤边界检测单测（REQ-123 / v0.7.0 M2）。
//!
//! @ai-context: AAA 模式；合成段样本（口令出现/长静音/交替短语）→ 边界标记正确；
//!              覆盖三信号各自触发、近邻合并去重、空输入兜底。

use super::*;
use crate::types::{SessionOcrBlock, SessionSegment};

/// 构造合成段辅助（id 顺序编号，source=asr）。
fn seg(id: i64, text: &str, start_ms: u64, end_ms: u64) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms,
        end_ms,
        text: text.into(),
        source: "asr".into(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }
}

/// 构造合成 OCR 块辅助（region=full——画面静止判定用）。
fn ocr(ts: u64, text: &str) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.into(),
        score: 0.9,
        region: "full".into(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }
}

#[test]
fn cue_phrase_marks_step_boundary() {
    // Arrange：口令段（"第二组"）在 10s 处
    let segments = vec![
        seg(1, "第一组动作开始", 0, 3000),
        seg(2, "第二组跟上节奏", 10000, 13000),
    ];
    // Act
    let boundaries = detect_step_boundaries(&segments, &[]);
    // Assert：两个口令边界（标签=口令原文；理由=cue）
    assert_eq!(boundaries.len(), 2);
    assert_eq!(boundaries[0].reason, "cue");
    assert_eq!(boundaries[0].label.as_deref(), Some("第一组"));
    assert_eq!(boundaries[1].time_ms, 10000);
    assert_eq!(boundaries[1].label.as_deref(), Some("第二组"));
}

#[test]
fn practice_point_marks_boundary_on_silence_and_still() {
    // Arrange：长静音（两段 gap 各 4s，累计 8s ≥ 6s 阈值）× 画面静止（OCR 单一文本）
    let segments = vec![
        seg(1, "讲解动作要领", 0, 1000),
        seg(2, "保持这个姿势", 5000, 6000),
        seg(3, "继续下一个", 10000, 11000),
    ];
    let ocr_blocks = vec![ocr(100, "瑜伽垫"), ocr(5500, "瑜伽垫"), ocr(10500, "瑜伽垫")];
    // Act
    let boundaries = detect_step_boundaries(&segments, &ocr_blocks);
    // Assert：练习段边界（理由=practice，标签=练习）
    let practice: Vec<&StepBoundary> = boundaries.iter().filter(|b| b.reason == "practice").collect();
    assert!(!practice.is_empty(), "长静音×静止应产出练习段边界");
    assert_eq!(practice[0].label.as_deref(), Some("练习"));
}

#[test]
fn demo_practice_alternation_marks_phases() {
    // Arrange：示范口令 → 跟练口令交替
    let segments = vec![
        seg(1, "大家跟我做这个动作", 0, 3000),
        seg(2, "到你了，自己做一遍", 8000, 11000),
    ];
    // Act
    let boundaries = detect_step_boundaries(&segments, &[]);
    // Assert：交替段落标记（demo → practice-cue）
    assert_eq!(boundaries[0].reason, "demo");
    assert!(boundaries[0].label.as_deref().unwrap_or_default().contains("示范"));
    assert_eq!(boundaries[1].reason, "practice-cue");
    assert!(boundaries[1].label.as_deref().unwrap_or_default().contains("跟练"));
}

#[test]
fn multi_signal_same_time_keeps_highest_priority_label() {
    // Arrange：同一段同时命中口令与示范口令（"第二组，跟我做"）
    let segments = vec![seg(1, "第二组，跟我做一遍", 10000, 13000)];
    // Act：口令(3) > 示范(2)——同刻合并只留口令
    let boundaries = detect_step_boundaries(&segments, &[]);
    // Assert：单边界（同刻去重），理由=cue
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].reason, "cue");
    assert_eq!(boundaries[0].label.as_deref(), Some("第二组"));
}

#[test]
fn nearby_boundaries_merge_within_window() {
    // Arrange：口令+交替口令同刻（10s）→ 合并保留口令；14.5s 口令差 4.5s（>3s 窗）→ 独立
    let segments = vec![
        seg(1, "第二组，跟我做", 10000, 13000),
        seg(2, "第三组", 14500, 16000),
    ];
    // Act
    let boundaries = detect_step_boundaries(&segments, &[]);
    // Assert：两条边界——10s 处 cue 合并 demo（同刻去重），14.5s 独立保留
    assert_eq!(boundaries.len(), 2, "同刻合并 + 跨窗独立");
    assert_eq!(boundaries[0].time_ms, 10000);
    assert_eq!(boundaries[0].reason, "cue", "口令优先级高于示范口令");
    assert_eq!(boundaries[1].time_ms, 14500);
    assert_eq!(boundaries[1].reason, "cue");
    // 时间升序
    let times: Vec<u64> = boundaries.iter().map(|b| b.time_ms).collect();
    let mut sorted = times.clone();
    sorted.sort_unstable();
    assert_eq!(times, sorted, "边界必须按时间升序");
}

#[test]
fn empty_input_returns_empty() {
    // Arrange/Act/Assert：无段/无 OCR → 空边界（不崩溃）
    assert!(detect_step_boundaries(&[], &[]).is_empty());
}

#[test]
fn config_json_calibration_merges_phrases() {
    // Arrange：校准 JSON 追加自定义口令
    let json = r#"{"cuePhrases":["自定义口令"],"mergeWindowMs":2000}"#;
    // Act
    let config = FollowAlongConfig::from_json(json).expect("解析成功");
    // Assert：内置默认 + 自定义合并；窗口覆盖
    assert!(config.cue_phrases.iter().any(|p| p == "第一组"), "内置默认保留");
    assert!(config.cue_phrases.iter().any(|p| p == "自定义口令"), "自定义追加");
    assert_eq!(config.merge_window_ms, 2000);
    // 损坏 JSON → Err（调用方回退默认）
    assert!(FollowAlongConfig::from_json("{broken").is_err());
}

#[test]
fn config_load_missing_file_falls_back_to_defaults() {
    // Arrange/Act：缺失文件
    let dir = tempfile::tempdir().unwrap();
    let config = FollowAlongConfig::load(&dir.path().join("none.json"));
    // Assert：内置默认（不阻断）
    assert!(!config.cue_phrases.is_empty());
    assert!(!config.demo_phrases.is_empty());
    assert!(!config.practice_phrases.is_empty());
}
