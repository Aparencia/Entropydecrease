//! OCR 正文过滤链单测（v0.12.0 M1，ADR-021）。
//!
//! @ai-context: AAA 模式；覆盖精简链各环节——来源过滤/置信/排序/去重/空输入，
//!              以及 markdown 组装（"图文提取"标注段）。

use super::*;
use crate::note_body_source::BodySource;
use crate::types::SessionOcrBlock;

fn block(ts: u64, region: &str, text: &str, score: f32) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score,
        region: region.to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }
}

fn env() -> PurifyEnv {
    PurifyEnv::default()
}

fn run(title: &str, blocks: &[SessionOcrBlock]) -> NoteFilterResult {
    filter_note_from_ocr(title, blocks, &env())
}

/// 空输入 → 标题仅 markdown、无正文、无画面要点（不 panic）。
#[test]
fn empty_blocks_produce_title_only() {
    // Act
    let result = run("空会话", &[]);
    // Assert
    assert_eq!(result.markdown, "# 空会话");
    assert!(result.ocr_body.is_empty());
    assert!(result.kept.is_empty());
    assert!(result.ocr_points.is_empty());
    assert_eq!(result.body_source, BodySource::OcrDirect);
}

/// 主路径：多块 → 排序输出 + "图文提取"标注段 + 文本入 markdown。
#[test]
fn blocks_enter_markdown_with_heading() {
    // Arrange：乱序输入（时间戳无序——排序契约）
    let blocks = vec![
        block(2000, "full", "正文要点", 0.88),
        block(1000, "full", "网页标题", 0.92),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：按时间排序输出
    assert_eq!(result.ocr_body, vec!["网页标题".to_string(), "正文要点".to_string()]);
    assert!(result.markdown.contains("## 图文提取"), "应标注图文提取段");
    assert!(result.markdown.contains("网页标题"));
    assert!(result.markdown.contains("正文要点"));
    // 标题在首位
    assert!(result.markdown.starts_with("# 图文会话"));
}

/// 低分块丢弃（<0.5——photo_capture 同口径兜底）。
#[test]
fn low_score_blocks_dropped() {
    // Arrange：一条低分（0.4）+ 一条合格
    let blocks = vec![block(1000, "full", "模糊文字", 0.4), block(2000, "full", "清晰文字", 0.9)];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：仅合格块进入正文
    assert_eq!(result.ocr_body, vec!["清晰文字".to_string()]);
    assert!(!result.markdown.contains("模糊文字"));
}

/// 非 full region 块忽略（subtitle 辅助块不入正文）。
#[test]
fn subtitle_blocks_ignored() {
    // Arrange：subtitle 块 + full 块混排
    let blocks = vec![block(1000, "subtitle", "字幕文字", 0.95), block(2000, "full", "框选文字", 0.9)];
    // Act
    let result = run("图文会话", &blocks);
    // Assert
    assert_eq!(result.ocr_body, vec!["框选文字".to_string()]);
    assert!(!result.markdown.contains("字幕文字"));
}

/// 相邻去重：同文本连续块只保留一个（净化后精确去重契约）。
#[test]
fn adjacent_duplicates_merged() {
    // Arrange：相同文本两块连续（同帧多块重叠检测场景）
    let blocks = vec![block(1000, "full", "重复标题", 0.9), block(1500, "full", "重复标题", 0.85)];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：仅一次
    assert_eq!(result.ocr_body, vec!["重复标题".to_string()]);
    assert_eq!(result.markdown.matches("重复标题").count(), 1);
}

/// 非相邻同文本不合并（中间隔着其他块——语义独立不丢内容）。
#[test]
fn non_adjacent_same_text_kept_twice() {
    // Arrange：同文本但中间隔其他块
    let blocks = vec![
        block(1000, "full", "要点一", 0.9),
        block(2000, "full", "中间内容", 0.9),
        block(3000, "full", "要点一", 0.9),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：三块全保留
    assert_eq!(result.ocr_body.len(), 3);
}

/// 空文本块跳过（trim 后为空）。
#[test]
fn blank_text_blocks_skipped() {
    // Arrange：空白文本 + 有效文本
    let blocks = vec![block(1000, "full", "   ", 0.9), block(2000, "full", "有效文字", 0.9)];
    // Act
    let result = run("图文会话", &blocks);
    // Assert
    assert_eq!(result.ocr_body, vec!["有效文字".to_string()]);
}

/// 纯函数确定性：同输入两次调用输出一致。
#[test]
fn filter_note_from_ocr_is_deterministic() {
    // Arrange
    let blocks = vec![block(1000, "full", "要点", 0.9)];
    // Act：两次调用
    let a = run("标题", &blocks);
    let b = run("标题", &blocks);
    // Assert
    assert_eq!(a.markdown, b.markdown);
    assert_eq!(a, b);
}
