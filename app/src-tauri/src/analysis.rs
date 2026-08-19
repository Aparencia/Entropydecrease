//! 会话结构化分析编排（REQ-044/045/046 / v0.5.0 M2）。
//!
//! @ai-context: 课后精修路径——会话结束后对 SessionDetail（segments + ocr_blocks）
//!              运行档案支撑机制（章节检测/重点标注/术语表/说话人切换），
//!              产出结构化分析供前端展示与 M7 产物体系消费。
//! @ai-context: 静态结构重建（无时序红利）：实时链路的帧切换/长静音事件未落库，
//!              用 OCR 块文本出现（新文字=画面切换近似）与段间 gap（>2s=长静音近似）
//!              替代——与文件导入路径同口径（标注来源近似，避免期望落差）。
//! @ai-context: 说话人变化（A3）：无 embedding 数据 → 返回空事件（访谈/会议档案
//!              降级为无讲者标注形态）；embedding 提取接入留 V1.0（模型分发 G4）。

use crate::chapter_detect::{detect_chapters, ChapterBoundary, ChapterSignal, DEFAULT_MIN_VOTES};
use crate::glossary::{
    glossary_candidates_opt, GlossaryCandidate, GlossaryOptions,
};
use crate::highlight_detect::{detect_highlights, HighlightCandidate, OcrBlockInput, SegmentInput};
use crate::practice_detect::{detect_practice_points, PracticeDetectConfig, PracticePoint};
use crate::speaker_change::SpeakerChangeEvent;
use crate::symbol_normalize::{normalize as normalize_symbols, SymbolNormalizeConfig};
use crate::types::SessionDetail;
use crate::verbal_normalize::{normalize, NormalizeConfig, NormalizeStrength};
use crate::video_profile::ProfileKind;
use crate::watermark_filter::{detect_watermarks, WatermarkConfig, WatermarkInput};

/// 分析窗口时长（ms）：章节话题聚合粒度（30s 窗口对网课话题粒度合理）。
const WINDOW_MS: u64 = 30_000;
/// 长静音近似：段间 gap 超过该值视为长静音（端点判定尾静音 1.2-2.4s，取 3s 保守）。
const LONG_SILENCE_GAP_MS: u64 = 3_000;

/// 书面化加工版段（可逆：原料层 SessionDetail.segments 保持原文，产物层只读加工版）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct NormalizedSegment {
    /// 原文段 id（回指原料层）
    pub segment_id: i64,
    pub start_ms: u64,
    /// 书面化加工文本（B5：语气词/重复/标点）
    pub text: String,
}

/// 会话结构化分析结果（一次分析全部机制输出）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SessionAnalysis {
    /// 章节边界（网课档案）
    pub chapters: Vec<ChapterBoundary>,
    /// 重点候选（口播/网课/实操档案）
    pub highlights: Vec<HighlightCandidate>,
    /// 术语候选（OCR 高频 × ASR 低频；网课档案）
    pub glossary: Vec<GlossaryCandidate>,
    /// 说话人切换事件（访谈/会议；无 embedding 数据时空——降级形态）
    pub speaker_changes: Vec<SpeakerChangeEvent>,
    /// 练习段（M4/REQ-070：长静音×画面静止同窗——实操档案产物模板消费）
    pub practice_points: Vec<PracticePoint>,
    /// 书面化加工版段（口播/网课档案；原文保留在原料层——可逆）
    pub normalized_segments: Vec<NormalizedSegment>,
}

/// 会话结构化分析（纯函数，向后兼容入口）：SessionDetail → 各机制输出聚合。
///
/// @ai-context: 等价于 analyze_session_opt(..., &SymbolNormalizeConfig::default())
///              ——v0.5.0 行为零回归（符号映射内置默认）。
pub fn analyze_session(detail: &SessionDetail, profile: ProfileKind) -> SessionAnalysis {
    analyze_session_opt(detail, profile, &SymbolNormalizeConfig::default())
}

