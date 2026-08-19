//! 双源转写融合（REQ-012，ADR-005；v0.6.0 M2 REQ-062 概率加权升级）。
//!
//! @ai-context: 纯规则融合（无 LLM，本地优先降级路径）。规则按优先级：
//!              1) 字幕权威——字幕段覆盖时间窗内以字幕为准（准确率近 100%）
//!              2) ASR 补缝——字幕段之间 gap > gap_ms 的空隙用 ASR 填补
//!              3) 重叠校对——REQ-062 升级为概率加权：编辑距离高相似（sim ≥
//!                 阈值，≈旧 ≤2 规则）一律字幕胜；相似度不足时比较
//!                 P(字幕胜出)=conf_sub×(0.6+0.4×sim) 与 P(ASR 保留)=conf_asr×(0.4+0.6×sim)；
//!                 双源低置信 → 输出低置信核对段（B3 落库标记）；
//!                 置信度缺失（None=旧数据）→ 回退旧硬规则（距离>2 保留核对段）
//!              4) 时间轴对齐——重叠部分归属字幕，ASR 段被裁剪到空隙
//!              5) 空窗丢弃——两端无内容的静默窗不产出段
//! @ai-context: 输入字幕段需已含 end_ms（编排按下一字幕出现时刻补齐）。
//! @ai-context: 硬规则保留为兜底开关（FusionConfig.probability_weighted=false
//!              完全恢复 v0.5.0 行为——审查/校准回退通道）。

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
///
/// @ai-context: v0.6.0 M2（REQ-062）：confidence 为字幕投票置信度
///              （vote_text_with_confidence 产出；None=旧数据）。
#[derive(Debug, Clone, PartialEq)]
pub struct SubtitleSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    pub confidence: Option<f32>,
}

/// 融合输出段。
#[derive(Debug, Clone, PartialEq)]
pub struct FusedSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    pub source: FusedSource,
    /// 融合后段置信度（B3 落库通道；None=未知）
    pub confidence: Option<f32>,
    /// REQ-103（v0.7.0 M1）：源段平均音量透传（ASR 源段有、字幕源段 None——
    /// 音量骤变信号仅对 ASR 内容有意义）
    pub volume: Option<f32>,
}

/// 融合配置（REQ-062：概率加权开关——关闭即 v0.5.0 硬规则行为）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FusionConfig {
    /// 概率加权决策（默认开；false=纯硬规则兜底）
    pub probability_weighted: bool,
}

impl Default for FusionConfig {
    fn default() -> Self {
        Self { probability_weighted: true }
    }
}

/// 字幕段之间允许的静默 gap（毫秒），超过才用 ASR 补缝。
const DEFAULT_GAP_MS: u64 = 1000;
/// 高相似阈值（归一化编辑距离相似度）：≥ 该值视为"文本一致"（≈旧编辑距离 ≤2 规则）。
const SIM_MATCH_THRESHOLD: f32 = 0.8;
/// 双源低置信阈值：双源均 < 该值 → 输出低置信核对段（B3 标记）。
const LOW_CONFIDENCE: f32 = 0.6;

/// 输出窗口（REQ-062/103 后 5 元）：起点/终点/来源/置信度/音量。
///
/// @ai-context: 元组过长拆 type alias——REQ-103 追加 volume 后 clippy 提示。
type OutputWindow = (u64, u64, FusedSource, Option<f32>, Option<f32>);

/// 双源融合主入口（纯函数，输入顺序无关，内部排序；默认配置）。
pub fn merge_transcript(
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
    gap_ms: u64,
) -> Vec<FusedSegment> {
    merge_transcript_with(subtitles, asr_segments, gap_ms, &FusionConfig::default())
}

