//! 规则版版面分析单测（REQ-047 / v0.5.0 M3，G3 golden 扩展）。
//!
//! @ai-context: AAA 模式；合成网格（PPT 页/表格页/代码页/公式页/白板）分类 golden；
//!              区域价值采样权重表；空/畸形网格防御。

use super::*;

/// 构造空白网格（全部白）。
fn blank(cols: u32, rows: u32) -> FrameGrid {
    FrameGrid { cols, rows, cells: vec![255; (cols * rows) as usize] }
}

/// 在网格上画墨迹矩形（值 0）。
fn paint_ink(grid: &mut FrameGrid, x0: u32, y0: u32, x1: u32, y1: u32) {
    for y in y0..=y1 {
        for x in x0..=x1 {
            grid.cells[(y * grid.cols + x) as usize] = 0;
        }
    }
}

/// PPT 页：顶部标题行带 + 中部文本行带（常规文本）。
fn ppt_page(cols: u32, rows: u32) -> FrameGrid {
    let mut g = blank(cols, rows);
    paint_ink(&mut g, 2, 1, cols - 3, 2); // 标题行（细带）
    paint_ink(&mut g, 2, 4, cols - 3, 5); // 正文行 1
    paint_ink(&mut g, 2, 7, cols - 3, 8); // 正文行 2
    g
}

/// 表格页：横竖线网格（3×3 表格）。
fn table_page(cols: u32, rows: u32) -> FrameGrid {
    let mut g = blank(cols, rows);
    let step_x = cols / 3;
    let step_y = rows / 3;
    for i in 0..=3 {
        let y = (i * step_y).min(rows - 1);
        paint_ink(&mut g, 0, y, cols - 1, y); // 横线
        let x = (i * step_x).min(cols - 1);
        paint_ink(&mut g, x, 0, x, rows - 1); // 竖线
    }
    g
}

/// 代码页：左侧对齐的多行墨迹（行首对齐）。
fn code_page(cols: u32, rows: u32) -> FrameGrid {
    let mut g = blank(cols, rows);
    for (i, y) in (1..rows).step_by(2).take(6).enumerate() {
        let width = cols / 3 + (i as u32 % 3) * 5; // 行宽变化但起点固定
        paint_ink(&mut g, 3, y, 3 + width, y);
    }
    g
}

/// 公式页：分子/分母符号段（左右两侧）+ 中线分数线（长条贯穿）。
fn formula_page(cols: u32, rows: u32) -> FrameGrid {
    let mut g = blank(cols, rows);
    let mid = rows / 2;
    // 分子/分母：符号段（左侧 x2..7 与右侧 x24..29，行墨迹占比 ≥18% 进带）
    for y in 2..mid.saturating_sub(1) {
        paint_ink(&mut g, 2, y, 7, y);
        paint_ink(&mut g, cols - 8, y, cols - 3, y);
    }
    for y in (mid + 2)..(rows - 2) {
        paint_ink(&mut g, 2, y, 7, y);
        paint_ink(&mut g, cols - 8, y, cols - 3, y);
    }
    // 分数线：中线 3 行长条（x5..26）
    paint_ink(&mut g, 5, mid - 1, cols - 6, mid + 1);
    g
}

/// 白板页：大面积低密度墨迹（手绘/图片）。
fn whiteboard_page(cols: u32, rows: u32) -> FrameGrid {
    let mut g = blank(cols, rows);
    // 大片低密度：斜线（稀疏）
    for i in 0..(cols.min(rows) / 4) {
        paint_ink(&mut g, i * 4, i * 2, i * 4 + 1, i * 2 + 1);
    }
    g
}

#[test]
fn ppt_page_classified_as_text() {
    // Arrange
    let grid = ppt_page(32, 18);
    // Act
    let regions = analyze_layout(&grid);
    // Assert：至少一个 Text 区域，无结构区域
    assert!(!regions.is_empty());
    assert!(regions.iter().all(|r| r.kind == RegionKind::Text));
    assert!(regions.iter().all(|r| !r.is_structural));
}

#[test]
fn table_page_classified_as_table() {
    // Arrange
    let grid = table_page(32, 18);
    // Act
    let regions = analyze_layout(&grid);
    // Assert：Table 区域 + 结构性标记
    assert!(regions.iter().any(|r| r.kind == RegionKind::Table));
    assert!(regions.iter().any(|r| r.is_structural));
}

#[test]
fn code_page_classified_as_code() {
    // Arrange
    let grid = code_page(32, 18);
    // Act
    let regions = analyze_layout(&grid);
    // Assert：Code 区域
    assert!(regions.iter().any(|r| r.kind == RegionKind::Code));
}

#[test]
fn formula_page_classified_as_formula() {
    // Arrange
    let grid = formula_page(32, 18);
    // Act
    let regions = analyze_layout(&grid);
    // Assert：Formula 区域（结构性）
    assert!(regions.iter().any(|r| r.kind == RegionKind::Formula));
}

#[test]
fn whiteboard_page_low_density_image_or_unknown() {
    // Arrange
    let grid = whiteboard_page(32, 18);
    // Act
    let regions = analyze_layout(&grid);
    // Assert：低密度大片 → Image（跳过）或 unknown，不误判为 Table
    if !regions.is_empty() {
        assert!(regions.iter().all(|r| r.kind != RegionKind::Table));
    }
}

#[test]
fn blank_grid_no_regions() {
    // Act/Assert：空白无区域
    assert!(analyze_layout(&blank(32, 18)).is_empty());
}

#[test]
fn malformed_grid_returns_empty() {
    // Arrange：尺寸与数据不匹配 / 零尺寸
    let bad = FrameGrid { cols: 4, rows: 4, cells: vec![255; 10] };
    let zero = FrameGrid { cols: 0, rows: 0, cells: Vec::new() };
    // Act/Assert：防御性返回空（不崩溃）
    assert!(analyze_layout(&bad).is_empty());
    assert!(analyze_layout(&zero).is_empty());
}

#[test]
fn region_sampling_weights_table_highest() {
    // Act
    let (table_w, table_skip) = region_sampling_weight(RegionKind::Table);
    let (text_w, text_skip) = region_sampling_weight(RegionKind::Text);
    let (img_w, img_skip) = region_sampling_weight(RegionKind::Image);
    let (unknown_w, unknown_skip) = region_sampling_weight(RegionKind::Unknown);
    // Assert：table > text；image 跳过；unknown 低权重不跳过
    assert!(table_w > text_w);
    assert!(img_skip, "image 区域跳过（图集处理）");
    assert!(!unknown_skip);
    assert!(unknown_w < table_w);
}

#[test]
fn structural_flag_follows_kind() {
    // Arrange
    let grid = table_page(32, 18);
    // Act
    let regions = analyze_layout(&grid);
    // Assert：结构区域（table）is_structural=true
    for r in regions {
        assert_eq!(
            r.is_structural,
            matches!(r.kind, RegionKind::Table | RegionKind::Formula | RegionKind::Code),
            "区域 {:?} 结构标记错误",
            r.kind
        );
    }
}

#[test]
fn regions_bbox_within_grid() {
    // Arrange：表格页（最密集区域）
    let grid = table_page(32, 18);
    // Act
    let regions = analyze_layout(&grid);
    // Assert：所有 bbox 在网格内（坐标还原前置不变量）
    for r in regions {
        assert!(r.x + r.w <= grid.cols, "区域 x+w 越界");
        assert!(r.y + r.h <= grid.rows, "区域 y+h 越界");
        assert!(r.w >= 1 && r.h >= 1);
    }
}
