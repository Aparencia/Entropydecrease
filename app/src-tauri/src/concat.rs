//! 内容本地拼接（REQ-003）：把 ASR 转写段与 OCR 画面块纯本地拼接为 Markdown 笔记初稿。
//!
//! @ai-context: 这是"本地优先"的降级路径——不依赖任何 LLM，用规则把提取结果组织成可读笔记。
//! @ai-context: 全部为纯函数（无副作用、无 IO），可安全并发调用与独立单测。
//! @ai-context: 上游为 asr.rs / ocr.rs 的产物，下游为笔记模块（db.rs / commands.rs）。

use crate::types::{NoteDraft, OcrBlock, TranscriptSegment};

/// 单个转写段落的最大字符数（超过则切段，避免一段过长影响阅读）。
const PARAGRAPH_MAX_CHARS: usize = 120;
/// 单个转写段落的最大时间跨度（毫秒），超过则切段。
const PARAGRAPH_MAX_SPAN_MS: u64 = 60_000;
/// OCR 块纳入笔记的最低置信度（低于此值视为噪声丢弃）。
const OCR_MIN_SCORE: f32 = 0.5;

/// 拼接主入口：转写段 + OCR 块 → 笔记初稿。
///
/// @ai-context: 纯函数。segments/ocr_blocks 顺序无关（内部会排序），可安全重复调用。
/// @param title - 笔记标题
/// @param segments - ASR 转写段列表
/// @param ocr_blocks - OCR 画面识别块列表
/// @returns 组装好的 NoteDraft（含分段转写、去重画面要点与 Markdown 全文）
pub fn build_note_draft(
    title: &str,
    segments: &[TranscriptSegment],
    ocr_blocks: &[OcrBlock],
) -> NoteDraft {
    let transcript_paragraphs = split_transcript_paragraphs(segments);
    let ocr_points = dedupe_ocr_points(ocr_blocks);
    let markdown = assemble_markdown(title, &transcript_paragraphs, &ocr_points);
    NoteDraft {
        title: title.to_string(),
        transcript_paragraphs,
        ocr_points,
        markdown,
    }
}