/// 会话结构化分析（精化版，REQ-060/061 接入）：
/// 章节检测输入为 30s 聚合窗口（文本话题 + 近似信号）；
/// 重点标注输入为段文本 + OCR 块（volume=None 不参与骤变）；
/// 术语表输入为 OCR 文本 × ASR 文本——水印词排除（REQ-059 输出）+ TF-IDF
/// 文档频率加权（REQ-061；文档 = 单条 OCR 块，会话内代理，机制支持跨会话）；
/// 书面化加工版段 = 语气词/重复/标点（B5）+ 口语符号规范化（REQ-060）。
/// @ai-context: 按档案后处理规则集开关门控（REQ-043：章节检测=网课、
///              术语表=网课、说话人=访谈/会议；重点标注=口播/网课/实操全开）。
pub fn analyze_session_opt(
    detail: &SessionDetail,
    profile: ProfileKind,
    symbol_cfg: &SymbolNormalizeConfig,
) -> SessionAnalysis {
    let rules = crate::video_profile::profile_by_kind(profile).postprocess_rules;
    let segments = &detail.segments;
    let ocr_blocks = &detail.ocr_blocks;

    // ── 章节检测（C1）：30s 窗口聚合（网课档案开关）──
    // REQ-108（v0.7.0 M1.5）：优先消费 session_events 真实信号（帧切换/长静音），
    // 无事件数据的旧会话回退 OCR/gap 近似（build_chapter_signals，零回归）
    let chapters = if rules.chapter_detect {
        let events = detail.events.clone();
        if events.is_empty() {
            detect_chapters(&build_chapter_signals(segments, ocr_blocks), DEFAULT_MIN_VOTES)
        } else {
            detect_chapters(&build_chapter_signals_with_events(segments, &events), DEFAULT_MIN_VOTES)
        }
    } else {
        Vec::new()
    };

    // ── 重点标注（C2）：段 + OCR 块（口播/网课/实操档案开关）──
    // REQ-103（v0.7.0 M1）：SegmentInput.volume 由落库 volume 列提供
    // （实时链路段 RMS 聚合；旧数据 None=未知，不参与骤变信号）
    let highlights = if rules.highlight {
        let seg_inputs: Vec<SegmentInput> = segments
            .iter()
            .map(|s| SegmentInput { start_ms: s.start_ms, text: s.text.clone(), volume: s.volume })
            .collect();
        let ocr_inputs: Vec<OcrBlockInput> = ocr_blocks
            .iter()
            .filter(|b| b.region == "full") // 字幕区不参与画面要点（独立管线）
            .map(|b| OcrBlockInput { timestamp_ms: b.timestamp_ms, text: b.text.clone() })
            .collect();
        detect_highlights(&seg_inputs, &ocr_inputs)
    } else {
        Vec::new()
    };

    // ── 术语表（C3 精化，REQ-061）：OCR 高频 × ASR 低频交叉（网课档案开关）──
    let glossary = if rules.glossary {
        let ocr_texts: Vec<&str> = ocr_blocks.iter().map(|b| b.text.as_str()).collect();
        let asr_texts: Vec<&str> = segments
            .iter()
            .filter(|s| s.source == "asr" || s.source == "fused")
            .map(|s| s.text.as_str())
            .collect();
        // 水印词排除（REQ-059：区域稳定性+文本不变性 → 角标台标不进术语统计）
        let watermark_inputs: Vec<WatermarkInput> = ocr_blocks
            .iter()
            .filter(|b| b.region == "full")
            .map(|b| WatermarkInput {
                text: b.text.clone(),
                timestamp_ms: b.timestamp_ms,
                region_key: None,
            })
            .collect();
        let watermarks = detect_watermarks(&watermark_inputs, &WatermarkConfig::default());
        // TF-IDF 文档频率（文档 = 单条 OCR 块；会话内代理——降通用词）
        let total_docs = ocr_blocks.len().max(1);
        let mut df: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for b in ocr_blocks {
            let mut seen = std::collections::HashSet::new();
            for token in crate::glossary::tokens_of(&b.text) {
                if seen.insert(token.clone()) {
                    *df.entry(token).or_insert(0) += 1;
                }
            }
        }
        let opts = GlossaryOptions {
            watermark_exclude: watermarks.texts,
            df: Some(df),
            total_docs,
            ..Default::default()
        };
        glossary_candidates_opt(&ocr_texts, &asr_texts, 3, 2, &opts)
    } else {
        Vec::new()
    };

    // ── 说话人切换（A3，REQ-102 诚实降级 v0.7.0 M1）──
    // 无 embedding 数据（模型分发留 V1.0，G4）→ 恒空。
    // 此前调用 detect_speaker_changes(&[]) 恒返回空 = 空转死代码（REQ-099
    // POST-D1 悬空治理决策：移除空转，显式空列表 + 不可用注释——期望落差消除，
    // 接线随 V1.0 模型分发波）；speaker_detect 规则开关保留（档案声明，未来接线）。
    let speaker_changes: Vec<SpeakerChangeEvent> = Vec::new();

    // ── 练习段（M4/REQ-070）：长静音×画面静止同窗（全档案计算——
    //    产物模板按档案消费：实操 StepCard 之间插练习点标记）──
    let practice_points = detect_practice_points(segments, ocr_blocks, &PracticeDetectConfig::default());

    // ── 口语书面化（B5 + REQ-060）：加工版段（口播/网课档案开关；Light 档保守保真）──
    let normalized_segments = if rules.verbal_normalize {
        let cfg = NormalizeConfig { strength: NormalizeStrength::Light };
        segments
            .iter()
            .filter(|s| !s.text.trim().is_empty())
            .map(|s| NormalizedSegment {
                segment_id: s.id,
                start_ms: s.start_ms,
                // B5 语气词/重复/标点 → REQ-060 口语符号规范化（产物层只读加工版）
                text: normalize_symbols(&normalize(&s.text, &cfg), symbol_cfg),
            })
            .collect()
    } else {
        Vec::new()
    };

    SessionAnalysis {
        chapters,
        highlights,
        glossary,
        speaker_changes,
        practice_points,
        normalized_segments,
    }
}

