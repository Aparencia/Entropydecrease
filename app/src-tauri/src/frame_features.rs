//! 帧特征提取（REQ-047 / v0.5.0 M3）：BGRA 帧 → 版面分析输入网格。
//!
//! @ai-context: 实时链路捕获帧为 BGRA8（DXGI/GDI 输出），版面分析需要降采样
//!              灰度网格（layout_analyzer::FrameGrid）——本模块做纯像素转换，
//!              不涉及分类逻辑（分类在 layout_analyzer，可独立单测）。
//! @ai-context: 网格粒度按帧宽高自适应（目标 ~32×18 格，每格取中心像素亮度均值近似）；
//!              亮度用 Rec.601 加权（与 ocr_cache::average_hash 同口径）。

use crate::layout_analyzer::FrameGrid;

/// 目标网格宽（格）。
const TARGET_COLS: u32 = 32;
/// 目标网格高（格）。
const TARGET_ROWS: u32 = 18;

/// BGRA8 帧 → 版面分析网格（纯函数；尺寸/数据不匹配返回 None）。
///
/// @ai-context: 每格采样其中心像素的亮度（Rec.601：0.299R+0.587G+0.114B，
///              BGRA 存储序 = [B,G,R,A]）；网格尺寸不足时退化为 1 格。
pub fn grid_from_bgra(bgraw: &[u8], width: u32, height: u32) -> Option<FrameGrid> {
    if width == 0 || height == 0 || bgraw.len() != (width as usize) * (height as usize) * 4 {
        return None;
    }
    let cols = TARGET_COLS.min(width).max(1);
    let rows = TARGET_ROWS.min(height).max(1);
    let mut cells = Vec::with_capacity((cols * rows) as usize);
    for gy in 0..rows {
        let y = (gy * height) / rows;
        for gx in 0..cols {
            let x = (gx * width) / cols;
            let i = ((y * width + x) as usize) * 4;
            // BGRA：b=raw[i], g=raw[i+1], r=raw[i+2]
            let b = bgraw[i] as u32;
            let g = bgraw[i + 1] as u32;
            let r = bgraw[i + 2] as u32;
            let luma = (r * 299 + g * 587 + b * 114) / 1000;
            cells.push(luma.clamp(0, 255) as u8);
        }
    }
    Some(FrameGrid { cols, rows, cells })
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "frame_features_tests.rs"]
mod tests;
