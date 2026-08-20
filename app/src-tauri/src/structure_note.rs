//! 笔记结构渲染层（REQ-177/178/179/180 / v0.7.6）。
//!
//! @ai-context: 纯本地"结构组织"——章节边界入笔记（## 标题层级）+ 术语表入笔记
//!              （## 词汇表 块）。v0.7.5 裁决缓做、本版落地；与 v0.8.0 AI 精修
//!              （REQ-141）并存：本层是规则版结构生成，AI 版将来以结构块数组
//!              重写本层输出（精修=整理不创作，语义不变）。
//! @ai-context: 叠加在 note_filter **之后**（方案 B：独立渲染层）——filter_note
//!              过滤链零改动零回归；预览/落库双出口同口径由命令层调用顺序保证。
//! @ai-context: 诚实降级：无章节（口播档案）不插标题；无术语不出词汇表；配置
//!              全关原样返回。边界落在段内不切段（粗粒度边界，不伪造粒度）。
//! @ai-context: 纯函数无 IO；段落切分复用 concat 口径（与净化管线同一阈值）；
//!              章节名取窗口内 outline 标题（OCR 大字块/屏标题，REQ-077 复用）。

use crate::chapter_detect::ChapterBoundary;
use crate::glossary::GlossaryCandidate;
use crate::note_filter::NoteFilterResult;
use crate::outline::OutlineEntry;
use crate::types::TranscriptSegment;

/// 结构渲染配置（REQ-179：并入 purify_config.json 可校准，partial 覆盖语义）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NoteStructureConfig {
    /// 章节标题入笔记（## 层级；默认 true）
    pub chapter_headings: bool,
    /// 词汇表块（## 词汇表；默认 true）
    pub glossary_block: bool,
    /// 词汇表条目上限（防噪音；默认 20）
    pub glossary_max_terms: usize,
}

impl Default for NoteStructureConfig {
    fn default() -> Self {
        Self {
            chapter_headings: true,
            glossary_block: true,
            glossary_max_terms: 20,
        }
    }
}

/// 结构渲染统计（REQ-180：并入 purify_stats 落库 JSON——可回答"笔记带多少结构"）。
#[derive(Debug, Clone, Copy, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct StructureStats {
    /// 插入的章节标题数
    pub chapters: usize,
    /// 有 outline 标题命中的章节数（其余为"章节 N"占位）
    pub titled_chapters: usize,
    /// 词汇表条目数
    pub glossary_terms: usize,
}