/// 聚合章节检测信号（纯函数）：段 → 30s 窗口，OCR 新文字=画面切换近似，gap=长静音近似。
///
/// @ai-context: 窗口翻转时比较前后窗口 OCR 文本集合（新文字出现 = 画面切换近似）；
///              窗口内存在段间 gap ≥ LONG_SILENCE_GAP_MS → long_silence。
fn build_chapter_signals(
    segments: &[crate::types::SessionSegment],
    ocr_blocks: &[crate::types::SessionOcrBlock],
) -> Vec<ChapterSignal> {
    if segments.is_empty() {
        return Vec::new();
    }
    // ① 按 30s 窗口聚合段文本与 OCR 文本集合
    let mut windows: Vec<(u64, String, std::collections::HashSet<String>, bool)> = Vec::new();
    let mut window_start = segments[0].start_ms / WINDOW_MS * WINDOW_MS;
    let mut text = String::new();
    let mut ocr_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut has_long_silence = false;
    let mut prev_end: Option<u64> = None;

    let mut seg_iter = segments.iter().peekable();
    let mut ocr_iter = ocr_blocks.iter().filter(|b| b.region == "full").peekable();
    loop {
        let next_ms = match (seg_iter.peek(), ocr_iter.peek()) {
            (Some(s), Some(o)) => s.start_ms.min(o.timestamp_ms),
            (Some(s), None) => s.start_ms,
            (None, Some(o)) => o.timestamp_ms,
            (None, None) => break,
        };
        if next_ms >= window_start + WINDOW_MS {
            if !text.is_empty() {
                windows.push((window_start, text.clone(), std::mem::take(&mut ocr_set), has_long_silence));
            }
            window_start = next_ms / WINDOW_MS * WINDOW_MS;
            text.clear();
            has_long_silence = false;
            prev_end = None;
        }
        let take_seg = match (seg_iter.peek(), ocr_iter.peek()) {
            (Some(s), Some(o)) => s.start_ms <= o.timestamp_ms,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (None, None) => false,
        };
        if take_seg {
            let s = seg_iter.next().unwrap();
            if !text.is_empty() {
                text.push('\n');
            }
            text.push_str(&s.text);
            if let Some(pe) = prev_end {
                if s.start_ms.saturating_sub(pe) >= LONG_SILENCE_GAP_MS {
                    has_long_silence = true;
                }
            }
            prev_end = Some(s.end_ms);
        } else {
            let o = ocr_iter.next().unwrap();
            let t = o.text.trim().to_string();
            if !t.is_empty() {
                ocr_set.insert(t);
            }
        }
    }
    if !text.is_empty() {
        windows.push((window_start, text, ocr_set, has_long_silence));
    }

    // ② 窗口 → 信号：OCR 文本集合相对上一窗口有新增 → frame_switched 近似
    let mut signals = Vec::with_capacity(windows.len());
    let mut prev_ocr: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (start, text, ocr_set, long_silence) in windows {
        // 新文字 = 画面切换（集合差非空）；空集合窗口不触发（无画面证据）
        let frame_switched = !ocr_set.is_empty() && !ocr_set.is_subset(&prev_ocr);
        prev_ocr = ocr_set;
        signals.push(ChapterSignal { time_ms: start, frame_switched, long_silence, text });
    }
    signals
}

