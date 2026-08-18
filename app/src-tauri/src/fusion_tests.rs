//! 双源融合单测（AAA 模式；纯函数，确定性输入）。
//!
//! @ai-context: 由 fusion.rs 以 #[cfg(test)] #[path] 引入；
//!              覆盖 ADR-005 四规则：字幕权威/ASR 补缝/重叠校对/空窗丢弃。

use crate::fusion::{merge_transcript, FusedSegment, FusedSource, SubtitleSegment};
use crate::types::TranscriptSegment;

fn sub(start_ms: u64, end_ms: u64, text: &str) -> SubtitleSegment {
    SubtitleSegment { start_ms, end_ms, text: text.to_string() }
}

fn asr(start_ms: u64, end_ms: u64, text: &str) -> TranscriptSegment {
    TranscriptSegment { start_ms, end_ms, text: text.to_string() }
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
