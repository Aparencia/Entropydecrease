//! 表格重建单测（REQ-049 / v0.5.0 M5：规则版 golden）。
//!
//! @ai-context: AAA 模式；合成表格网格（有线 3×3）验证线检测/Markdown 构建/
//!              置信度/转义/失败降级。

use super::*;
use crate::layout_analyzer::FrameGrid;

/// 构造有线表格网格：横线在 y=0,5,10,15；竖线在 x=0,8,16,24。
fn grid_with_lines(cols: u32, rows: u32, h_lines: &[u32], v_lines: &[u32]) -> FrameGrid {
    let mut cells = vec![255u8; (cols * rows) as usize];
    for &y in h_lines {
        for x in 0..cols {
            cells[(y * cols + x) as usize] = 0;
        }
    }
    for &x in v_lines {
        for y in 0..rows {
            cells[(y * cols + x) as usize] = 0;
        }
    }
    FrameGrid { cols, rows, cells }
}

fn three_by_three_grid() -> FrameGrid {
    grid_with_lines(24, 16, &[0, 5, 10, 15], &[0, 8, 16, 23])
}

fn cells_3x3() -> Vec<Vec<String>> {
    vec![
        vec!["姓名".into(), "年龄".into(), "城市".into()],
        vec!["张三".into(), "25".into(), "北京".into()],
        vec!["李四".into(), "30".into(), "上海".into()],
    ]
}

#[test]
fn detect_grid_finds_lines() {
    // Arrange
    let grid = three_by_three_grid();
    // Act
    let table = detect_table_grid(&grid).expect("grid");
    // Assert：4 横线 4 竖线（3×3 表格）
    assert_eq!(table.row_lines.len(), 4);
    assert_eq!(table.col_lines.len(), 4);
}

#[test]
fn detect_grid_none_without_lines() {
    // Arrange：纯白网格（无线表格）
    let grid = FrameGrid { cols: 24, rows: 16, cells: vec![255; 24 * 16] };
    // Act/Assert：无表格线 → None（走空格聚类半做路径）
    assert!(detect_table_grid(&grid).is_none());
    // 仅 2 条线（1 行 1 列）→ None
    let single = grid_with_lines(24, 16, &[0, 5], &[0, 8]);
    assert!(detect_table_grid(&single).is_none(), "1×1 以下不成表");
    // 3 条线（2×2）→ 通过（最少 2 行 2 列）
    let two_by_two = grid_with_lines(24, 16, &[0, 5, 10], &[0, 8, 16]);
    assert!(detect_table_grid(&two_by_two).is_some(), "2×2 表格应检测到");
}

#[test]
fn detect_grid_merges_close_lines() {
    // Arrange：粗线（连续 2 格）
    let grid = grid_with_lines(24, 16, &[0, 5, 6, 10, 15], &[0, 8, 16, 23]);
    // Act
    let table = detect_table_grid(&grid).expect("grid");
    // Assert：5,6 合并为一条（4 条横线）
    assert_eq!(table.row_lines.len(), 4);
}

#[test]
fn build_markdown_three_by_three() {
    // Arrange
    let grid = three_by_three_grid();
    let table = detect_table_grid(&grid).unwrap();
    // Act
    let md = build_markdown_table(&table, &cells_3x3()).expect("markdown");
    // Assert：表头 + 分隔 + 2 数据行
    assert!(md.starts_with("|姓名|年龄|城市|"));
    assert!(md.contains("|---|---|---|"));
    assert!(md.contains("|张三|25|北京|"));
    assert!(md.contains("|李四|30|上海|"));
}

#[test]
fn build_markdown_escapes_cell_content() {
    // Arrange：单元格含竖线与换行
    let grid = three_by_three_grid();
    let table = detect_table_grid(&grid).unwrap();
    let cells = vec![
        vec!["a|b".into(), "换\n行".into(), "c".into()],
        vec!["1".into(), "2".into(), "3".into()],
        vec!["4".into(), "5".into(), "6".into()],
    ];
    // Act
    let md = build_markdown_table(&table, &cells).expect("markdown");
    // Assert：竖线转义、换行折叠
    assert!(md.contains("a\\|b"));
    assert!(md.lines().count() >= 4, "表头+分隔+数据行（结构完整性）");
    assert!(md.lines().all(|l| l.contains('|')));
}

#[test]
fn build_markdown_mismatched_cells_none() {
    // Arrange：行数不匹配
    let grid = three_by_three_grid();
    let table = detect_table_grid(&grid).unwrap();
    // Act/Assert：2 行 vs 网格 3 行 → None
    let bad = vec![vec!["a".into(), "b".into(), "c".into()], vec!["1".into(), "2".into(), "3".into()]];
    assert!(build_markdown_table(&table, &bad).is_none());
    // 列数不匹配 → None
    let bad_cols = vec![
        vec!["a".into(), "b".into()],
        vec!["1".into(), "2".into()],
        vec!["4".into(), "5".into()],
    ];
    assert!(build_markdown_table(&table, &bad_cols).is_none());
}

#[test]
fn structure_confidence_ranges() {
    // Arrange：规整 3×3 与瘦长 4×2
    let grid = three_by_three_grid();
    let table = detect_table_grid(&grid).unwrap();
    let slim = grid_with_lines(24, 16, &[0, 5, 10, 15, 12], &[0, 8, 16]);
    // Act
    let conf = structure_confidence(&table);
    let slim_table = detect_table_grid(&slim).unwrap();
    let slim_conf = structure_confidence(&slim_table);
    // Assert：方阵置信度 ≥ 瘦长（规整度更高）
    assert!(conf >= 0.6);
    assert!(slim_conf <= conf);
    assert!(slim_conf > 0.0);
}

#[test]
fn reconstruct_table_full_pipeline() {
    // Arrange
    let grid = three_by_three_grid();
    // Act
    let block = reconstruct_table(&grid, &cells_3x3()).expect("block");
    // Assert：产物块完整（Markdown + 置信度 + 单元格引用 9 个）
    assert!(block.markdown.contains("张三"));
    assert!(block.structure_confidence >= 0.6);
    assert_eq!(block.cell_refs.len(), 9);
    assert!(block.cell_refs.iter().any(|(r, c, t)| *r == 1 && *c == 0 && t == "张三"));
}

#[test]
fn reconstruct_table_failure_returns_none() {
    // Arrange：无线表格网格
    let grid = FrameGrid { cols: 24, rows: 16, cells: vec![255; 24 * 16] };
    // Act/Assert：重建失败 → None（诚实降级：图 + 占位标记由产物层处理）
    assert!(reconstruct_table(&grid, &cells_3x3()).is_none());
}