/// 聚合章节检测信号（事件版，REQ-108 / v0.7.0 M1.5）：
/// 消费 session_events 真实信号（frame_switch/long_silence）替代 OCR/gap 近似。
///
/// @ai-context: 30s 窗口聚合——窗口内存在真实帧切换事件 → frame_switched；
///              存在真实长静音事件 → long_silence；文本信号仍来自段（话题重合度）。
///              POST-D3 修复：实时链路的真实事件不再丢失（此前 OCR 近似
///              依赖"新文字出现"——播放器时间码/UI 变化不产生新文字，漏检）。
fn build_chapter_signals_with_events(
    segments: &[crate::types::SessionSegment],
    events: &[crate::session_events::SessionEvent],
) -> Vec<ChapterSignal> {
    if segments.is_empty() {
        return Vec::new();
    }
    // 按 30s 窗口聚合：文本 + 帧切换标志 + 长静音标志
    let mut windows: Vec<(u64, String, bool, bool)> = Vec::new();
    let mut window_start = segments[0].start_ms / WINDOW_MS * WINDOW_MS;
    let mut text = String::new();
    let mut frame_switched = false;
    let mut long_silence = false;
    let mut seg_iter = segments.iter().peekable();
    let mut ev_iter = events.iter().peekable();
    loop {
        let next_ms = match (seg_iter.peek(), ev_iter.peek()) {
            (Some(s), Some(e)) => s.start_ms.min(e.timestamp_ms),
            (Some(s), None) => s.start_ms,
            (None, Some(e)) => e.timestamp_ms,
            (None, None) => break,
        };
        if next_ms >= window_start + WINDOW_MS {
            if !text.is_empty() {
                windows.push((window_start, std::mem::take(&mut text), frame_switched, long_silence));
                frame_switched = false;
                long_silence = false;
            }
            window_start = next_ms / WINDOW_MS * WINDOW_MS;
        }
        let take_seg = match (seg_iter.peek(), ev_iter.peek()) {
            (Some(s), Some(e)) => s.start_ms <= e.timestamp_ms,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (None, None) => false,
        };
        if take_seg {
            let s = seg_iter.next().unwrap();
            if !text.is_empty() {
                text.push('\n');
            }
            text.push_str(&s.text);
        } else {
            let e = ev_iter.next().unwrap();
            match e.kind {
                crate::session_events::EventKind::FrameSwitch => frame_switched = true,
                crate::session_events::EventKind::LongSilence => long_silence = true,
                _ => {}
            }
        }
    }
    if !text.is_empty() {
        windows.push((window_start, text, frame_switched, long_silence));
    }
    windows
        .into_iter()
        .map(|(start, text, frame_switched, long_silence)| {
            ChapterSignal { time_ms: start, frame_switched, long_silence, text }
        })
        .collect()
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "analysis_tests.rs"]
mod tests;
