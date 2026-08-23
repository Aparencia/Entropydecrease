//! 帧特征提取（REQ-047 / v0.5.0 M3）：BGRA 帧 → 版面分析输入网格。
//!
//! @ai-context: 实时链路捕获帧为 BGRA8（DXGI/GDI 输出），版面分析需要降采样
//!              灰度网格（layout_analyzer::FrameGrid）——本模块做纯像素转换，
//!              不涉及分类逻辑（分类在 layout_analyzer，可独立单测）。
//! @ai-context: 网格粒度按帧宽高自适应（目标 ~32×18 格，每格取中心像素亮度均值近似）；
//!              亮度用 Rec.601 加权（与 ocr_cache::average_hash 同口径）。

use crate::layout_analyzer::FrameGrid;

/// 目标网格宽（格）。
/// @ai-context: v0.12.0 M5 补完成：grid_from_bgra 无生产调用方（视频会话版面
///              分析随全帧 OCR 下线——ADR-023），仅 structure_capture 测试交叉
///              校验网格口径使用——dead_code 豁免（机制先行模式，image_caption 先例）。
#[allow(dead_code)]
const TARGET_COLS: u32 = 32;
/// 目标网格高（格）。
#[allow(dead_code)]
const TARGET_ROWS: u32 = 18;

/// BGRA8 帧 → 版面分析网格（纯函数；尺寸/数据不匹配返回 None）。
///
/// @ai-context: 每格采样其中心像素的亮度（Rec.601：0.299R+0.587G+0.114B，
///              BGRA 存储序 = [B,G,R,A]）；网格尺寸不足时退化为 1 格。
/// @ai-context: v0.12.0 M5 补完成：生产调用方随视频会话版面分析下线（ADR-023），
///              保留纯函数与测试（structure_capture 同口径交叉校验）。
#[allow(dead_code)]
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

/// 版面区域：网格坐标 → 帧像素坐标（纯函数；编排层在 analyze_or_reuse 后调用）。
///
/// @ai-context: analyze_layout 输出网格坐标（0..cols-1 × 0..rows-1），而
///              crop_spec/map_to_frame 按帧像素消费——换算必须在此集中。
///              修复：此前两套坐标系混用（网格坐标被当像素裁剪），即使区域
///              分类正确也会裁错位置（44×30 角落小片），OCR 必然读不出内容。
/// @ai-context: 与 grid_from_bgra 采样同口径（(gx*width)/cols 整除，u64 防溢出）；
///              空入参/非法尺寸安全直通。
pub fn regions_to_frame(
    regions: &[crate::layout_analyzer::LayoutRegion],
    cols: u32,
    rows: u32,
    frame_w: u32,
    frame_h: u32,
) -> Vec<crate::layout_analyzer::LayoutRegion> {
    if cols == 0 || rows == 0 || frame_w == 0 || frame_h == 0 {
        return regions.to_vec();
    }
    regions
        .iter()
        .map(|r| {
            let mut out = r.clone();
            out.x = ((r.x as u64 * frame_w as u64) / cols as u64) as u32;
            out.y = ((r.y as u64 * frame_h as u64) / rows as u64) as u32;
            out.w = ((r.w as u64 * frame_w as u64) / cols as u64).max(1) as u32;
            out.h = ((r.h as u64 * frame_h as u64) / rows as u64).max(1) as u32;
            out
        })
        .collect()
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "frame_features_tests.rs"]
mod tests;
