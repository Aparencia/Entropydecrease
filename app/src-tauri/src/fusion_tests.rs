//! 双源融合单测（AAA 模式；纯函数，确定性输入）。
//!
//! @ai-context: 由 fusion.rs 以 #[cfg(test)] #[path] 引入；
//!              覆盖 ADR-005 四规则：字幕权威/ASR 补缝/重叠校对/空窗丢弃。

use crate::fusion::{merge_transcript, merge_transcript_with, FusedSegment, FusedSource, FusionConfig, SubtitleSegment};
use crate::types::TranscriptSegment;

fn sub(start_ms: u64, end_ms: u64, text: &str) -> SubtitleSegment {
    SubtitleSegment { start_ms, end_ms, text: text.to_string(), confidence: None }
}

fn sub_conf(start_ms: u64, end_ms: u64, text: &str, confidence: f32) -> SubtitleSegment {
    SubtitleSegment { start_ms, end_ms, text: text.to_string(), confidence: Some(confidence) }
}

fn asr(start_ms: u64, end_ms: u64, text: &str) -> TranscriptSegment {
    TranscriptSegment {
        start_ms,
        end_ms,
        text: text.to_string(),
        word_timestamps: None,
        confidence: None,
    }
}

fn asr_conf(start_ms: u64, end_ms: u64, text: &str, confidence: f32) -> TranscriptSegment {
    TranscriptSegment {
        start_ms,
        end_ms,
        text: text.to_string(),
        word_timestamps: None,
        confidence: Some(confidence),
    }
}

const GAP: u64 = 1000;

#[test]
fn subtitle_only_produces_subtitle_segments() {
    // Arrange & Act
    let out = merge_transcript(&[sub(0, 3000, "字幕一")], &[], GAP);
    // Assert
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].source, FusedSource::Subtitle);
    assert_eq!(out[0].text, "字幕一");
}

#[test]
fn empty_input_produces_nothing() {
    // Act & Assert
    assert!(merge_transcript(&[], &[], GAP).is_empty());
}

#[test]
fn subtitle_is_authoritative_over_asr() {
    // Arrange：ASR 完全在字幕段内且文本接近（编辑距离 ≤2）→ 丢弃 ASR
    let subs = [sub(0, 4000, "今天讲熵减概念")];
    let asrs = [asr(500, 3500, "今天讲熵减概念")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：只有字幕段
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].source, FusedSource::Subtitle);
}

