//! 结构图检测纯函数单测（REQ-182 / v0.7.7，AAA 模式）。
//!
//! @ai-context: 合成网格标定 diagram_likeness——流程图样（框线+文字）必过、
//!              照片样（无长直线高密度纹理）必拒、纯色样（低方差装饰）必拒、
//!              文字样（长词误入 Image）必拒；pick_sharpest 清晰度代理选优；
//!              区域过滤门控（结构三类直收 + Image 阈值 + text/unknown 跳过）。

use crate::layout_analyzer::{FrameGrid, LayoutRegion, RegionKind};
use crate::structure_detect::{
    diagram_likeness, edge_energy, filter_structure_regions, pick_sharpest,
};

/// 空白网格（bg=背景灰度）。
fn blank(cols: u32, rows: u32, bg: u8) -> FrameGrid {
    FrameGrid { cols, rows, cells: vec![bg; (cols * rows) as usize] }
}

/// 矩形填充墨迹（值为 0=纯黑，网格坐标）。
fn paint(g: &mut FrameGrid, x0: u32, y0: u32, x1: u32, y1: u32) {
    for y in y0..=y1 {
        for x in x0..=x1 {
            g.cells[(y * g.cols + x) as usize] = 0;
        }
    }
}

/// 区域构造辅助（网格坐标）。
fn region(kind: RegionKind, x: u32, y: u32, w: u32, h: u32) -> LayoutRegion {
    LayoutRegion { kind, x, y, w, h, confidence: 0.9, is_structural: true }
}

/// 流程图样：32×18 全屏，区域 (4,3)-(23,10)（w=20,h=8）内两个并列框 + 箭头 + 框内文字。
fn flowchart_like() -> FrameGrid {
    let mut g = blank(32, 18, 255);
    // 框1：(4,3)-(13,5)——上下横线 + 左右竖线 + 框内文字点
    paint(&mut g, 4, 3, 13, 3);
    paint(&mut g, 4, 5, 13, 5);
    paint(&mut g, 4, 3, 4, 5);
    paint(&mut g, 13, 3, 13, 5);
    paint(&mut g, 6, 4, 11, 4);
    // 箭头连接：y=4 行 x=13..=14（两框之间）
    paint(&mut g, 14, 4, 14, 4);
    // 框2：(15,3)-(23,5)
    paint(&mut g, 15, 3, 23, 3);
    paint(&mut g, 15, 5, 23, 5);
    paint(&mut g, 15, 3, 15, 5);
    paint(&mut g, 23, 3, 23, 5);
    paint(&mut g, 17, 4, 22, 4);
    g
}

/// 照片样：区域 (4,3)-(23,10) 内 1×1 黑白棋盘纹理（无长直线、高密度、高方差）。
fn photo_like() -> FrameGrid {
    let mut g = blank(32, 18, 255);
    for y in 3..=10 {
        for x in 4..=23 {
            if (x + y) % 2 == 0 {
                g.cells[(y * g.cols + x) as usize] = 30; // 深色纹理（非纯黑，模拟照片）
            }
        }
    }
    g
}

/// 纯色样：区域全中灰（低方差装饰）。
fn solid_like() -> FrameGrid {
    blank(32, 18, 128)
}

/// 文字样：区域内 1 行长词（8 格连续）——模拟大字标题误入 Image 区域。
fn text_like() -> FrameGrid {
    let mut g = blank(32, 18, 255);
    paint(&mut g, 6, 6, 13, 6);
    g
}

#[test]
fn diagram_flowchart_passes_threshold() {
    // Arrange：流程图样区域 (4,3)-(23,10)
    let g = flowchart_like();

    // Act
    let score = diagram_likeness(&g, 4, 3, 23, 10);

    // Assert：框线长直线特征 → 必过阈值
    assert!(
        score >= crate::structure_detect::DIAGRAM_LIKENESS_THRESHOLD,
        "流程图样得分 {score} 应 ≥ 阈值"
    );
}

#[test]
fn diagram_photo_rejected() {
    // Arrange：照片纹理样（无长直线）
    let g = photo_like();

    // Act
    let score = diagram_likeness(&g, 4, 3, 23, 10);

    // Assert：无框线 → 必低于阈值
    assert!(
        score < crate::structure_detect::DIAGRAM_LIKENESS_THRESHOLD,
        "照片样得分 {score} 应 < 阈值"
    );
}

#[test]
fn diagram_solid_rejected_by_variance() {
    // Arrange/Act：纯色区域 → 低方差硬门槛 → 0 分
    let g = solid_like();
    assert_eq!(diagram_likeness(&g, 4, 3, 23, 10), 0.0);
}

