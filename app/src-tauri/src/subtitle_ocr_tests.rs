//! 字幕投票/滚动检测单测（AAA 模式；纯函数，无 IO 依赖）。
//!
//! @ai-context: 由 subtitle_ocr.rs 以 #[cfg(test)] #[path] 引入。

use crate::subtitle_ocr::{
    is_scrolling, sample_join_limit, vote_text, vote_text_with_confidence, SubtitleVoter,
    VotedSubtitle,
};

fn voted(start_ms: u64, end_ms: u64, text: &str) -> VotedSubtitle {
    VotedSubtitle { start_ms, end_ms, text: text.to_string(), confidence: Some(1.0) }
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

// ── 投票置信度（REQ-062）────────────────────────────

#[test]
fn vote_confidence_high_when_samples_agree() {
    // Arrange：3 帧完全一致 → 每位多数比例 1.0
    let samples = ["你好世界", "你好世界", "你好世界"];
    // Act
    let (text, confidence) = vote_text_with_confidence(&samples);
    // Assert
    assert_eq!(text, "你好世界");
    assert!((confidence - 1.0).abs() < 1e-6, "全一致置信度应 1.0，实得 {}", confidence);
}

#[test]
fn vote_confidence_drops_with_disagreement() {
    // Arrange：2 帧正确 + 1 帧错字 → 错字位多数比例 2/3 ≈ 0.667
    let samples = ["你好世界", "你好世畀", "你好世界"];
    // Act
    let (text, confidence) = vote_text_with_confidence(&samples);
    // Assert：文本被纠正但置信度 < 1（证据不完美）
    assert_eq!(text, "你好世界");
    assert!(confidence < 1.0 && confidence > 0.6, "多数比例应在 (0.5,1)，实得 {}", confidence);
}

#[test]
fn vote_confidence_tie_uses_half() {
    // Arrange：平票位（首样本仲裁）→ 该位置信度 0.5
    let samples = ["颜色", "色彩"];
    // Act
    let (text, confidence) = vote_text_with_confidence(&samples);
    // Assert：文本首样本胜出；置信度 0.5（证据不足）
    assert_eq!(text, "颜色");
    assert!((confidence - 0.5).abs() < 1e-6, "仲裁位置信度应 0.5，实得 {}", confidence);
}

#[test]
fn voted_subtitle_carries_confidence_into_fusion_segment() {
    // Arrange：投票器累积 3 帧一致样本 → 定稿
    let mut voter = SubtitleVoter::new();
    voter.observe("同一句话", 0);
    voter.observe("同一句话", 1000);
    // Act：切换触发定稿（"这是完全不同的下一句" 编辑距离 >2 → 新组）
    let finalized = voter.observe("这是完全不同的下一句", 2000).expect("finalized");
    // Assert：VotedSubtitle 置信度 1.0 且 into_segment 传递到融合层
    assert_eq!(finalized.confidence, Some(1.0));
    let seg = finalized.into_segment();
    assert_eq!(seg.confidence, Some(1.0));
    assert_eq!(seg.text, "同一句话");
}

// ── 投票器（有状态）──────────────────────────────────

#[test]
fn identical_text_hash_shortcut_accumulates_samples() {
    // M3/REQ-038：同文本帧走精确 hash 短路（跳过 levenshtein）——行为等价：
    // 累积样本、不产出、切换时定稿
    let mut voter = SubtitleVoter::new();
    assert_eq!(voter.observe("同一句话", 0), None);
    // 10 帧完全相同文本（含前后空格差异——trim 后命中短路）
    for i in 1..=10 {
        assert_eq!(voter.observe(" 同一句话 ", i * 100), None);
    }
    let finalized = voter.observe("切换", 2000).expect("finalized");
    assert_eq!(finalized, voted(0, 2000, "同一句话"));
}

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
    // Assert：文本投票校正；时间轴正确；置信度为多数比例（错字位 2/3）
    assert_eq!(finalized.start_ms, 0);
    assert_eq!(finalized.end_ms, 3000);
    assert_eq!(finalized.text, "这是一段字幕");
    let conf = finalized.confidence.expect("confidence");
    assert!(conf < 1.0 && conf > 0.5, "错字位置信度应在 (0.5,1)，实得 {}", conf);
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
    // Assert：投票输出原文本（2 票 vs 1 票）；置信度 = 多数比例
    assert_eq!(finalized.start_ms, 0);
    assert_eq!(finalized.end_ms, 2000);
    assert_eq!(finalized.text, "今天我们要学习牛顿三大运动定律");
    let conf = finalized.confidence.expect("confidence");
    assert!(conf < 1.0 && conf > 0.5, "错字位置信度应在 (0.5,1)，实得 {}", conf);
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
