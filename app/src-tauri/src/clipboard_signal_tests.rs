//! clipboard_signal 单元测试（AAA 模式；纯逻辑，无剪贴板/IO 依赖）。
//!
//! @ai-context: 覆盖隐私红线（预览截断/上限）、队列上限、会话过滤、
//!              变化检测哈希（REQ-132 图片去重哈希）与 RGBA→BGRA 转换。

use super::*;

/// 构造长文本（>PREVIEW_MAX_CHARS 字符，含 CJK——按 char 截断不得拆字节）。
fn long_text() -> String {
    "这是很长的一段课堂复制内容，包含专业术语甲与术语乙还有更多后续字符，用于验证预览截断逻辑".to_string()
}

#[test]
fn preview_truncates_to_30_chars_by_char_boundary() {
    // Arrange
    let text = long_text();
    // Act
    let p = preview(&text);
    // Assert
    assert_eq!(p.chars().count(), PREVIEW_MAX_CHARS);
    assert!(text.starts_with(&p), "预览必须是原文前缀（不插入不篡改）");
}

#[test]
fn preview_short_text_unchanged() {
    // Arrange
    let text = "术语甲";
    // Act
    let p = preview(text);
    // Assert
    assert_eq!(p, text);
}

#[test]
fn record_copy_stores_preview_not_full_text() {
    // Arrange（隐私红线：完整内容不得进入存储）
    let store = ClipboardSignalStore::new();
    let text = long_text();
    // Act
    store.record_copy(1, &text, 100);
    // Assert
    let signals = store.recent_signals.lock().unwrap();
    assert_eq!(signals.len(), 1);
    assert_ne!(signals[0].text_preview, text, "不得存完整原文");
    assert_eq!(signals[0].text_preview.chars().count(), PREVIEW_MAX_CHARS);
    assert_eq!(signals[0].session_id, 1);
    assert_eq!(signals[0].timestamp_ms, 100);
}

#[test]
fn record_copy_ignores_empty_and_whitespace() {
    // Arrange
    let store = ClipboardSignalStore::new();
    // Act
    store.record_copy(1, "", 1);
    store.record_copy(1, "   \t ", 2);
    // Assert
    assert!(store.recent_signals.lock().unwrap().is_empty());
}

#[test]
fn record_copy_caps_at_max_signals_dropping_oldest() {
    // Arrange
    let store = ClipboardSignalStore::new();
    // Act：入队 MAX_SIGNALS + 10 条（超出丢弃最旧）
    for i in 0..(MAX_SIGNALS + 10) {
        store.record_copy(1, &format!("信号-{}", i), i as u64);
    }
    // Assert
    let signals = store.recent_signals.lock().unwrap();
    assert_eq!(signals.len(), MAX_SIGNALS);
    assert_eq!(signals[0].text_preview, "信号-10", "最旧 10 条被丢弃");
    assert_eq!(signals[MAX_SIGNALS - 1].text_preview, format!("信号-{}", MAX_SIGNALS + 9));
}

#[test]
fn signal_texts_filters_by_session_preserving_order() {
    // Arrange：两个会话交错入队
    let store = ClipboardSignalStore::new();
    store.record_copy(1, "甲", 1);
    store.record_copy(2, "乙", 2);
    store.record_copy(1, "丙", 3);
    store.record_copy(2, "丁", 4);
    // Act
    let s1 = store.signal_texts(1);
    let s2 = store.signal_texts(2);
    // Assert
    assert_eq!(s1, vec!["甲".to_string(), "丙".to_string()]);
    assert_eq!(s2, vec!["乙".to_string(), "丁".to_string()]);
    assert!(store.signal_texts(99).is_empty());
}

#[test]
fn all_signal_texts_merges_sessions() {
    // Arrange
    let store = ClipboardSignalStore::new();
    store.record_copy(1, "甲", 1);
    store.record_copy(2, "乙", 2);
    // Act
    let all = store.all_signal_texts();
    // Assert
    assert_eq!(all, vec!["甲".to_string(), "乙".to_string()]);
}

#[test]
fn clear_empties_all_signals() {
    // Arrange
    let store = ClipboardSignalStore::new();
    store.record_copy(1, "甲", 1);
    // Act
    store.clear();
    // Assert
    assert!(store.all_signal_texts().is_empty());
}

#[test]
fn content_hash_is_deterministic_and_distinguishes_bytes() {
    // Arrange（REQ-132 图片去重哈希：同图同哈希、异图异哈希）
    let img_a = vec![7u8; 4096]; // 64x64 全灰
    let mut img_b = vec![7u8; 4096];
    img_b[100] = 200; // 单像素差异
    // Act
    let ha1 = content_hash(&img_a);
    let ha2 = content_hash(&img_a);
    let hb = content_hash(&img_b);
    // Assert
    assert_eq!(ha1, ha2, "同图哈希必须一致（去重判据）");
    assert_ne!(ha1, hb, "异图哈希必须不同（变化检测判据）");
}

#[test]
fn content_hash_empty_and_nonempty_differ() {
    assert_ne!(content_hash(&[]), content_hash(&[1]));
    assert_eq!(content_hash(&[]), content_hash(&[]));
}

#[test]
fn rgba_to_bgra_swaps_red_and_blue() {
    // Arrange：RGBA 红像素 → BGRA 应为蓝像素
    let rgba = [255u8, 0, 0, 255, 0, 255, 0, 255];
    // Act
    let bgra = rgba_to_bgra(&rgba, 2, 1).unwrap();
    // Assert
    assert_eq!(bgra, vec![0, 0, 255, 255, 0, 255, 0, 255]);
}

#[test]
fn rgba_to_bgra_rejects_bad_length_and_zero_dims() {
    // Arrange
    let rgba = [1u8, 2, 3, 4];
    // Assert：长度不匹配（2x2 需 16 字节）、零尺寸 → None
    assert!(rgba_to_bgra(&rgba, 2, 2).is_none());
    assert!(rgba_to_bgra(&rgba, 0, 1).is_none());
    assert!(rgba_to_bgra(&rgba, 1, 0).is_none());
    // 1x1 合法
    assert_eq!(rgba_to_bgra(&rgba, 1, 1).unwrap(), vec![3, 2, 1, 4]);
}
