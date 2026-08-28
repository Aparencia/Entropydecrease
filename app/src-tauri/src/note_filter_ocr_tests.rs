//! OCR 正文过滤链单测（v0.12.0 M1，ADR-021）。
//!
//! @ai-context: AAA 模式；覆盖精简链各环节——来源过滤/置信/排序/去重/空输入，
//!              以及 markdown 组装（"图文提取"标注段）。

use super::*;
use crate::note_body_source::BodySource;
use crate::types::{SessionOcrBlock, TextBox};

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

/// 带 bbox 的块（净化链 ① 行合并/③ 增量用）。
fn blk_boxed(ts: u64, text: &str, score: f32, x: f32, y: f32, w: f32, h: f32) -> SessionOcrBlock {
    SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score,
        region: "full".to_string(),
        region_kind: None,
        bbox: Some(TextBox { x, y, w, h }),
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

// ── v0.14 D 净化链（① 行合并 / ③ 跨帧增量）──────────────────────────

/// 净化链 ①：同帧同行相邻块（det 切开）→ 评分器合并为一行。
#[test]
fn same_row_blocks_merge_in_frame() {
    // Arrange：同一逻辑行被 det 切两块（y 同、x 相邻、行高一致）——净化链 ①
    let blocks = vec![
        blk_boxed(1000, "系统是由相互联系的若干要素", 0.9, 100.0, 300.0, 468.0, 40.0),
        blk_boxed(1000, "组成的整体", 0.88, 575.0, 300.0, 180.0, 40.0),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：拼成一行一句（should_merge_lines 几何 3 项全中）
    assert_eq!(result.ocr_body.len(), 1);
    assert_eq!(result.ocr_body[0], "系统是由相互联系的若干要素组成的整体");
}

/// 净化链 ①：同帧不同行（y 差大）不合并。
#[test]
fn distinct_rows_stay_separate_in_frame() {
    // Arrange：两行正文（y 差 80 > 容差 8）
    let blocks = vec![
        blk_boxed(1000, "第一行内容", 0.9, 100.0, 300.0, 300.0, 40.0),
        blk_boxed(1000, "第二行内容", 0.88, 100.0, 380.0, 300.0, 40.0),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：两行分开
    assert_eq!(result.ocr_body.len(), 2);
    assert_eq!(result.ocr_body[0], "第一行内容");
    assert_eq!(result.ocr_body[1], "第二行内容");
}

/// 净化链 ①：句号断开——同帧同行也不合并（反误合并原则）。
#[test]
fn period_terminator_breaks_row_merge() {
    // Arrange：a 尾句号（-3 强断开）：同行 1 + 相邻 1 + 一致 1 - 3 = 0 < 3
    let blocks = vec![
        blk_boxed(1000, "这是完整句子。", 0.9, 100.0, 300.0, 300.0, 40.0),
        blk_boxed(1000, "下一句内容", 0.88, 410.0, 300.0, 200.0, 40.0),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：不合并（不制造跨句幻觉行）
    assert_eq!(result.ocr_body.len(), 2);
}

/// 净化链 ③：后帧 ⊇ 前帧（PPT 动画逐行出现）→ 同屏增量取后帧完整文本。
#[test]
fn incremental_frames_merge_to_latest() {
    // Arrange：帧1 一行、帧2 两行（增量出现——帧2 文本含帧1）；bbox 位置稳定
    let blocks = vec![
        blk_boxed(1000, "第一行", 0.9, 100.0, 100.0, 120.0, 40.0),
        blk_boxed(2000, "第一行", 0.88, 100.0, 100.0, 120.0, 40.0),
        blk_boxed(2000, "第二行", 0.9, 100.0, 150.0, 120.0, 40.0),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：帧2 行集替换帧1（增量合并——不重复输出第一行）
    assert_eq!(result.ocr_body, vec!["第一行".to_string(), "第二行".to_string()]);
}

/// 净化链 ③：翻页（后帧不含前帧）→ 新屏输出。
#[test]
fn page_turn_keeps_both_frames() {
    // Arrange：帧2 文本不包含帧1（翻页）
    let blocks = vec![
        blk_boxed(1000, "第一页内容", 0.9, 100.0, 100.0, 200.0, 40.0),
        blk_boxed(2000, "第二页全新内容", 0.88, 100.0, 100.0, 200.0, 40.0),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：两屏都输出
    assert_eq!(result.ocr_body, vec!["第一页内容".to_string(), "第二页全新内容".to_string()]);
}

/// 净化链 ③：bbox 大幅位移（翻页动画）→ 即使文本包含也不合并。
#[test]
fn bbox_shift_keeps_both_frames() {
    // Arrange：帧2 文本含帧1（增量假象）但 bbox 位移 300px（> 行高×0.5）——
    // position_stable 防线：位移超阈值 → 新屏（不误并）；文本不同故相邻去重
    // 不会掩盖两条输出
    let blocks = vec![
        blk_boxed(1000, "标题内容", 0.9, 100.0, 100.0, 200.0, 40.0),
        blk_boxed(2000, "标题内容更多", 0.88, 100.0, 400.0, 200.0, 40.0),
    ];
    // Act
    let result = run("图文会话", &blocks);
    // Assert：两屏都输出（位置位移 → 新屏，不误并）
    assert_eq!(result.ocr_body, vec!["标题内容".to_string(), "标题内容更多".to_string()]);
}

// ── 审查 M1 回归：ASCII 词间空格保持 ────────────────────────────

#[test]
fn merge_two_keeps_ascii_word_gap() {
    // Arrange：英文行合并（"Hello " + "World"）——trim 后直拼会单词粘连
    let a = blk_boxed(1_000, "Hello ", 0.9, 0.0, 0.0, 50.0, 20.0);
    let b = blk_boxed(1_000, "World", 0.9, 50.0, 0.0, 50.0, 20.0);

    // Act
    let merged = super::merge_two(&a, &b);

    // Assert：补词间空格（空格信息在 trim 前已存在，恢复语义）
    assert_eq!(merged.text, "Hello World");
}

#[test]
fn merge_two_chinese_joins_without_gap() {
    // Arrange：中文行合并——无词间空格语义，直拼不受影响（零回归）
    let a = blk_boxed(1_000, "红色代表", 0.9, 0.0, 0.0, 80.0, 20.0);
    let b = blk_boxed(1_000, "热情", 0.9, 80.0, 0.0, 40.0, 20.0);

    // Act
    let merged = super::merge_two(&a, &b);

    // Assert：中文直拼无空格
    assert_eq!(merged.text, "红色代表热情");
}
