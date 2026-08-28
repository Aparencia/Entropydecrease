//! 章节级混合形态组装（v0.14 D1 chapter_note；纯函数——图文章节/口语章节混编）。
//!
//! @ai-context: spec §4.1——章节级混合形态：每章独立形态决策（decide_chapter_morph：
//!              OCR 密度 ≥ 0.3 && 质量 ≥ 0.6 → 图文，否则口语）→ 图文章节 =
//!              OCR 屏段落为主体 + 该章口语降级为 `> 讲者：...` 引用块（保留
//!              时间戳锚点）；口语章节 = 现状段落（零回归）。
//! @ai-context: 质量门控（spec §2.2 双出口）：质量 < QUALITY_TH 的章节 OCR
//!              弃用（退回口语现状——低质量不沉淀）。门控内建于组装——笔记
//!              出口（markdown）与 AI 出口（markdown 派生）同源同控。
//! @ai-context: 组装输入全部为净化后产物（口语段/OCR 屏卡由 note_filter 提供；
//!              质量分由调用方从原料 OCR 块聚合——chapter_quality_scores）；
//!              OCR 屏无文本（纯图屏/新数据 ADR-023）→ 全口语（无 OCR 可组装，
//!              现状零变化）；无章节边界由调用方退回原路径（本层不发明标题）。

use crate::chapter_detect::ChapterBoundary;
use crate::chapter_morph::{decide_chapter_morph, ChapterMorph, MorphInput};
use crate::ocr_quality::{ocr_quality_score, QualityInput};
use crate::outline::OutlineEntry;
use crate::types::{SessionOcrBlock, SessionScreen};

/// 章节标题行（与 structure_note 同格式：`## 名 [⏱ 锚点]`）。
fn heading_line(name: &str, time_ms: u64) -> String {
    format!("## {} [{}]", name, crate::concat::format_timestamp(time_ms))
}

/// 口语段 → 引用块行（`> 讲者：...`；保留时间戳锚点——spec §4.1）。
fn quote_line(start_ms: u64, text: &str, anchor: bool) -> String {
    if anchor {
        format!("> 讲者：{} {}", crate::concat::format_timestamp(start_ms), text)
    } else {
        format!("> 讲者：{}", text)
    }
}

/// 口语段 → 现状段落行（锚点口径与净化管线一致）。
fn speech_line(start_ms: u64, text: &str, anchor: bool) -> String {
    if anchor {
        format!("{} {}", crate::concat::format_timestamp(start_ms), text)
    } else {
        text.to_string()
    }
}

