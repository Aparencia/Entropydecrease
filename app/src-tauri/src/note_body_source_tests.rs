//! 正文源检测单测（v0.12.0 M1，ADR-021）。
//!
//! @ai-context: AAA 模式；黄金用例 5 场景——转写优先/图文 OCR/字幕不入正文/
//!              空文本排除/双空标题仅。

use super::*;
use crate::types::{SessionOcrBlock, SessionSegment};

fn seg(id: i64, text: &str) -> SessionSegment {
    SessionSegment {
        id,
        session_id: 1,
        start_ms: 0,
        end_ms: 1000,
        text: text.to_string(),
        source: "asr".to_string(),
        confidence: Some(0.9),
        volume: None,
        speech_rate: None,
        pause_ms: None,
        speaker: None,
    }
}

fn block(ts: u64, region: &str, text: &str) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score: 0.9,
        region: region.to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }
}

/// 场景 1：有非空转写段 → Transcript（即使存在 full OCR 块——视频会话特征）。
#[test]
fn non_empty_segments_win_over_ocr() {
    // Arrange：转写段 + 图文 OCR 块并存（fused 会话可能两者都有）
    let segments = vec![seg(1, "今天讲第三章")];
    let blocks = vec![block(100, "full", "网页标题")];
    // Act & Assert
    assert_eq!(detect_body_source(&segments, &blocks), BodySource::Transcript);
}

/// 场景 2：空转写 + full OCR 块 → OcrDirect（图文会话，photo_capture 链路特征）。
#[test]
fn empty_segments_with_full_ocr_is_ocr_direct() {
    // Arrange：无转写段 + region=full 块
    let blocks = vec![block(1000, "full", "网页标题")];
    // Act & Assert
    assert_eq!(detect_body_source(&[], &blocks), BodySource::OcrDirect);
}

/// 场景 3：空转写 + 仅 subtitle OCR → Empty（字幕是辅助块，不作正文）。
#[test]
fn subtitle_blocks_are_not_body() {
    // Arrange：region=subtitle（视频字幕链路块特征）
    let blocks = vec![block(1000, "subtitle", "屏幕上显示的字幕")];
    // Act & Assert
    assert_eq!(detect_body_source(&[], &blocks), BodySource::Empty);
}

/// 场景 4：空转写 + full 块但文本全空白 → Empty（空文本不算正文）。
#[test]
fn blank_text_blocks_are_ignored() {
    // Arrange：region=full 但文本为空白
    let blocks = vec![block(1000, "full", "   ")];
    // Act & Assert
    assert_eq!(detect_body_source(&[], &blocks), BodySource::Empty);
}

/// 场景 5：空转写 + 空 OCR → Empty（标题仅，不 panic）。
#[test]
fn both_empty_is_title_only() {
    // Act & Assert
    assert_eq!(detect_body_source(&[], &[]), BodySource::Empty);
}

/// 场景 6：转写段全部空白 → 按空处理（回落 OCR/Empty 判定）。
#[test]
fn blank_segments_fall_through() {
    // Arrange：全空白转写段 + full OCR 块
    let segments = vec![seg(1, "  "), seg(2, "")];
    let blocks = vec![block(1000, "full", "正文要点")];
    // Act & Assert：空白段不构成正文，OCR 生效
    assert_eq!(detect_body_source(&segments, &blocks), BodySource::OcrDirect);
}