/// 双源融合（可配置版本，REQ-062）。
pub fn merge_transcript_with(
    subtitles: &[SubtitleSegment],
    asr_segments: &[TranscriptSegment],
    gap_ms: u64,
    config: &FusionConfig,
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
            confidence: s.confidence,
            // REQ-103：字幕源段无音量（None=未知）
            volume: None,
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
        // 本句的全部输出窗口（空隙补缝 + 重叠保留），统一在最后按时长占比切分文本——
        // 修复：旧实现空隙补缝与重叠保留各输出整句，字幕边界落在句内时同句相邻重复
        // （会话 8/11 实测：同一句连排 2~3 遍）；窗口合并后整句只分配一次
        let mut windows: Vec<OutputWindow> = Vec::new();
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
                    windows.push((s, e, FusedSource::Asr, asr.confidence, asr.volume));
                }
                cursor = e;
            }
            // 重叠校对：REQ-062 概率加权决策
            if cursor < end && cursor < sub.end_ms {
                let overlap_end = sub.end_ms.min(end);
                match decide_overlap(sub, asr, text, config) {
                    OverlapDecision::SubtitleWins => {}
                    // 保留核对段（低置信标记 / ASR 更可信 / 硬规则兜底）
                    OverlapDecision::KeepReview(conf) => {
                        windows.push((cursor, overlap_end, FusedSource::Fused, conf, asr.volume));
                    }
                }
                cursor = overlap_end;
            }
        }
        // 3) 尾部空隙（ASR 结束于最后字幕之后）——补缝
        if cursor < end && end - cursor >= gap {
            windows.push((cursor, end, FusedSource::Asr, asr.confidence, asr.volume));
        }
        // 4) 按时间窗占比切分整句文本（TD-024 演进：空隙+重叠保留共用同一份文本配额）
        push_window_segments(&mut result, &windows, text);
    }

    // 5) 按时间轴排序输出
    result.sort_by_key(|s| (s.start_ms, s.end_ms));
    result
}

/// 重叠校对决策。
enum OverlapDecision {
    /// 字幕胜出（丢弃 ASR 重叠）
    SubtitleWins,
    /// 保留核对段（置信度：Some=标记 / None=未知——不触发低置信过滤）
    KeepReview(Option<f32>),
}

/// 重叠校对决策（纯函数）：返回保留核对段时的置信度（SubtitleWins=丢弃 ASR）。
///
/// @ai-context: 决策链：① sim ≥ 阈值（≈旧 ≤2 规则）→ 字幕胜；
///              ② 双源显式置信度且加权开启——双低 → 低置信核对段；
///              P(字幕) ≥ P(ASR) → 字幕胜；否则 ASR 核对段（confidence=ASR 置信度）；
///              ③ 置信度缺失 → 旧硬规则兜底（距离>2 → 核对段，confidence=None——
///              审查修复：未知≠低置信，防 note_filter 低置信规则误删核对段）。
fn decide_overlap(
    sub: &SubtitleSegment,
    asr_seg: &TranscriptSegment,
    asr_text: &str,
    config: &FusionConfig,
) -> OverlapDecision {
    let sub_text = sub.text.trim();
    let distance = levenshtein(asr_text, sub_text);
    let max_len = asr_text.chars().count().max(sub_text.chars().count());
    let sim = if max_len == 0 {
        1.0
    } else {
        1.0 - distance as f32 / max_len as f32
    };
    // ① 高相似（≈编辑距离 ≤2 旧规则）：字幕权威胜出
    if sim >= SIM_MATCH_THRESHOLD {
        return OverlapDecision::SubtitleWins;
    }
    // ② 概率加权（双源显式置信度）
    if config.probability_weighted {
        if let (Some(conf_s), Some(conf_a)) = (sub.confidence, asr_seg.confidence) {
            let conf_s = conf_s.clamp(0.0, 1.0);
            let conf_a = conf_a.clamp(0.0, 1.0);
            // 双源低置信 → 低置信核对段（B3 标记，人工可复核）
            if conf_s < LOW_CONFIDENCE && conf_a < LOW_CONFIDENCE {
                return OverlapDecision::KeepReview(Some(conf_s.min(conf_a)));
            }
            // 概率比较：字幕权威性随相似度增强；ASR 需高相似度支撑
            let p_sub = conf_s * (0.6 + 0.4 * sim);
            let p_asr = conf_a * (0.4 + 0.6 * sim);
            if p_sub >= p_asr {
                return OverlapDecision::SubtitleWins; // 字幕胜出
            }
            return OverlapDecision::KeepReview(Some(conf_a)); // ASR 更可信 → 保留核对段
        }
    }
    // ③ 兜底：旧硬规则（距离>2 → 保留核对段，置信度原样透传——None=未知）
    if distance > 2 {
        OverlapDecision::KeepReview(asr_seg.confidence)
    } else {
        OverlapDecision::SubtitleWins
    }
}