#[test]
fn diagram_text_line_rejected() {
    // Arrange：单行长词（标题样）——长段存在但无框线结构
    let g = text_like();

    // Act
    let score = diagram_likeness(&g, 2, 2, 21, 9);

    // Assert：0.43 左右，必低于阈值（无行/列框线组合，仅 1 行文字）
    assert!(score < crate::structure_detect::DIAGRAM_LIKENESS_THRESHOLD);
}

#[test]
fn diagram_out_of_bounds_and_tiny_region_zero() {
    // Arrange：全屏空白 + 越界/过小区域
    let g = blank(32, 18, 255);

    // Act/Assert：越界、单格、空区域均 0 分（防御）
    assert_eq!(diagram_likeness(&g, 30, 0, 40, 5), 0.0);
    assert_eq!(diagram_likeness(&g, 5, 5, 5, 5), 0.0);
    assert_eq!(diagram_likeness(&g, 5, 5, 4, 6), 0.0);
}

#[test]
fn edge_energy_ranks_sharp_over_blurry() {
    // Arrange：清晰帧（黑白分界锐利）vs 模糊帧（灰度渐变过渡）
    let mut sharp = blank(8, 4, 255);
    paint(&mut sharp, 0, 0, 3, 3); // 左半黑右半白——大梯度
    let blur = blank(8, 4, 200); // 全灰——零梯度

    // Act/Assert
    assert!(edge_energy(&sharp) > edge_energy(&blur));
    assert_eq!(edge_energy(&blur), 0);
}

#[test]
fn pick_sharpest_selects_highest_energy() {
    // Arrange：同一画面（左 2 列黑块）三种对比度——清晰(0/255) > 模糊(80/175) > 更糊(130/155)
    let frame = |dark: u8, light: u8| {
        let mut g = blank(8, 4, light);
        for y in 0..4 {
            for x in 0..2 {
                g.cells[(y * g.cols + x) as usize] = dark;
            }
        }
        g
    };
    let worse = frame(130, 155); // 对比度 25 → 能量最低
    let mid = frame(80, 175); // 对比度 95
    let best = frame(0, 255); // 对比度 255 → 能量最高
    let candidates = vec![(1_000u64, worse), (2_000u64, mid), (3_000u64, best)];

    // Act
    let idx = pick_sharpest(&candidates);

    // Assert：选能量最高的帧 2
    assert_eq!(idx, Some(2));
    assert_eq!(candidates[idx.unwrap()].0, 3_000);
}

#[test]
fn pick_sharpest_empty_or_all_flat_returns_none() {
    // Arrange：空列表 + 全纯色帧列表
    let flat = blank(8, 4, 128);

    // Act/Assert：无可捕获帧 → None（调用方跳过该屏）
    assert_eq!(pick_sharpest(&[]), None);
    assert_eq!(pick_sharpest(&[(1_000, flat.clone()), (2_000, flat.clone())]), None);
}

#[test]
fn pick_sharpest_skips_zero_energy_frames() {
    // Arrange：纯色帧 + 有效帧混排（纯色帧排前）
    let flat = blank(8, 4, 128);
    let mut good = blank(8, 4, 255);
    paint(&mut good, 0, 0, 2, 3);

    // Act
    let idx = pick_sharpest(&[(1_000, flat), (2_000, good)]);

    // Assert：跳过零能量帧，选有效帧
    assert_eq!(idx, Some(1));
}

#[test]
fn filter_structure_kinds_direct_and_image_gated() {
    // Arrange：流程图样网格 + 混合区域列表
    let g = flowchart_like();
    let regions = vec![
        region(RegionKind::Table, 0, 0, 5, 3),
        region(RegionKind::Formula, 0, 4, 5, 3),
        region(RegionKind::Code, 0, 8, 5, 3),
        region(RegionKind::Image, 4, 3, 20, 8), // 流程图区域（应过阈值）
        region(RegionKind::Image, 0, 12, 8, 4), // 空白区域（应拒）
        region(RegionKind::Text, 26, 0, 5, 3),
        region(RegionKind::Unknown, 26, 5, 5, 3),
    ];

    // Act
    let kept = filter_structure_regions(&regions, &g);

    // Assert：结构三类直收 + Image 阈值门控；text/unknown 跳过
    let kinds: Vec<RegionKind> = kept.iter().map(|r| r.kind).collect();
    assert_eq!(
        kinds,
        vec![RegionKind::Table, RegionKind::Formula, RegionKind::Code, RegionKind::Image]
    );
    assert_eq!(kept.last().unwrap().x, 4); // 保留的是流程图区域而非空白区域
}