#[test]
fn asr_sentence_across_multiple_subtitles_is_split_not_duplicated() {
    // Arrange：一个 ASR 句跨 3 个字幕段 → 2 个空隙 + 3 段重叠保留；
    // 旧实现整句复制到每个空隙（TD-024）且空隙与重叠保留各输出整句（会话 8/11 实测重复）
    let subs = [
        sub(0, 2000, "字幕一"),
        sub(3000, 5000, "字幕二"),
        sub(6000, 8000, "字幕三"),
    ];
    let asrs = [asr(1000, 7000, "一二三四五六七八")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：补缝 2 段；全部非字幕段按时间窗占比切分，拼接等于原句（无整句重复）
    let gaps_out: Vec<&FusedSegment> = out.iter().filter(|s| s.source == FusedSource::Asr).collect();
    assert_eq!(gaps_out.len(), 2);
    let non_subs: Vec<&FusedSegment> = out.iter().filter(|s| s.source != FusedSource::Subtitle).collect();
    let joined: String = non_subs.iter().map(|s| s.text.as_str()).collect();
    assert_eq!(joined, "一二三四五六七八");
    // 时间窗互不重叠（相邻不复制）
    for w in non_subs.windows(2) {
        assert!(w[0].end_ms <= w[1].start_ms, "窗口重叠: {}-{} 与 {}-{}", w[0].start_ms, w[0].end_ms, w[1].start_ms, w[1].end_ms);
    }
}

#[test]
fn asr_sentence_straddling_subtitle_boundary_not_duplicated() {
    // Arrange：字幕从 ASR 句中间开始（字幕 OCR 抓错区域时的真实形态）——
    // 旧实现：句首空隙补缝整句 + 重叠保留整句 → 同一句相邻出现两次（会话 8/11 实测）
    let subs = [sub(5000, 9000, "这是字幕内容")];
    let asrs = [asr(2000, 7000, "一二三四五六七八九十")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：空隙补缝 [2000-5000] + 重叠保留 [5000-7000]，文本按占比切分，拼接 = 原句
    let non_subs: Vec<&FusedSegment> = out.iter().filter(|s| s.source != FusedSource::Subtitle).collect();
    assert_eq!(non_subs.len(), 2);
    let joined: String = non_subs.iter().map(|s| s.text.as_str()).collect();
    assert_eq!(joined, "一二三四五六七八九十");
    // 时间窗衔接不重叠、不重复文本
    assert_eq!(non_subs[0].end_ms, non_subs[1].start_ms);
    assert_ne!(non_subs[0].text, non_subs[1].text);
}

#[test]
fn asr_fills_gap_between_subtitles() {
    // Arrange：字幕 0-2s 与 5-7s，中间 3s 空隙 ≥ gap → ASR 补缝
    let subs = [sub(0, 2000, "字幕一"), sub(5000, 7000, "字幕二")];
    let asrs = [asr(2500, 4500, "补缝内容")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：字幕一 + ASR 补缝 + 字幕二，时间轴有序
    assert_eq!(out.len(), 3);
    assert_eq!(out[0].source, FusedSource::Subtitle);
    assert_eq!(out[1].source, FusedSource::Asr);
    assert_eq!(out[1].start_ms, 2500);
    assert_eq!(out[1].end_ms, 4500);
    assert_eq!(out[2].source, FusedSource::Subtitle);
}

#[test]
fn short_gap_is_dropped() {
    // Arrange：字幕 0-2s 与 2.5-5s，空隙 0.5s < gap → 不补缝
    let subs = [sub(0, 2000, "字幕一"), sub(2500, 5000, "字幕二")];
    let asrs = [asr(2000, 2500, "短暂内容")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：ASR 段被丢弃（空窗丢弃规则）
    assert_eq!(out.len(), 2);
    assert!(out.iter().all(|s| s.source == FusedSource::Subtitle));
}

#[test]
fn mismatched_overlap_keeps_asr_for_review() {
    // Arrange：字幕与 ASR 重叠但编辑距离 >2 → 保留 Fused 核对段
    let subs = [sub(0, 4000, "今天讲牛顿定律")];
    let asrs = [asr(500, 3500, "完全不同的说法")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：字幕 + Fused 核对段
    assert_eq!(out.len(), 2);
    assert_eq!(out[0].source, FusedSource::Subtitle);
    assert_eq!(out[1].source, FusedSource::Fused);
    assert_eq!(out[1].start_ms, 500);
    assert_eq!(out[1].end_ms, 3500);
}

#[test]
fn asr_tail_after_last_subtitle_is_filled() {
    // Arrange：ASR 与字幕重叠且文本一致（重叠丢弃），尾部 ≥ gap → 补缝
    let subs = [sub(0, 2000, "字幕")];
    let asrs = [asr(1000, 5000, "字幕")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：字幕 0-2s + ASR 尾 2s-5s（重叠部分 1-2s 被裁剪）
    assert_eq!(out.len(), 2);
    let tail = out.iter().find(|s| s.source == FusedSource::Asr).expect("tail");
    assert_eq!(tail.start_ms, 2000);
    assert_eq!(tail.end_ms, 5000);
}

#[test]
fn unsorted_input_is_sorted_by_time() {
    // Arrange：乱序输入
    let subs = [sub(5000, 7000, "后段"), sub(0, 2000, "前段")];
    // Act
    let out = merge_transcript(&subs, &[], GAP);
    // Assert：按时间轴排序
    assert_eq!(out[0].start_ms, 0);
    assert_eq!(out[1].start_ms, 5000);
}

#[test]
fn overlapping_subtitles_are_shortened() {
    // Arrange：重叠字幕（文本不同）→ 前段被缩短
    let subs = [sub(0, 3000, "第一句"), sub(2000, 5000, "第二句")];
    // Act
    let out = merge_transcript(&subs, &[], GAP);
    // Assert：前段 end 缩短到 2000
    assert_eq!(out.len(), 2);
    assert_eq!(out[0].end_ms, 2000);
    assert_eq!(out[1].start_ms, 2000);
}

#[test]
fn empty_asr_text_is_skipped() {
    // Arrange
    let subs = [sub(0, 2000, "字幕")];
    let asrs = [asr(500, 1500, "   ")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：空文本 ASR 不产出
    assert_eq!(out.len(), 1);
}

#[test]
fn gap_zero_uses_default() {
    // Arrange：gap_ms=0 走默认 1000ms
    let subs = [sub(0, 2000, "字幕一"), sub(2500, 5000, "字幕二")];
    let asrs = [asr(2000, 2500, "短暂内容")];
    // Act：0 表示默认（与显式 1000 等价）
    let out = merge_transcript(&subs, &asrs, 0);
    // Assert：500ms 空隙 < 默认 1000ms → 丢弃
    assert_eq!(out.len(), 2);
}

#[test]
fn identical_text_subtitles_are_merged() {
    // Arrange：相邻同文本字幕 → 合并为一段
    let subs = [sub(0, 3000, "同一句话"), sub(3000, 6000, "同一句话")];
    // Act
    let out = merge_transcript(&subs, &[], GAP);
    // Assert：一段 0-6000ms
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].start_ms, 0);
    assert_eq!(out[0].end_ms, 6000);
}

/// 辅助断言：检查输出段列表（调试友好）。
#[allow(dead_code)]
fn _describe(out: &[FusedSegment]) -> String {
    out.iter()
        .map(|s| format!("[{}-{}:{:?}]{}", s.start_ms, s.end_ms, s.source, s.text))
        .collect::<Vec<_>>()
        .join(" ")
}

// ────────────────────────────────────────────────────────────
// REQ-062（v0.6.0 M2）：概率加权融合（合成双源置信度矩阵）
// ────────────────────────────────────────────────────────────

#[test]
fn high_similarity_wins_subtitle_regardless_of_confidence() {
    // Arrange：文本一致（sim=1 ≥ 0.8）——字幕权威第一层，置信度不参与
    let subs = [sub_conf(0, 4000, "今天讲熵减概念", 0.5)];
    let asrs = [asr_conf(500, 3500, "今天讲熵减概念", 0.99)];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：仅字幕段（ASR 丢弃）
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].source, FusedSource::Subtitle);
    assert_eq!(out[0].confidence, Some(0.5), "字幕置信度传播到输出");
}

#[test]
fn asr_higher_confidence_keeps_review_segment() {
    // Arrange：文本不同（sim=0 < 0.8）；ASR 置信度 0.95 显著高于字幕 0.6
    let subs = [sub_conf(0, 4000, "今天讲牛顿定律", 0.6)];
    let asrs = [asr_conf(500, 3500, "完全不同的说法", 0.95)];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：ASR 更可信 → 保留 Fused 核对段（confidence=ASR 置信度）
    assert_eq!(out.len(), 2);
    assert_eq!(out[1].source, FusedSource::Fused);
    assert_eq!(out[1].confidence, Some(0.95));
}

#[test]
fn subtitle_higher_confidence_wins_over_mismatch() {
    // Arrange：文本不同；字幕置信度 0.95 显著高于 ASR 0.6 → 字幕胜（无核对段）
    let subs = [sub_conf(0, 4000, "今天讲牛顿定律", 0.95)];
    let asrs = [asr_conf(500, 3500, "完全不同的说法", 0.6)];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：仅字幕段（字幕权威性压过低置信 ASR）
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].source, FusedSource::Subtitle);
}

#[test]
fn both_low_confidence_marks_low_confidence_review() {
    // Arrange：双源均低置信（0.4 < 0.6）且文本不同 → 低置信核对段（B3 标记）
    let subs = [sub_conf(0, 4000, "今天讲牛顿定律", 0.4)];
    let asrs = [asr_conf(500, 3500, "完全不同的说法", 0.4)];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：Fused 核对段携带低置信标记
    assert_eq!(out.len(), 2);
    assert_eq!(out[1].source, FusedSource::Fused);
    assert_eq!(out[1].confidence, Some(0.4));
    assert!(out[1].confidence.unwrap() < 0.6, "低置信标记应 < 0.6");
}

#[test]
fn config_disabled_falls_back_to_hard_rules() {
    // Arrange：加权关闭（v0.5.0 行为兜底）——即使双源显式置信度也不参与
    let subs = [sub_conf(0, 4000, "今天讲牛顿定律", 0.95)];
    let asrs = [asr_conf(500, 3500, "完全不同的说法", 0.95)];
    let config = FusionConfig { probability_weighted: false };
    // Act
    let out = merge_transcript_with(&subs, &asrs, GAP, &config);
    // Assert：距离>2 → 保留核对段（旧硬规则）
    assert_eq!(out.len(), 2);
    assert_eq!(out[1].source, FusedSource::Fused);
    // 加权关闭时置信度不参与：兜底取 ASR 显式值
    assert_eq!(out[1].confidence, Some(0.95));
}

#[test]
fn probability_weighted_matches_hard_rule_without_confidence() {
    // Arrange：无显式置信度（None=旧数据）→ 兜底硬规则（距离>2 保留核对段）
    let subs = [sub(0, 4000, "今天讲牛顿定律")];
    let asrs = [asr(500, 3500, "完全不同的说法")];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：与 v0.5.0 行为一致（mismatched_overlap_keeps_asr_for_review 同场景）；
    // 审查修复：核对段置信度 None（未知≠低置信——防 note_filter 误删）
    assert_eq!(out.len(), 2);
    assert_eq!(out[1].source, FusedSource::Fused);
    assert_eq!(out[1].confidence, None, "无显式置信度不得标记 0.5");
}

#[test]
fn weighted_borderline_prefers_subtitle() {
    // Arrange：sim 中等（0.5）、双源置信度相等（0.8）——字幕权威性公式应偏向字幕
    // 验证：p_sub = 0.8×(0.6+0.2)=0.64 > p_asr = 0.8×(0.4+0.3)=0.56
    // 文本：6 字 vs 6 字，distance=3 → sim=0.5
    let subs = [sub_conf(0, 4000, "甲乙丙丁戊己", 0.8)];
    let asrs = [asr_conf(500, 3500, "庚辛壬癸子丑", 0.8)];
    // Act
    let out = merge_transcript(&subs, &asrs, GAP);
    // Assert：字幕胜出（无核对段）
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].source, FusedSource::Subtitle);
}
