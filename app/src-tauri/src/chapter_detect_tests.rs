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

// ────────────────────────────────────────────────────────────
// REQ-064（v0.6.0 M2）：时序状态机平滑（合成会话状态序列）
// ────────────────────────────────────────────────────────────

fn strict_config() -> ChapterDetectConfig {
    ChapterDetectConfig {
        confirm_requires_repeat: true,
        candidate_window_ms: 30_000,
        min_chapter_ms: 60_000,
    }
}

#[test]
fn strict_config_requires_repeat_to_confirm() {
    // Arrange：严格档——单窗口命中只是候选，需窗口内再次命中才确认
    let signals = vec![
        sig(0, false, false, "第一章内容"),
        sig(10_000, true, true, "第二章内容"),
        sig(20_000, true, true, "第二章内容继续"),
    ];
    // Act
    let boundaries = detect_chapters_with(&signals, 2, &strict_config());
    // Assert：候选 10s 后 20s 再命中 → 确认在 10s（首次命中窗口）
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].time_ms, 10_000);
}

#[test]
fn strict_config_candidate_expires_without_repeat() {
    // Arrange：严格档——单窗口命中后无重复 → 候选过期不产边界
    let signals = vec![
        sig(0, false, false, "第一章内容"),
        sig(10_000, true, true, "第二章内容"),
        sig(50_000, false, false, "第二章内容继续"), // 超过候选窗口（30s）
    ];
    // Act
    let boundaries = detect_chapters_with(&signals, 2, &strict_config());
    // Assert：候选 10s 在 40s 前未再命中 → 过期；无边界
    assert!(boundaries.is_empty(), "候选过期不得产出边界");
}

#[test]
fn strict_config_expired_then_new_candidate_confirms() {
    // Arrange：严格档——候选过期后，新的独立命中窗口重新候选并确认
    let signals = vec![
        sig(0, false, false, "第一章内容"),
        sig(10_000, true, true, "第二章内容"), // 候选（无重复 → 过期）
        sig(50_000, false, false, "第二章继续"), // 候选过期
        sig(80_000, true, true, "第三章内容"), // 新候选
        sig(90_000, true, true, "第三章内容继续"), // 窗口内再命中 → 确认
    ];
    // Act
    let boundaries = detect_chapters_with(&signals, 2, &strict_config());
    // Assert：仅 80s 边界（10s 候选已过期不产出）
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].time_ms, 80_000);
}

#[test]
fn min_chapter_suppresses_rapid_boundaries() {
    // Arrange：最短章节时长 60s 先验——两次命中间隔 20s < 60s → 抑制第二次
    let signals = vec![
        sig(0, false, false, "第一章内容"),
        sig(10_000, true, true, "第二章内容"),
        sig(30_000, true, true, "第三章内容"), // 距确认 20s < 60s → 抑制
    ];
    // Act
    let boundaries = detect_chapters_with(&signals, 2, &strict_config());
    // Assert：仅第一个边界（10s）；30s 命中在抑制期内被忽略
    assert_eq!(boundaries.len(), 1);
    assert_eq!(boundaries[0].time_ms, 10_000);
}

#[test]
fn default_config_single_window_confirm_legacy() {
    // Arrange：默认档（confirm_requires_repeat=false）——单窗口命中即确认
    // （v0.5.0 行为回归护栏：与 detect_chapters 等价）
    let signals = vec![
        sig(0, false, false, "第一章内容"),
        sig(10_000, true, true, "第二章内容"),
        sig(20_000, false, false, "第二章内容继续"),
    ];
    // Act：默认配置与旧入口结果一致
    let with_cfg = detect_chapters_with(&signals, 2, &ChapterDetectConfig::default());
    let legacy = detect_chapters(&signals, 2);
    // Assert：等价（零回归）
    assert_eq!(with_cfg, legacy);
    assert_eq!(with_cfg.len(), 1);
    assert_eq!(with_cfg[0].time_ms, 10_000);
}

#[test]
fn topic_drop_reports_real_magnitude() {
    // Arrange：话题骤变 + 画面切换（topic_drop 应有真实幅度而非 0 占位）
    let signals = vec![
        sig(0, false, false, "机器学习中的梯度下降算法原理讲解"),
        sig(10_000, true, false, "今天会议决定下周发布新版本大家分工如下"),
    ];
    // Act
    let boundaries = detect_chapters_with(&signals, 2, &ChapterDetectConfig::default());
    // Assert：边界存在且 topic_drop > 0（REQ-064 回填真实下降幅度）
    assert_eq!(boundaries.len(), 1);
    assert!(boundaries[0].topic_drop > 0.0, "topic_drop 应回填真实幅度，实得 {}", boundaries[0].topic_drop);
}
