//! 结构图检测纯函数单测（REQ-182 / v0.7.7；v0.10.2 重构，AAA 模式）。
//!
//! @ai-context: 合成网格标定 diagram_likeness——流程图样（框线+文字）必过、
//!              照片样（无长直线高密度纹理）必拒、纯色样（低方差装饰）必拒、
//!              文字样（长词误入 Image）必拒；decide_keep 四层判定——L0 字幕
//!              重叠拦截 / L1 结构三类直收 / L2 OCR 置信度反向信号 / L3 底部
//!              条带形状约束。

use crate::layout_analyzer::{FrameGrid, LayoutRegion, RegionKind};
use crate::structure_detect::{decide_keep, diagram_likeness, StructureFilterContext};
use crate::types::TextBox;

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
fn diagram_title_strip_rejected_by_shape() {
    // Arrange：长标题细条（高 1-2 格、长词连续段占比高——形状约束拒绝）
    let mut g = blank(32, 18, 255);
    paint(&mut g, 2, 6, 25, 6); // 24 格长段、单行

    // Act：区域 h=1（细条）
    let score = diagram_likeness(&g, 2, 6, 25, 6);

    // Assert：形状约束（h<3）→ 0 分——长标题不误收
    assert_eq!(score, 0.0);
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

/// 空过滤上下文（无字幕/无画面要点块）。
fn empty_ctx() -> StructureFilterContext {
    StructureFilterContext { subtitle_boxes: Vec::new(), full_blocks: Vec::new() }
}

#[test]
fn decide_keep_subtitle_overlap_rejected() {
    // Arrange：L0——区域与字幕块高重叠（IoU≈0.68），图似然分高也无效
    let r = region(RegionKind::Image, 100, 100, 400, 80);
    let ctx = StructureFilterContext {
        subtitle_boxes: vec![TextBox { x: 120.0, y: 110.0, w: 360.0, h: 60.0 }],
        full_blocks: Vec::new(),
    };

    // Act/Assert：字幕重叠 → 拒（即使 diagram_score 高）
    assert!(!decide_keep(r.kind, &r, 0.9, &ctx, 640, 360));
}

#[test]
fn decide_keep_structural_kinds_direct_accept() {
    // Arrange：L1——结构三类直收（diagram_score 0.0 占位、无 OCR 上下文）
    let ctx = empty_ctx();
    for kind in [RegionKind::Table, RegionKind::Formula, RegionKind::Code] {
        let r = region(kind, 0, 0, 300, 200);

        // Act/Assert：不依赖任何启发式 → 收
        assert!(decide_keep(kind, &r, 0.0, &ctx, 640, 360), "{kind:?} 应直收");
    }
}

#[test]
fn decide_keep_unknown_and_low_likeness_rejected() {
    // Arrange：L1/L2 前门——Unknown 拒、Image 图似然不足拒
    let ctx = empty_ctx();
    let unknown = region(RegionKind::Unknown, 0, 0, 300, 200);
    let weak_img = region(RegionKind::Image, 100, 100, 400, 80);

    // Act/Assert
    assert!(!decide_keep(RegionKind::Unknown, &unknown, 0.0, &ctx, 640, 360));
    assert!(!decide_keep(RegionKind::Image, &weak_img, 0.4, &ctx, 640, 360));
}

#[test]
fn decide_keep_ocr_confident_text_rejected() {
    // Arrange：L2——区域内 full 块高置信（OCR 已还原线性文本）→ 拒
    let r = region(RegionKind::Text, 100, 100, 400, 80);
    let ctx = StructureFilterContext {
        subtitle_boxes: Vec::new(),
        full_blocks: vec![(TextBox { x: 120.0, y: 110.0, w: 360.0, h: 60.0 }, 0.9)],
    };

    // Act/Assert
    assert!(!decide_keep(r.kind, &r, 0.9, &ctx, 640, 360));
}

#[test]
fn decide_keep_ocr_weak_or_missing_accepted() {
    // Arrange：L2——低置信（OCR 还原不了）与无块（OCR 未覆盖）→ 收
    let r = region(RegionKind::Text, 100, 100, 400, 80);
    let weak = StructureFilterContext {
        subtitle_boxes: Vec::new(),
        full_blocks: vec![(TextBox { x: 120.0, y: 110.0, w: 360.0, h: 60.0 }, 0.3)],
    };
    let mid = StructureFilterContext {
        subtitle_boxes: Vec::new(),
        full_blocks: vec![(TextBox { x: 120.0, y: 110.0, w: 360.0, h: 60.0 }, 0.6)],
    };
    let none = empty_ctx();

    // Act/Assert：0.3 低置信 / 0.6 模糊地带 / 无重叠块 → 均收
    assert!(decide_keep(r.kind, &r, 0.9, &weak, 640, 360));
    assert!(decide_keep(r.kind, &r, 0.9, &mid, 640, 360));
    assert!(decide_keep(r.kind, &r, 0.9, &none, 640, 360));
}

#[test]
fn decide_keep_tiny_overlap_block_not_counted() {
    // Arrange：L2 审查修复——整帧大块与区域微量重叠（ratio≈0.14 < 0.3），
    //          高置信也不计入信号 → 不误拒真实结构图
    let r = region(RegionKind::Text, 100, 100, 400, 80);
    let ctx = StructureFilterContext {
        subtitle_boxes: Vec::new(),
        full_blocks: vec![(TextBox { x: 0.0, y: 0.0, w: 640.0, h: 360.0 }, 0.9)],
    };

    // Act/Assert：大块不计入 → avg=0 → 收（修复前 `iou>0` 会误拒）
    assert!(decide_keep(r.kind, &r, 0.9, &ctx, 640, 360));
}

#[test]
fn decide_keep_bottom_strip_rejected_by_shape() {
    // Arrange：L3——底部细长条带（高宽比 > 8、中心在底部 12%），无字幕块
    //          （防旧数据无字幕标记）
    let r = region(RegionKind::Text, 0, 310, 640, 30);
    let ctx = empty_ctx();

    // Act/Assert：形状约束 → 拒
    assert!(!decide_keep(r.kind, &r, 0.9, &ctx, 640, 360));
}

#[test]
fn decide_keep_bottom_wide_strip_not_rejected() {
    // Arrange：L3 边界——底部但块状（高宽比 ≤ 8）不触发形状约束；无字幕
    //          块、无 OCR 块 → 正常走 L1/L2 收
    let r = region(RegionKind::Text, 0, 280, 640, 80);
    let ctx = empty_ctx();

    // Act/Assert：宽高比 8 恰好不触发（非细条）；底部位置不单独拒
    assert!(decide_keep(r.kind, &r, 0.9, &ctx, 640, 360));
}
