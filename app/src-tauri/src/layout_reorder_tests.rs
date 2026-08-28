//! layout_reorder 单测（v0.14 D3 spec §6：单栏/多栏/标题识别；AAA 模式）。

use super::*;

/// 构造版面块（x, y, w, h, 文本）。
fn blk(x: f32, y: f32, w: f32, h: f32, text: &str) -> LayoutBlock {
    LayoutBlock { text: text.to_string(), x, y, w, h }
}

#[test]
fn single_column_sorts_by_y() {
    // Arrange：三行正文（y 递增）+ 一行标题（h 显著大）
    let blocks = vec![
        blk(100.0, 300.0, 300.0, 40.0, "第二行"),
        blk(100.0, 100.0, 400.0, 60.0, "本章标题"),
        blk(100.0, 200.0, 300.0, 40.0, "第一行"),
    ];
    // Act
    let lines = reorder_screen(&blocks);
    // Assert：阅读序（标题识别 + y 升序）
    assert_eq!(lines.len(), 3);
    assert!(lines[0].is_title, "标题行高显著 → 识别为标题");
    assert_eq!(lines[0].text, "本章标题");
    assert_eq!(lines[1].text, "第一行");
    assert_eq!(lines[2].text, "第二行");
    assert!(lines.iter().all(|l| l.column == 0), "单栏");
}

#[test]
fn same_row_blocks_join_in_x_order() {
    // Arrange：同一逻辑行被 det 切成两块（y 同、x 相邻——会话29 实证形态）
    let blocks = vec![
        blk(100.0, 300.0, 700.0, 40.0, "系统是由相互联系的若干要素"),
        blk(810.0, 300.0, 300.0, 40.0, "组成的整体"),
    ];
    // Act
    let lines = reorder_screen(&blocks);
    // Assert：拼成一行一句（y 容差内归行）
    assert_eq!(lines.len(), 1);
    assert!(lines[0].text.contains("若干要素"), "实际: {}", lines[0].text);
}

#[test]
fn distinct_rows_stay_separate() {
    // Arrange：两行正文（y 差 80 > 容差）
    let blocks = vec![
        blk(100.0, 300.0, 300.0, 40.0, "第一行内容"),
        blk(100.0, 380.0, 300.0, 40.0, "第二行内容"),
    ];
    // Act
    let lines = reorder_screen(&blocks);
    // Assert：两行分开
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0].text, "第一行内容");
    assert_eq!(lines[1].text, "第二行内容");
}

#[test]
fn two_columns_read_left_then_right() {
    // Arrange：两栏版面（左栏 x≈100，右栏 x≈600）；间隙 300 在多行重复 → 栏边界
    let blocks = vec![
        blk(100.0, 100.0, 200.0, 30.0, "左一"),
        blk(600.0, 100.0, 200.0, 30.0, "右一"),
        blk(100.0, 150.0, 200.0, 30.0, "左二"),
        blk(600.0, 150.0, 200.0, 30.0, "右二"),
    ];
    // Act
    let lines = reorder_screen(&blocks);
    // Assert：左栏两行在前、右栏两行在后（栏升序 → 栏内 y 升序）
    let texts: Vec<&str> = lines.iter().map(|l| l.text.as_str()).collect();
    assert_eq!(texts, vec!["左一", "左二", "右一", "右二"]);
    assert_eq!(lines[0].column, 0);
    assert_eq!(lines[3].column, 1);
}

#[test]
fn single_row_large_gap_is_not_column() {
    // Arrange：仅一行有大间隙（栏间隙需 ≥2 行重复——单行偶然不算栏）
    let blocks = vec![
        blk(100.0, 100.0, 100.0, 30.0, "左"),
        blk(600.0, 100.0, 100.0, 30.0, "右"),
        blk(100.0, 200.0, 500.0, 30.0, "下方宽行"),
    ];
    // Act
    let lines = reorder_screen(&blocks);
    // Assert：全部单栏（无跨行重复间隙 → 不切栏）
    assert!(lines.iter().all(|l| l.column == 0));
}

#[test]
fn ascii_words_get_space_joined() {
    // Arrange：英文词块相邻（无分隔符粘连防护）
    let blocks = vec![
        blk(100.0, 100.0, 120.0, 30.0, "Hello"),
        blk(230.0, 100.0, 120.0, 30.0, "World"),
    ];
    // Act
    let lines = reorder_screen(&blocks);
    // Assert：词间空格（英文不粘连）
    assert_eq!(lines[0].text, "Hello World");
}

#[test]
fn empty_input_returns_empty() {
    // Arrange/Act/Assert
    assert!(reorder_screen(&[]).is_empty());
}
