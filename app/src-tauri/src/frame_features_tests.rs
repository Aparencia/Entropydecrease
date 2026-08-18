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
