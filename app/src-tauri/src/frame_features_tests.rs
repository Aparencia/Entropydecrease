//! 帧特征提取单测（REQ-047 / v0.5.0 M3）。
//!
//! @ai-context: AAA 模式；合成 BGRA 帧验证网格亮度/尺寸/防御。

use super::*;

/// 构造纯色 BGRA 帧。
fn solid_frame(w: u32, h: u32, r: u8, g: u8, b: u8) -> Vec<u8> {
    let mut raw = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..(w * h) {
        raw.extend_from_slice(&[b, g, r, 255]);
    }
    raw
}

#[test]
fn grid_extracts_luma_from_bgra() {
    // Arrange：灰色帧（r=g=b=200 → 亮度 200）
    let w = 320;
    let h = 180;
    let frame = solid_frame(w, h, 200, 200, 200);
    // Act
    let grid = grid_from_bgra(&frame, w, h).expect("grid");
    // Assert：目标粒度 + 亮度一致
    assert_eq!(grid.cols, 32);
    assert_eq!(grid.rows, 18);
    assert!(grid.cells.iter().all(|&v| v == 200));
}

#[test]
fn grid_luma_weighting_bgra_order() {
    // Arrange：纯红（BGRA 存储 [0,0,255]）→ 亮度 299*255/1000 ≈ 76
    let w = 64;
    let h = 64;
    let frame = solid_frame(w, h, 255, 0, 0);
    // Act
    let grid = grid_from_bgra(&frame, w, h).expect("grid");
    // Assert：Rec.601 亮度（红色权重 0.299）
    let v = grid.cells[0];
    assert!(v >= 70 && v <= 82, "红色亮度应 ≈76，实际 {}", v);
}

#[test]
fn grid_black_and_white() {
    // Act/Assert：纯黑 → 0；纯白 → 255
    let w = 64;
    let h = 64;
    let black = grid_from_bgra(&solid_frame(w, h, 0, 0, 0), w, h).unwrap();
    let white = grid_from_bgra(&solid_frame(w, h, 255, 255, 255), w, h).unwrap();
    assert!(black.cells.iter().all(|&v| v == 0));
    assert!(white.cells.iter().all(|&v| v == 255));
}

#[test]
fn grid_smaller_than_target_degrades() {
    // Arrange：8×6 帧 < 32×18 目标
    let frame = solid_frame(8, 6, 100, 100, 100);
    // Act
    let grid = grid_from_bgra(&frame, 8, 6).expect("grid");
    // Assert：退化为帧尺寸粒度（不放大）
    assert_eq!(grid.cols, 8);
    assert_eq!(grid.rows, 6);
    assert_eq!(grid.cells.len(), 48);
}

#[test]
fn malformed_frame_returns_none() {
    // Arrange：长度不匹配 / 零尺寸
    // Act/Assert：防御性返回 None（不崩溃）
    assert!(grid_from_bgra(&[0u8; 10], 4, 4).is_none());
    assert!(grid_from_bgra(&[], 0, 0).is_none());
}

#[test]
fn grid_feeds_layout_analysis() {
    // Arrange：全白帧 → 空白网格
    let w = 320;
    let h = 180;
    let frame = solid_frame(w, h, 255, 255, 255);
    let grid = grid_from_bgra(&frame, w, h).unwrap();
    // Act：直接交给版面分析
    let regions = crate::layout_analyzer::analyze_layout(&grid);
    // Assert：空白帧无区域（端到端链路不变量）
    assert!(regions.is_empty());
}

/// 构造区域（测试辅助）。
fn region(x: u32, y: u32, w: u32, h: u32) -> crate::layout_analyzer::LayoutRegion {
    crate::layout_analyzer::LayoutRegion {
        kind: crate::layout_analyzer::RegionKind::Text,
        x,
        y,
        w,
        h,
        confidence: 0.9,
        is_structural: false,
    }
}

#[test]
fn regions_to_frame_scales_grid_to_pixels() {
    // Arrange：32×18 网格 + 960×1032 帧（与会话 14/15 实测尺寸一致）
    let regions = vec![region(12, 12, 20, 6), region(0, 0, 32, 18)];
    // Act
    let out = regions_to_frame(&regions, 32, 18, 960, 1032);
    // Assert：网格格 → 像素（x*960/32；w*960/32）
    //         实测 66×45 公式区 = 网格 12..31×12..17 → 像素 360..960×688..1032
    assert_eq!(out[0].x, 360);
    assert_eq!(out[0].y, 688);
    assert_eq!(out[0].w, 600);
    assert_eq!(out[0].h, 344);
    // 全帧区域 → 全帧像素（不越界）
    assert_eq!(out[1].x, 0);
    assert_eq!(out[1].y, 0);
    assert_eq!(out[1].w, 960);
    assert_eq!(out[1].h, 1032);
}

#[test]
fn regions_to_frame_kind_and_flags_preserved() {
    // Arrange：表格区域（结构性标记需保留——产物层消费）
    let mut r = region(4, 2, 8, 3);
    r.kind = crate::layout_analyzer::RegionKind::Table;
    r.is_structural = true;
    // Act
    let out = regions_to_frame(&[r], 32, 18, 640, 360);
    // Assert：仅坐标换算，类型/置信度/结构标记不变
    assert_eq!(out[0].kind, crate::layout_analyzer::RegionKind::Table);
    assert!(out[0].is_structural);
    assert_eq!(out[0].confidence, 0.9);
    assert_eq!(out[0].x, 80);
    assert_eq!(out[0].w, 160);
}

#[test]
fn regions_to_frame_degenerate_safe() {
    // Arrange：非法尺寸 / 空输入
    let r = vec![region(1, 1, 2, 2)];
    // Act/Assert：零尺寸直通不崩溃；空输入返回空
    assert_eq!(regions_to_frame(&r, 0, 18, 960, 1032), r);
    assert_eq!(regions_to_frame(&r, 32, 0, 960, 1032), r);
    assert_eq!(regions_to_frame(&r, 32, 18, 0, 1032), r);
    assert!(regions_to_frame(&[], 32, 18, 960, 1032).is_empty());
}

#[test]
fn regions_to_frame_no_overflow_on_large_frame() {
    // Arrange：极端帧尺寸（u32 溢出防御——u64 中间计算）
    let r = vec![region(31, 17, 1, 1)];
    // Act
    let out = regions_to_frame(&r, 32, 18, u32::MAX, u32::MAX);
    // Assert：结果仍在 u32 内且按比例缩放（x*W 若用 u32 相乘会溢出回绕）
    assert_eq!(out[0].x, (31u64 * u32::MAX as u64 / 32) as u32);
    assert_eq!(out[0].w, (u32::MAX as u64 / 32) as u32);
    assert_eq!(out[0].h, (u32::MAX as u64 / 18) as u32);
}