/// 把转写段按"字符数 + 时间跨度"双阈值切成可读段落。
///
/// @ai-context: 空文本段被跳过；按 start_ms 排序后再累积，保证输出稳定。
fn split_transcript_paragraphs(segments: &[TranscriptSegment]) -> Vec<String> {
    let mut sorted: Vec<&TranscriptSegment> =
        segments.iter().filter(|s| !s.text.trim().is_empty()).collect();
    sorted.sort_by_key(|s| s.start_ms);

    let mut paragraphs = Vec::new();
    let mut current = String::new();
    let mut span_start: Option<u64> = None;

    for seg in sorted {
        let span_exceeded = match span_start {
            Some(start) => seg.end_ms.saturating_sub(start) > PARAGRAPH_MAX_SPAN_MS,
            None => false,
        };
        let char_exceeded = current.chars().count() + seg.text.chars().count() > PARAGRAPH_MAX_CHARS;

        if !current.is_empty() && (span_exceeded || char_exceeded) {
            paragraphs.push(current.trim().to_string());
            current = String::new();
            span_start = None;
        }
        if span_start.is_none() {
            span_start = Some(seg.start_ms);
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(seg.text.trim());
    }
    if !current.trim().is_empty() {
        paragraphs.push(current.trim().to_string());
    }
    paragraphs
}

/// OCR 块去重 + 过滤低置信度 + 按时间排序，输出带时间戳前缀的要点列表。
///
/// @ai-context: 去重按 trim 后的文本精确匹配（保留首次出现）；无时间戳的块排在末尾。
fn dedupe_ocr_points(ocr_blocks: &[OcrBlock]) -> Vec<String> {
    let mut sorted: Vec<&OcrBlock> = ocr_blocks
        .iter()
        .filter(|b| b.score >= OCR_MIN_SCORE && !b.text.trim().is_empty())
        .collect();
    // None 时间戳排最后（u64::MAX 作为哨兵）
    sorted.sort_by_key(|b| b.timestamp_ms.unwrap_or(u64::MAX));

    let mut seen = std::collections::HashSet::new();
    let mut points = Vec::new();
    for block in sorted {
        let text = block.text.trim().to_string();
        if seen.insert(text.clone()) {
            match block.timestamp_ms {
                Some(ms) => points.push(format!("[{}] {}", format_timestamp(ms), text)),
                None => points.push(text),
            }
        }
    }
    points
}

/// 毫秒时间戳格式化为 MM:SS。
fn format_timestamp(ms: u64) -> String {
    let total_seconds = ms / 1000;
    format!("{:02}:{:02}", total_seconds / 60, total_seconds % 60)
}

/// 组装 Markdown 全文。
fn assemble_markdown(title: &str, paragraphs: &[String], ocr_points: &[String]) -> String {
    let mut md = String::new();
    md.push_str(&format!("# {}\n", title));

    if !paragraphs.is_empty() {
        md.push_str("\n## 讲述内容\n\n");
        for p in paragraphs {
            md.push_str(p);
            md.push_str("\n\n");
        }
    }
    if !ocr_points.is_empty() {
        md.push_str("## 画面要点\n\n");
        for point in ocr_points {
            md.push_str(&format!("- {}\n", point));
        }
    }
    md.trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(start: u64, end: u64, text: &str) -> TranscriptSegment {
        TranscriptSegment { start_ms: start, end_ms: end, text: text.to_string() }
    }
    fn ocr(ts: Option<u64>, text: &str, score: f32) -> OcrBlock {
        OcrBlock { timestamp_ms: ts, text: text.to_string(), score, bbox: None }
    }

    #[test]
    fn empty_input_yields_title_only() {
        // Arrange & Act
        let draft = build_note_draft("空会话", &[], &[]);
        // Assert
        assert_eq!(draft.title, "空会话");
        assert!(draft.transcript_paragraphs.is_empty());
        assert!(draft.ocr_points.is_empty());
        assert_eq!(draft.markdown, "# 空会话");
    }

    #[test]
    fn transcript_only_produces_paragraphs() {
        // Arrange
        let segments = vec![seg(0, 5000, "今天讲熵减"), seg(5000, 10000, "的概念")];
        // Act
        let draft = build_note_draft("物理课", &segments, &[]);
        // Assert
        assert_eq!(draft.transcript_paragraphs.len(), 1);
        assert!(draft.markdown.contains("## 讲述内容"));
        assert!(draft.markdown.contains("今天讲熵减 的概念"));
        assert!(!draft.markdown.contains("## 画面要点"));
    }

    #[test]
    fn ocr_only_produces_points() {
        // Arrange
        let blocks = vec![ocr(Some(3000), "牛顿第二定律", 0.9)];
        // Act
        let draft = build_note_draft("截图", &[], &blocks);
        // Assert
        assert_eq!(draft.ocr_points, vec!["[00:03] 牛顿第二定律".to_string()]);
        assert!(draft.markdown.contains("## 画面要点"));
        assert!(!draft.markdown.contains("## 讲述内容"));
    }

    #[test]
    fn mixed_input_contains_both_sections() {
        // Arrange
        let segments = vec![seg(0, 4000, "讲解公式")];
        let blocks = vec![ocr(Some(2000), "F=ma", 0.95)];
        // Act
        let draft = build_note_draft("混合", &segments, &blocks);
        // Assert
        assert!(draft.markdown.contains("## 讲述内容"));
        assert!(draft.markdown.contains("## 画面要点"));
        assert!(draft.markdown.contains("F=ma"));
    }

    #[test]
    fn long_transcript_splits_into_paragraphs() {
        // Arrange：超过 60 秒跨度的两段应被切开
        let segments = vec![seg(0, 30_000, "前半段内容"), seg(70_000, 90_000, "后半段内容")];
        // Act
        let draft = build_note_draft("分段", &segments, &[]);
        // Assert
        assert_eq!(draft.transcript_paragraphs.len(), 2);
    }

    #[test]
    fn duplicate_ocr_is_deduped() {
        // Arrange：重复文本只保留首次
        let blocks = vec![
            ocr(Some(1000), "重复要点", 0.9),
            ocr(Some(5000), "重复要点", 0.9),
            ocr(Some(2000), "独特要点", 0.9),
        ];
        // Act
        let draft = build_note_draft("去重", &[], &blocks);
        // Assert
        assert_eq!(draft.ocr_points.len(), 2);
    }

    #[test]
    fn low_score_ocr_is_filtered() {
        // Arrange：低于阈值的 OCR 被丢弃
        let blocks = vec![ocr(Some(1000), "噪声", 0.2), ocr(Some(2000), "有效", 0.9)];
        // Act
        let draft = build_note_draft("过滤", &[], &blocks);
        // Assert
        assert_eq!(draft.ocr_points.len(), 1);
        assert!(draft.ocr_points[0].contains("有效"));
    }

    #[test]
    fn unsorted_segments_are_sorted_by_time() {
        // Arrange：乱序输入应被排序后拼接
        let segments = vec![seg(5000, 9000, "后"), seg(0, 4000, "前")];
        // Act
        let draft = build_note_draft("排序", &segments, &[]);
        // Assert
        assert_eq!(draft.transcript_paragraphs[0], "前 后");
    }

    #[test]
    fn format_timestamp_converts_ms_to_mmss() {
        // Act & Assert
        assert_eq!(format_timestamp(0), "00:00");
        assert_eq!(format_timestamp(63_000), "01:03");
        assert_eq!(format_timestamp(3_600_000), "60:00");
    }
}
