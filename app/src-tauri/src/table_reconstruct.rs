//! 表格专项重建（REQ-049 / v0.5.0 M5：规则版线条重建兜底）。
//!
//! @ai-context: 双轨保障——SLANet 模型版（spike 通过则为主）与规则版（兜底）：
//!              本模块为规则版：表格线检测（形态学/投影）→ 行列网格 →
//!              单元格裁剪识别（文字由现有 OCR 提供）→ Markdown 表格。
//! @ai-context: 无线表格（无可见线）→ 空格聚类（半做，标注低置信）；
//!              重建失败 → 图 + 占位标记（诚实降级，产物层消费）。
//! @ai-context: 纯逻辑可单测：输入为表格区域的灰度网格（FrameGrid）与
//!              单元格文本矩阵（编排层按网格坐标裁剪识别填充）。

use serde::{Deserialize, Serialize};

/// 表格重建产物块。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableBlock {
    /// 重建的 Markdown 表格
    pub markdown: String,
    /// 结构还原置信度 0.0-1.0（无线表格/重建失败为低值）
    pub structure_confidence: f32,
    /// 单元格引用（行, 列）→ 原文（原料层 OCR 文本；不复制图片）
    pub cell_refs: Vec<(usize, usize, String)>,
}

/// 行列网格（表格线检测输出）。
#[derive(Debug, Clone, PartialEq)]
pub struct TableGrid {
    /// 水平线 y 坐标（含表格外边框）
    pub row_lines: Vec<u32>,
    /// 垂直线 x 坐标（含表格外边框）
    pub col_lines: Vec<u32>,
}

/// 墨迹阈值（与 layout_analyzer 同口径）。
const INK_THRESHOLD: u8 = 160;
/// 行/列线判定：连续墨迹占比下限（表格线整行/整列墨迹）。
const LINE_INK: f32 = 0.6;
/// 最小行/列数（2×2 以下不成表）。
const MIN_LINES: usize = 3;

/// 表格线检测（纯函数）：从灰度网格提取行列线位置。
///
/// @ai-context: 行线 = 行内墨迹占比 ≥LINE_INK 的行（表格横线）；列线同理。
///              相邻线合并（间隔 ≤1 格）防重复检测；无表格返回 None。
/// @ai-context: 输入为**表格区域**的裁剪网格（由编排层裁剪，M4 region_ocr 衔接）。
pub fn detect_table_grid(grid: &crate::layout_analyzer::FrameGrid) -> Option<TableGrid> {
    if grid.cols == 0 || grid.rows == 0 || grid.cells.len() != (grid.cols * grid.rows) as usize {
        return None;
    }
    // 行线：行内墨迹占比
    let mut row_lines = Vec::new();
    for y in 0..grid.rows {
        let start = (y * grid.cols) as usize;
        let end = start + grid.cols as usize;
        let ink = grid.cells[start..end].iter().filter(|&&v| v < INK_THRESHOLD).count();
        if ink as f32 / grid.cols as f32 >= LINE_INK {
            row_lines.push(y);
        }
    }
    // 列线：列内墨迹占比
    let mut col_lines = Vec::new();
    for x in 0..grid.cols {
        let ink = (0..grid.rows)
            .filter(|&y| grid.cells[(y * grid.cols + x) as usize] < INK_THRESHOLD)
            .count();
        if ink as f32 / grid.rows as f32 >= LINE_INK {
            col_lines.push(x);
        }
    }
    // 相邻线合并（间隔 ≤1 格视为同一条线，防粗线重复检测）
    let row_lines = merge_close(&row_lines);
    let col_lines = merge_close(&col_lines);
    // 表格最少 2 行 2 列 = 3 条线（含边框）
    if row_lines.len() < MIN_LINES || col_lines.len() < MIN_LINES {
        return None;
    }
    Some(TableGrid { row_lines, col_lines })
}

/// 合并相邻线（间隔 ≤1 取前一条；防粗表格线占多格重复检测）。
fn merge_close(lines: &[u32]) -> Vec<u32> {
    let mut out: Vec<u32> = Vec::new();
    for &l in lines {
        if out.last().is_some_and(|prev| l - prev <= 1) {
            continue;
        }
        out.push(l);
    }
    out
}

/// 由网格与单元格文本构建 Markdown 表格（纯函数）。
///
/// @ai-context: cells[row][col] 为单元格识别文本（编排层按行列线交叉区域裁剪识别）；
///              单元格数必须与网格行列匹配（行 = 行线数-1，列 = 列线数-1）。
/// @ai-context: 单元格文本换行/竖线转义（防破坏 Markdown 表格语法）。
pub fn build_markdown_table(
    grid: &TableGrid,
    cells: &[Vec<String>],
) -> Option<String> {
    let rows = grid.row_lines.len() - 1;
    let cols = grid.col_lines.len() - 1;
    if rows == 0 || cols == 0 || cells.len() != rows {
        return None;
    }
    if cells.iter().any(|r| r.len() != cols) {
        return None;
    }
    let mut md = String::new();
    // 表头行（第一行）
    md.push('|');
    for c in &cells[0] {
        md.push_str(&escape_cell(c));
        md.push('|');
    }
    md.push('\n');
    // 分隔行
    md.push('|');
    for _ in 0..cols {
        md.push_str("---|");
    }
    md.push('\n');
    // 数据行
    for row in &cells[1..] {
        md.push('|');
        for c in row {
            md.push_str(&escape_cell(c));
            md.push('|');
        }
        md.push('\n');
    }
    Some(md)
}

/// 单元格文本转义：竖线/换行替换（防破坏表格结构）。
fn escape_cell(cell: &str) -> String {
    cell.replace('|', "\\|").replace('\n', " ").trim().to_string()
}

/// 结构置信度（纯函数）：行列线数量越多、网格越规整 → 置信度越高。
///
/// @ai-context: 基准 0.9（有线表格），行列线异常（≤3）降级；无线表格
///              （detect_table_grid 失败）由编排层走空格聚类并标低置信（半做）。
pub fn structure_confidence(grid: &TableGrid) -> f32 {
    let rows = grid.row_lines.len();
    let cols = grid.col_lines.len();
    if rows < MIN_LINES || cols < MIN_LINES {
        return 0.3;
    }
    // 规整度：行列数相近的方阵更可信
    let ratio = rows.min(cols) as f32 / rows.max(cols) as f32;
    0.6 + 0.3 * ratio
}

/// 完整重建入口（纯函数）：网格 → Markdown 表格块；失败返回 None（诚实降级）。
///
/// @ai-context: 消费方 = M7 产物体系（TableBlock 作为产物块类型）；当前阶段
///              仅测试覆盖 + 类型契约就绪，登记豁免 dead_code。
#[allow(dead_code)]
pub fn reconstruct_table(
    grid: &crate::layout_analyzer::FrameGrid,
    cells: &[Vec<String>],
) -> Option<TableBlock> {
    let table_grid = detect_table_grid(grid)?;
    let markdown = build_markdown_table(&table_grid, cells)?;
    let confidence = structure_confidence(&table_grid);
    let cell_refs = cells
        .iter()
        .enumerate()
        .flat_map(|(r, row)| {
            row.iter()
                .enumerate()
                .map(move |(c, text)| (r, c, text.clone()))
        })
        .collect();
    Some(TableBlock { markdown, structure_confidence: confidence, cell_refs })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "table_reconstruct_tests.rs"]
mod tests;
