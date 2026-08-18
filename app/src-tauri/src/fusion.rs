//! 双源转写融合（REQ-012，ADR-005）：字幕 OCR 流为主体，ASR 补全/校对。
//!
//! @ai-context: 纯规则融合（无 LLM，本地优先降级路径）。规则按优先级：
//!              1) 字幕权威——字幕段覆盖时间窗内以字幕为准（准确率近 100%）
//!              2) ASR 补缝——字幕段之间 gap > gap_ms 的空隙用 ASR 填补
//!              3) 重叠校对——字幕与 ASR 重叠时编辑距离 ≤2 视为一致（字幕胜出、
//!                 丢弃 ASR）；>2 视为不一致（字幕胜出，但保留 ASR 段供人工核对）
//!              4) 时间轴对齐——重叠部分归属字幕，ASR 段被裁剪到空隙
//!              5) 空窗丢弃——两端无内容的静默窗不产出段
//! @ai-context: 输入字幕段需已含 end_ms（编排按下一字幕出现时刻补齐）。

use crate::streaming_asr::levenshtein;
use crate::types::TranscriptSegment;

/// 融合段来源标记。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FusedSource {
    /// 字幕段（权威）
    Subtitle,
    /// ASR 补缝段
    Asr,
    /// 字幕与 ASR 内容不一致时保留的 ASR 核对段（标记区分）
    Fused,
}

/// 字幕段（编排层由 SubtitleTracker 输出补齐 end_ms）。
#[derive(Debug, Clone, PartialEq)]
pub struct SubtitleSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// 融合输出段。
#[derive(Debug, Clone, PartialEq)]
pub struct FusedSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    pub source: FusedSource,
}

/// 字幕段之间允许的静默 gap（毫秒），超过才用 ASR 补缝。
const DEFAULT_GAP_MS: u64 = 1000;

/// 双源融合主入口（纯函数，输入顺序无关，内部排序）。
pub fn merge_transcript(
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
    gap_ms: u64,
) -> Vec<FusedSegment> {
    let gap = if gap_ms == 0 { DEFAULT_GAP_MS } else { gap_ms };
    let subs = normalize_subtitles(subtitles);
    let mut result: Vec<FusedSegment> = Vec::new();

    // 1) 字幕为主体
    for s in &subs {
        result.push(FusedSegment {
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            source: FusedSource::Subtitle,
        });
    }

    // 2) ASR 段按重叠关系裁剪/保留（重叠归属字幕）
    for asr in asr_segments {
        let text = asr.text.trim();
        if text.is_empty() {
            continue;
        }
        let mut cursor = asr.start_ms;
        let end = asr.end_ms;
        // 满足 gap 阈值的空隙列表（含尾部），统一在最后按比例切分文本
        let mut gaps: Vec<(u64, u64)> = Vec::new();
        for sub in &subs {
            if cursor >= end {
                break;
            }
            // 与当前字幕段的关系
            if sub.end_ms <= cursor {
                continue; // 字幕段在 ASR 之前，跳过
            }
            if sub.start_ms >= end {
                break; // 字幕段在 ASR 之后，后续字幕更远，退出
            }
            // 重叠：重叠部分归属字幕
            if sub.start_ms > cursor {
                // 字幕前的空隙 → 补缝（满足 gap 阈值才保留）
                let (s, e) = (cursor, sub.start_ms.min(end));
                if e - s >= gap {
                    gaps.push((s, e));
                }
                cursor = e;
            }
            // 重叠校对：编辑距离 ≤2 视为一致（ASR 丢弃）；否则保留核对段
            if cursor < end && cursor < sub.end_ms {
                let overlap_end = sub.end_ms.min(end);
                let distance = levenshtein(text, sub.text.trim());
                if distance > 2 && overlap_end > cursor {
                    result.push(FusedSegment {
                        start_ms: cursor,
                        end_ms: overlap_end,
                        text: text.to_string(),
                        source: FusedSource::Fused,
                    });
                }
                cursor = overlap_end;
            }
        }
        // 3) 尾部空隙（ASR 结束于最后字幕之后）——补缝
        if cursor < end && end - cursor >= gap {
            gaps.push((cursor, end));
        }
        // TD-024：ASR 句跨多字幕段时整句不得在多个补缝段复制——
        // 文本按各空隙时长占比切分（近似时间对齐），最后一个空隙吃下全部剩余字符
        push_gap_segments(&mut result, &gaps, text);
    }

    // 4) 按时间轴排序输出
    result.sort_by_key(|s| (s.start_ms, s.end_ms));
    result
}

/// 按空隙时长比例切分 ASR 文本并产出补缝段（TD-024 修复）。
///
/// @ai-context: 一个 ASR 句跨越多个字幕段时会产生多个空隙，旧实现把整句复制到每个空隙
///              导致融合结果文本重复；现按各空隙时长占比分配字符数（整除余数归末段）。
fn push_gap_segments(result: &mut Vec<FusedSegment>, gaps: &[(u64, u64)], text: &str) {
    let total: u64 = gaps.iter().map(|(s, e)| e - s).sum();
    if total == 0 {
        return;
    }
    let chars: Vec<char> = text.chars().collect();
    let mut pos = 0usize;
    let last = gaps.len() - 1;
    for (i, (s, e)) in gaps.iter().enumerate() {
        let take = if i == last {
            chars.len().saturating_sub(pos) // 末段吃掉全部剩余（防整除截断丢字）
        } else {
            ((chars.len() as u64) * (e - s) / total) as usize
        };
        let take = take.min(chars.len().saturating_sub(pos));
        if take > 0 {
            let piece: String = chars[pos..pos + take].iter().collect();
            pos += take;
            result.push(FusedSegment {
                start_ms: *s,
                end_ms: *e,
                text: piece,
                source: FusedSource::Asr,
            });
        }
    }
}

/// 归一化字幕段：排序 + 合并重叠/相邻（同文本延伸）。
fn normalize_subtitles(subtitles: &[SubtitleSegment]) -> Vec<SubtitleSegment> {
    let mut sorted: Vec<SubtitleSegment> = subtitles
        .iter()
        .filter(|s| !s.text.trim().is_empty() && s.end_ms > s.start_ms)
        .cloned()
        .collect();
    sorted.sort_by_key(|s| s.start_ms);

    let mut merged: Vec<SubtitleSegment> = Vec::new();
    for s in sorted {
        if let Some(last) = merged.last_mut() {
            // 相邻或重叠且文本一致 → 延伸 end
            if s.start_ms <= last.end_ms && s.text.trim() == last.text.trim() {
                last.end_ms = last.end_ms.max(s.end_ms);
                continue;
            }
            // 重叠但文本不同：缩短前段（重叠归属后段）
            if s.start_ms < last.end_ms {
                last.end_ms = s.start_ms;
            }
        }
        merged.push(SubtitleSegment { text: s.text.trim().to_string(), ..s });
    }
    merged
}

#[cfg(test)]
#[path = "fusion_tests.rs"]
mod tests;