/// 章节级混合形态组装：完整正文行序列（## 标题 + 图文/口语章节内容）。
///
/// @ai-context: 章节窗口按时间归属（口语段 start_ms / OCR 屏 first_seen_ms ∈
///              [边界, 下一边界)）；开场段（首边界前）口语现状——与 structure_note
///              标题插入语义一致（边界落在段内归上一章，不切段）。
/// @param paragraphs 净化后口语段（含锚点时间戳，升序）
/// @param chapters 章节边界（升序——调用方保证）
/// @param outline 大纲标题（章节命名——structure_note 同源复用）
/// @param screens 净化后 OCR 屏卡（body 非空 = 文本屏）
/// @param chapter_quality 每章质量分（与 chapters 同序；调用方聚合）
/// @param anchor 时间戳锚点开关（沿用净化配置）
pub fn assemble_hybrid_note(
    paragraphs: &[(u64, String)],
    chapters: &[ChapterBoundary],
    outline: &[OutlineEntry],
    screens: &[SessionScreen],
    chapter_quality: &[f32],
    anchor: bool,
) -> (Vec<String>, usize) {
    let mut bounds: Vec<&ChapterBoundary> = chapters.iter().collect();
    bounds.sort_by_key(|c| c.time_ms);
    let mut lines: Vec<String> = Vec::new();
    let mut titled = 0;
    // 开场段（首边界前）——口语现状（与 structure_note 语义一致）
    if let Some(first) = bounds.first() {
        for (start, text) in paragraphs.iter().filter(|(start, _)| *start < first.time_ms) {
            lines.push(speech_line(*start, text, anchor));
        }
    }
    for (i, b) in bounds.iter().enumerate() {
        let next_ms = bounds.get(i + 1).map(|n| n.time_ms);
        let (name, is_titled) = crate::structure_note::chapter_name(b, next_ms, outline, i + 1);
        if is_titled {
            titled += 1;
        }
        lines.push(heading_line(&name, b.time_ms));
        // 章窗口口语段与 OCR 文本屏
        let speech: Vec<&(u64, String)> = paragraphs
            .iter()
            .filter(|(start, _)| *start >= b.time_ms && next_ms.is_none_or(|n| *start < n))
            .collect();
        let text_screens: Vec<&SessionScreen> = screens
            .iter()
            .filter(|s| {
                s.first_seen_ms >= b.time_ms
                    && next_ms.is_none_or(|n| s.first_seen_ms < n)
                    && !s.body.is_empty()
            })
            .collect();
        let speech_chars: usize = speech.iter().map(|(_, t)| t.chars().count()).sum();
        let ocr_chars: usize = text_screens
            .iter()
            .map(|s| s.body.iter().map(|l| l.chars().count()).sum::<usize>())
            .sum();
        let quality = chapter_quality.get(i).copied().unwrap_or(0.0);
        let morph = decide_chapter_morph(&MorphInput {
            ocr_chars,
            transcript_chars: speech_chars,
            quality,
        });
        if morph == ChapterMorph::Graphic && !text_screens.is_empty() {
            // 图文章节：OCR 屏段落为主体 + 口语引用块
            for s in &text_screens {
                if let Some(t) = &s.title {
                    lines.push(format!("**{}**", t));
                }
                lines.extend(s.body.iter().cloned());
            }
            for (start, text) in &speech {
                lines.push(quote_line(*start, text, anchor));
            }
        } else {
            // 口语章节：现状段落（低质量 OCR 弃用——门控内建）
            for (start, text) in &speech {
                lines.push(speech_line(*start, text, anchor));
            }
        }
    }
    (lines, titled)
}

/// 章节质量聚合（纯函数）：按章节窗口从原料 OCR 块计算质量分（与 chapters
/// 同序；空窗口 → 0.0——空章节按最低分处理，OCR 弃用宁缺毋滥，spec §5）。
///
/// @ai-context: 近似口径——调用方传**净化后**块可得精确分；本函数接受原料块
///              （junk/低分块压分 → 门控更严，宁缺毋滥符合 spec 哲学）；无
///              行合并上下文时 merged_lines 取块文本（块即行保守近似）。
pub fn chapter_quality_scores(
    chapters: &[ChapterBoundary],
    blocks: &[SessionOcrBlock],
) -> Vec<f32> {
    let mut bounds: Vec<&ChapterBoundary> = chapters.iter().collect();
    bounds.sort_by_key(|c| c.time_ms);
    bounds
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let next_ms = bounds.get(i + 1).map(|n| n.time_ms);
            let window: Vec<&SessionOcrBlock> = blocks
                .iter()
                .filter(|bl| {
                    bl.region == "full"
                        && bl.timestamp_ms >= b.time_ms
                        && next_ms.is_none_or(|n| bl.timestamp_ms < n)
                })
                .collect();
            if window.is_empty() {
                return 0.0;
            }
            let scores: Vec<f32> = window.iter().map(|bl| bl.score).collect();
            let texts: Vec<String> = window.iter().map(|bl| bl.text.clone()).collect();
            ocr_quality_score(&QualityInput {
                scores: &scores,
                texts: &texts,
                junk_hits: 0,
                merged_lines: &texts,
            })
        })
        .collect()
}

#[cfg(test)]
#[path = "chapter_note_tests.rs"]
mod tests;
