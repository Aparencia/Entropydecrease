//! 字幕投票/滚动检测单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 subtitle_ocr.rs 以 #[cfg(test)] #[path] 引入。

use crate::subtitle_ocr::{is_scrolling, sample_join_limit, vote_text, SubtitleVoter, VotedSubtitle};

fn voted(start_ms: u64, end_ms: u64, text: &str) -> VotedSubtitle {
    VotedSubtitle { start_ms, end_ms, text: text.to_string() }
}

// ── 投票（T2）────────────────────────────────────────

#[test]
fn vote_corrects_single_frame_errors() {
    // Arrange：3 帧样本，2 帧正确、1 帧错字（"世畀" 错）
    let samples = ["你好世界", "你好世畀", "你好世界"];
    // Act
    let voted = vote_text(&samples);
    // Assert：多数帧胜出
    assert_eq!(voted, "你好世界");
}

#[test]
fn vote_handles_length_variation() {
    // Arrange：长度不同的样本（OCR 偶发丢尾字）
    let samples = ["第一课内容", "第一课内容", "第一课内"];
    // Act
    let voted = vote_text(&samples);
    // Assert：按最长对齐，缺失位跳过投票
    assert_eq!(voted, "第一课内容");
}

#[test]
fn vote_tie_prefers_first_sample() {
    // Arrange：平票（A/B 各一票）+ 首样本字符优先
    let samples = ["颜色", "色彩"];
    // Act
    let voted = vote_text(&samples);
    // Assert：首样本字符胜出（"颜" 而非 "色"）
    assert_eq!(voted, "颜色");
}

#[test]
fn vote_empty_input_returns_empty() {
    // Act & Assert
    assert_eq!(vote_text(&[]), "");
    assert_eq!(vote_text(&["", ""]), "");
}

// ── 投票器（有状态）──────────────────────────────────

#[test]
fn same_subtitle_accumulates_and_finalizes_on_change() {
    // Arrange
    let mut voter = SubtitleVoter::new();
    // Act：同字幕 3 帧（错字帧混入）→ 累积不产出
    assert_eq!(voter.observe("这是一段字幕", 0), None);
    assert_eq!(voter.observe("这是一段宇幕", 1000), None);
    assert_eq!(voter.observe("这是一段字幕", 2000), None);
    // 字幕切换 → 定稿上一组（投票校正 + 真实时间轴）
    let finalized = voter.observe("下一个要点", 3000).expect("finalized");
    // Assert
    assert_eq!(finalized, voted(0, 3000, "这是一段字幕"));
    // 新组已开启
    assert_eq!(voter.preview(), Some("下一个要点"));
}

#[test]
fn flush_finalizes_remaining_group() {
    // Arrange：累积但未切换
    let mut voter = SubtitleVoter::new();
    voter.observe("最后一句话", 10_000);
    voter.observe("最后一句话", 11_000);
    // Act：停止冲刷
    let flushed = voter.flush(12_000).expect("flushed");
    // Assert：end_ms=停止时刻
    assert_eq!(flushed, voted(10_000, 12_000, "最后一句话"));
    assert!(!voter.is_active());
    // 二次 flush 无输出
    assert_eq!(voter.flush(13_000), None);
}

#[test]
fn empty_text_does_not_start_group() {
    // Arrange & Act：空/空白帧不建组
    let mut voter = SubtitleVoter::new();
    assert_eq!(voter.observe("  ", 0), None);
    assert_eq!(voter.observe("", 100), None);
    assert!(!voter.is_active());
    // 真实字幕照常工作
    assert_eq!(voter.observe("真实字幕", 200), None);
    assert_eq!(voter.preview(), Some("真实字幕"));
}

#[test]
fn minor_jitter_becomes_vote_samples_not_emissions() {
    // Arrange：编辑距离 1 的微抖动（旧实现"合并跳过"，新实现作为投票样本）
    let mut voter = SubtitleVoter::new();
    voter.observe("熵减", 0);
    // Act：微抖动帧 → 不产出（累积为样本）
    assert_eq!(voter.observe("熵减。", 500), None);
    // 切换时投票输出（首样本字符为多数基准）
    let finalized = voter.observe("下一句", 1000).expect("finalized");
    // Assert：投票结果 = 多数帧（"熵减" 与 "熵减。" 平票 → 首样本）
    assert_eq!(finalized, voted(0, 1000, "熵减"));
}

#[test]
fn trim_normalizes_ocr_noise() {
    // Arrange & Act：首尾空白不影响分组归属
    let mut voter = SubtitleVoter::new();
    voter.observe("字幕", 0);
    let finalized = voter.observe("  下一句  ", 500).expect("finalized");
    // Assert：trim 后归属同组
    assert_eq!(finalized, voted(0, 500, "字幕"));
}

// ── TD-039：比例阈值（长文本多字符错读）────────────────

#[test]
fn join_limit_scales_with_length() {
    // Act & Assert：短文本保持下限 2；长文本按 15% 放宽（15 字 × 15% = 2.25 → 3）
    assert_eq!(sample_join_limit("熵减"), 2);
    assert_eq!(sample_join_limit("今天我们要学习牛顿三大运动定律"), 3);
}

#[test]
fn long_text_multi_char_errors_stay_in_group() {
    // Arrange：15 字样本（上限 3）——3 处错字超旧固定阈值 2
    let mut voter = SubtitleVoter::new();
    voter.observe("今天我们要学习牛顿三大运动定律", 0);
    // Act：3 处错字（顿→吨、运→东、律→津）→ 比例阈值下仍同组累积
    assert_eq!(voter.observe("今天我们要学习牛吨三大运东定津", 1000), None);
    // 切换时定稿投票结果（多数帧为原文本）
    let finalized = voter.observe("下一段内容", 2000).expect("finalized");
    // Assert：投票输出原文本（2 票 vs 1 票）
    assert_eq!(finalized, voted(0, 2000, "今天我们要学习牛顿三大运动定律"));
}

// ── 滚动字幕检测（保持）──────────────────────────────

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
    // Act & Assert：同文本不属于滚动（由投票分组处理）
    assert!(!is_scrolling("字幕", "字幕", 0.6));
}

#[test]
fn empty_input_is_not_scrolling() {
    // Act & Assert
    assert!(!is_scrolling("", "内容", 0.6));
    assert!(!is_scrolling("内容", "", 0.6));
}
