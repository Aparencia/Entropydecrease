//! 字幕去重/滚动检测单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 subtitle_ocr.rs 以 #[cfg(test)] #[path] 引入。

use crate::subtitle_ocr::{is_scrolling, SubtitleTracker};

const DEDUPE_MS: u64 = 3000;

#[test]
fn same_text_is_deduped_regardless_of_window() {
    // Arrange
    let mut tracker = SubtitleTracker::new();
    tracker.process("第一句字幕", 0, DEDUPE_MS);
    // Act：同文本持续显示（10s 后仍相同）→ 仍跳过（OCR 帧级重复）
    let repeat = tracker.process("第一句字幕", 10_000, DEDUPE_MS);
    // Assert
    assert_eq!(repeat, None);
}

#[test]
fn new_text_is_emitted() {
    // Arrange
    let mut tracker = SubtitleTracker::new();
    // Act
    let first = tracker.process("第一句话", 0, DEDUPE_MS);
    let second = tracker.process("另一个要点", 2000, DEDUPE_MS);
    // Assert：不同文本直接通过（编辑距离 >1 不被微变化合并吞掉）
    assert_eq!(first.as_deref(), Some("第一句话"));
    assert_eq!(second.as_deref(), Some("另一个要点"));
}

#[test]
fn minor_edit_within_window_is_merged() {
    // Arrange：编辑距离 1 的微抖动（"熵减" vs "熵减。"）
    let mut tracker = SubtitleTracker::new();
    tracker.process("熵减", 0, DEDUPE_MS);
    // Act：窗内微变化 → 合并跳过
    let jitter = tracker.process("熵减。", 500, DEDUPE_MS);
    // Assert
    assert_eq!(jitter, None);
}

#[test]
fn minor_edit_outside_window_is_emitted() {
    // Arrange
    let mut tracker = SubtitleTracker::new();
    tracker.process("熵减", 0, DEDUPE_MS);
    // Act：窗外微变化 → 视为新字幕
    let late = tracker.process("熵减。", 10_000, DEDUPE_MS);
    // Assert
    assert_eq!(late.as_deref(), Some("熵减。"));
}

#[test]
fn empty_text_is_ignored_without_state_change() {
    // Arrange
    let mut tracker = SubtitleTracker::new();
    // Act：空文本不更新状态
    let none = tracker.process("  ", 0, DEDUPE_MS);
    let first = tracker.process("真实字幕", 100, DEDUPE_MS);
    // Assert
    assert_eq!(none, None);
    assert_eq!(first.as_deref(), Some("真实字幕"));
}

#[test]
fn trim_normalizes_ocr_noise() {
    // Arrange：首尾空白不应影响去重
    let mut tracker = SubtitleTracker::new();
    tracker.process("字幕", 0, DEDUPE_MS);
    // Act
    let padded = tracker.process("  字幕  ", 500, DEDUPE_MS);
    // Assert：trim 后相同 → 跳过
    assert_eq!(padded, None);
}

#[test]
fn reset_clears_state() {
    // Arrange
    let mut tracker = SubtitleTracker::new();
    tracker.process("字幕", 0, DEDUPE_MS);
    // Act
    tracker.reset();
    let after = tracker.process("字幕", 100, DEDUPE_MS);
    // Assert：重置后同文本重新输出
    assert_eq!(after.as_deref(), Some("字幕"));
}

#[test]
fn scrolling_subtitle_is_detected() {
    // Arrange：滚动字幕每帧不同但高重合
    let prev = "上证指数上涨1.5%";
    let curr = "证指数上涨1.5%，成交";
    // Act
    let scrolling = is_scrolling(curr, prev, 0.6);
    // Assert
    assert!(scrolling);
}

#[test]
fn distinct_content_is_not_scrolling() {
    // Arrange：完全不相关两帧
    let prev = "今天讲牛顿定律";
    let curr = "这个公式很重要";
    // Act
    let scrolling = is_scrolling(curr, prev, 0.6);
    // Assert
    assert!(!scrolling);
}

#[test]
fn identical_text_is_not_scrolling() {
    // Act & Assert：同文本不属于滚动（由去重处理）
    assert!(!is_scrolling("字幕", "字幕", 0.6));
}

#[test]
fn empty_input_is_not_scrolling() {
    // Act & Assert
    assert!(!is_scrolling("", "内容", 0.6));
    assert!(!is_scrolling("内容", "", 0.6));
}