/// 结构渲染主入口（纯函数）：章节边界 → ## 标题；术语候选 → 词汇表块。
///
/// @ai-context: 不改变 kept/ocr_screens/filtered 等载荷，只重写 markdown 与
///              stats——净化可逆原则延续（原料层不动，结构可手动删）。
/// @ai-context: 全关（chapter_headings=false && glossary_block=false）原样返回
///              零统计——v0.7.5 输出逐字节一致（零回归护栏）。
pub fn render_note_structure(
    result: &mut NoteFilterResult,
    chapters: &[ChapterBoundary],
    outline: &[OutlineEntry],
    glossary: &[GlossaryCandidate],
    config: &NoteStructureConfig,
) -> StructureStats {
    let mut stats = StructureStats::default();
    if !config.chapter_headings && !config.glossary_block {
        return stats;
    }
    // ① 段落切分（与净化管线同口径——concat 阈值；kept 段按时间排序保证稳定性）
    let transcript: Vec<TranscriptSegment> = result
        .kept
        .iter()
        .map(|s| TranscriptSegment {
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text.clone(),
            word_timestamps: None,
            confidence: None,
            volume: None,
        })
        .collect();
    let mut paragraphs: Vec<(u64, String)> =
        crate::concat::split_transcript_paragraphs_with(
            &transcript,
            result.purify.paragraph_max_chars,
            result.purify.paragraph_max_span_ms,
        );
    // ② 章节标题插入（REQ-177）：边界 → 第一个 start_ms ≥ 边界的段前插入
    //    （边界落在段内 = 该段归上一章，跨边界段不切——粗粒度诚实标注）
    let mut titled = 0;
    if config.chapter_headings && !chapters.is_empty() {
        let mut boundaries: Vec<&ChapterBoundary> = chapters.iter().collect();
        boundaries.sort_by_key(|c| c.time_ms);
        // 从后往前插入——索引不漂移
        for (i, b) in boundaries.iter().enumerate().rev() {
            let (name, is_titled) =
                chapter_name(b, boundaries.get(i + 1).map(|n| n.time_ms), outline, i + 1);
            if is_titled {
                titled += 1;
            }
            let heading = format!("## {} [{}]", name, crate::concat::format_timestamp(b.time_ms));
            let insert_at = paragraphs
                .iter()
                .position(|(start, _)| *start >= b.time_ms)
                .unwrap_or(paragraphs.len());
            paragraphs.insert(insert_at, (b.time_ms, heading));
        }
        stats.chapters = boundaries.len();
        stats.titled_chapters = titled;
    }
    // ③ 组装正文（锚点口径与净化管线一致——标题行以 "## " 开头不再加锚点）
    let lines: Vec<String> = paragraphs
        .iter()
        .map(|(start, text)| {
            if text.starts_with("## ") {
                text.clone()
            } else if result.purify.anchor_timestamps {
                format!("[{}] {}", crate::concat::format_timestamp(*start), text)
            } else {
                text.clone()
            }
        })
        .collect();
    let mut md = crate::concat::assemble_markdown(&result.title, &lines, &result.ocr_points);
    // ④ 词汇表块（REQ-178）：score 降序取前 max_terms；锚点=术语在 kept 段首次出现
    if config.glossary_block && !glossary.is_empty() {
        let mut gs: Vec<&GlossaryCandidate> = glossary.iter().collect();
        gs.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        let mut rows: Vec<String> = Vec::new();
        for g in gs.iter().take(config.glossary_max_terms.max(1)) {
            let anchor = first_occurrence_ms(&result.kept, &g.term);
            match anchor {
                Some(ms) => rows.push(format!(
                    "- [{}] {}（画面 ×{} / 语音 ×{}）",
                    crate::concat::format_timestamp(ms),
                    g.term,
                    g.ocr_count,
                    g.asr_count
                )),
                None => rows.push(format!("- {}（画面 ×{} / 语音 ×{}）", g.term, g.ocr_count, g.asr_count)),
            }
        }
        md.push_str("\n\n## 词汇表\n\n");
        md.push_str(&rows.join("\n"));
        stats.glossary_terms = rows.len();
    }
    // ⑤ 会话异常警示行（REQ-170）置顶——与 rebuild_markdown 口径一致
    if let Some(w) = &result.warning {
        md = format!("{}\n\n{}", w, md);
    }
    result.markdown = md;
    // REQ-180：结构统计并入 FilterStats（purify_stats 落库 JSON 同源）
    result.stats.chapters = stats.chapters;
    result.stats.titled_chapters = stats.titled_chapters;
    result.stats.glossary_terms = stats.glossary_terms;
    stats
}

/// 章节名（纯函数）：本边界 → 下一边界窗口内第一个 outline 条目文本；
/// 无命中 → "章节 N" 占位（N 从 1 计）。返回 (名称, 是否标题命中)。
///
/// @ai-context: outline 为 OCR 大字块/屏标题（REQ-077）——章节窗口内的标题
///              大概率是本章节名；窗口外（旧标题残留）不取。
fn chapter_name(
    boundary: &ChapterBoundary,
    next_time_ms: Option<u64>,
    outline: &[OutlineEntry],
    index: usize,
) -> (String, bool) {
    let hit = outline.iter().find(|e| {
        e.time_ms >= boundary.time_ms && next_time_ms.is_none_or(|next| e.time_ms < next)
    });
    match hit {
        Some(entry) => (entry.text.clone(), true),
        None => (format!("章节 {}", index), false),
    }
}

/// 术语在 kept 段中首次出现时刻（纯函数；无命中 → None——不带锚点不丢行）。
fn first_occurrence_ms(kept: &[crate::types::SessionSegment], term: &str) -> Option<u64> {
    kept.iter()
        .find(|s| s.text.contains(term))
        .map(|s| s.start_ms)
}

#[cfg(test)]
#[path = "structure_note_tests.rs"]
mod tests;
