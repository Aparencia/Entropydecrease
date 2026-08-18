//! 章节检测单测（REQ-044 / v0.5.0 M2）。
//!
//! @ai-context: AAA 模式；合成会话样本（窗口序列）覆盖三信号投票决策矩阵。

use super::*;

/// 构造信号窗口辅助。
fn sig(time_ms: u64, frame: bool, silence: bool, text: &str) -> ChapterSignal {
    ChapterSignal {
        time_ms,
        frame_switched: frame,
        long_silence: silence,
        text: text.to_string(),
    }
}

#[test]
fn no_signal_no_boundary() {
    // Arrange：无任何信号
    let signals = vec![
        sig(0, false, false, "第一节课内容"),
        sig(10000, false, false, "第二节课内容"),
    ];
    // Act
    let boundaries = detect_chapters(&signals, DEFAULT_MIN_VOTES);
    // Assert：无边界
    assert!(boundaries.is_empty());
}

#[test]
fn single_signal_below_min_votes_ignored() {
    // Arrange：仅画面切换（1 信号 < 默认 2）；文本完全相同（topic 不切换）
    let signals = vec![
        sig(0, false, false, "内容甲讲解"),
        sig(10000, true, false, "内容甲讲解"),
    ];
    // Act
    let boundaries = detect_chapters(&signals, DEFAULT_MIN_VOTES);
    // Assert：不判定边界
    assert!(boundaries.is_empty());
}

#[test]
fn frame_plus_silence_votes_boundary() {
    // Arrange：画面切换 + 长静音双信号同刻；话题相似（仅 frame+silence 两票）
    let signals = vec![
        sig(0, false, false, "第一章 什么是变量"),
        sig(10000, true, true, "第一章 什么是变量（续）"),
    ];
    // Act
    let boundaries = detect_chapters(&signals, DEFAULT_MIN_VOTES);
    // Assert：10000ms 处判定边界，2 票
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].time_ms, 10000);
    assert_eq!(boundaries[0].votes, 2);
}

#[test]
fn topic_drop_counts_as_vote() {
    // Arrange：话题骤变（无画面/静音信号）——仅话题切换 1 票 → 默认阈值不判定
    let signals = vec![
        sig(0, false, false, "机器学习中的梯度下降算法原理讲解"),
        sig(10000, false, false, "今天会议决定下周发布新版本大家分工如下"),
    ];
    // Act
    let b2 = detect_chapters(&signals, 2);
    // Assert：1 票不判定；min_votes=1 时判定（话题切换也是有效信号）
    assert!(b2.is_empty());
    let b1 = detect_chapters(&signals, 1);
    assert_eq!(b1.len(), 1);
    assert_eq!(b1[0].time_ms, 10000);
}

#[test]
fn three_signals_all_vote() {
    // Arrange：三信号同刻
    let signals = vec![
        sig(0, false, false, "第一章 初识编程语言"),
        sig(5000, true, true, "第二章 变量与数据类型深入"),
    ];
    // Act
    let boundaries = detect_chapters(&signals, 3);
    // Assert：三票边界（min_votes=3 也命中）
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].votes, 3);
}

#[test]
fn consecutive_hits_deduplicated_to_first() {
    // Arrange：相邻两窗口连续命中（仅首个记录边界）
    let signals = vec![
        sig(0, false, false, "第一章"),
        sig(5000, true, true, "第二章"),
        sig(6000, true, true, "第二章内容展开"),
    ];
    // Act
    let boundaries = detect_chapters(&signals, 2);
    // Assert：仅 5000ms 一个边界（6000ms 与 5000ms 相邻窗口去重）
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].time_ms, 5000);
}

#[test]
fn multiple_chapters_detected() {
    // Arrange：两处边界（第1→2章、第2→3章）
    let signals = vec![
        sig(0, false, false, "第一章 导论"),
        sig(10000, true, true, "第二章 基础概念"),
        sig(30000, false, false, "第二章 基础概念继续"),
        sig(50000, true, true, "第三章 高级主题"),
    ];
    // Act
    let boundaries = detect_chapters(&signals, 2);
    // Assert：两处边界
    assert_eq!(boundaries.len(), 2);
    assert_eq!(boundaries[0].time_ms, 10000);
    assert_eq!(boundaries[1].time_ms, 50000);
}

#[test]
fn extract_ngrams_covers_cjk_and_ascii() {
    // Act
    let grams = extract_ngrams("变量 variable");
    // Assert：CJK 2-3 字 gram + ASCII 词
    assert!(grams.contains("变量"));
    assert!(grams.contains("variable"));
    assert!(grams.len() >= 4);
    // 空文本 → 空集
    assert!(extract_ngrams("").is_empty());
    // ASCII 词 ≥3 字符作为独立词加入（"var" 存在；2 字符 "ab" 仅滑窗 gram）
    let g2 = extract_ngrams("ab var");
    assert!(g2.contains("var"), "3 字符 ASCII 应作为独立词");
    assert!(g2.contains("ab"), "2 字符仍作为滑窗 gram 存在（字符级滑窗语义）");
}

#[test]
fn jaccard_similarity_ranges() {
    // Arrange
    let a = extract_ngrams("相同相同相同");
    let b = extract_ngrams("相同相同相同");
    let c = extract_ngrams("完全不同的内容表述");
    // Act/Assert：完全一致 → 1.0；空集对 → 0.0
    assert!((jaccard(&a, &b) - 1.0).abs() < 1e-6);
    assert!(jaccard(&a, &c) < 0.5, "不同话题相似度应低");
    assert_eq!(jaccard(&HashSet::new(), &a), 0.0);
}

#[test]
fn min_votes_one_detects_single_signal() {
    // Arrange：仅长静音信号
    let signals = vec![
        sig(0, false, false, "内容"),
        sig(8000, false, true, "内容2"),
    ];
    // Act：min_votes=1
    let boundaries = detect_chapters(&signals, 1);
    // Assert：静音信号单独即判定（min_votes=1 是显式放宽）
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].time_ms, 8000);
}