/// 按时间窗时长占比切分 ASR 文本并产出各窗口段。
///
/// @ai-context: 一个 ASR 句可能跨多个字幕段，产出多个"输出窗口"（空隙补缝 +
///              重叠保留）；旧实现把整句复制到每个窗口导致融合结果文本重复
///              （TD-024 只解决了空隙间复制，空隙与重叠保留间仍重复——
///              会话 8/11 实测同一句连排 2~3 遍）。现统一按各窗口时长占比
///              分配字符数（整除余数归末段），整句只分配一次。
#[allow(clippy::type_complexity)]
fn push_window_segments(
    result: &mut Vec<FusedSegment>,
    windows: &[OutputWindow],
    text: &str,
) {
    let total: u64 = windows.iter().map(|(s, e, _, _, _)| e - s).sum();
    if total == 0 {
        return;
    }
    let chars: Vec<char> = text.chars().collect();
    let mut pos = 0usize;
    let last = windows.len() - 1;
    for (i, (s, e, src, conf, vol)) in windows.iter().enumerate() {
        let take = if i == last {
            chars.len().saturating_sub(pos) // 末段吃掉全部剩余（防整除截断丢字）
        } else {
            ((chars.len() as u64) * (e - s) / total) as usize
        };
        let take = take.min(chars.len().saturating_sub(pos));
        // REQ-111（v0.7.0 M2，CORE-O3）：切分点回退最近标点/空格——
        // 防"今天讲矩"+"阵的特征值"式词破碎（时长占比切分落在词中间）
        let take = if i == last { take } else { adjust_split_boundary(&chars, pos, take) };
        if take > 0 {
            let piece: String = chars[pos..pos + take].iter().collect();
            pos += take;
            result.push(FusedSegment {
                start_ms: *s,
                end_ms: *e,
                text: piece,
                source: *src,
                confidence: *conf,
                // REQ-103：音量随源段透传（ASR 源有值；字幕源 None）
                volume: *vol,
            });
        }
    }
}

/// 切分边界对齐（纯函数，REQ-111 CORE-O3）：从目标切分点向左回退到最近标点/空格。
///
/// @ai-context: 时长占比切分可能落在词中间（"矩阵"被切成"矩"+"阵"）；
///              回退到最近标点/空格（中文句读/英文空白）避免词破碎。
///              回退窗口上限 10 字符（过长回退会压缩前段过短——均衡取舍）；
///              无标点可回退 → 原切分点（保时长占比语义）。
const SPLIT_BACKOFF_MAX: usize = 10;

fn adjust_split_boundary(chars: &[char], pos: usize, take: usize) -> usize {
    if pos + take >= chars.len() || take == 0 {
        return take;
    }
    // 目标切分点（新段首字符）
    let boundary = pos + take;
    let backoff = (1..=SPLIT_BACKOFF_MAX.min(boundary - pos)).find(|&k| {
        let c = chars[boundary - k];
        c.is_whitespace() || "，。！？；：、,.!?;:'\"“”‘’（）()…—《》【】[]".contains(c)
    });
    match backoff {
        // 回退后至少留 1 字符给前段（防前段空）
        Some(k) if take > k => take - k,
        _ => take,
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
