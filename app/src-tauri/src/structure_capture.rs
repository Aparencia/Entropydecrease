//! 结构图批量捕获管线（REQ-182 / v0.7.7）：屏 → 选优帧 → 版面分析 → 过滤 → 裁剪 → 入库。
//!
//! @ai-context: 非线性结构（表格/公式/代码/流程图等）"图像即产物"兜底（ADR-010）：
//!              会话停止后批量执行（live 停止链路触发）+ 图库「重新捕获」可重跑
//!              （same_image 去重保证幂等——同图不重复入库）。
//! @ai-context: 方案 A+（2026-08-20 裁决）：不动实时链路——对每屏时间窗内的
//!              归档 full 帧采样（≤8 帧 bound 解码成本）→ pick_sharpest 选优
//!              （边缘能量，动效结束后的稳定清晰帧）→ analyze_layout 复用 →
//!              table/formula/code 直收 + Image 过 diagram_likeness → 白边裁剪
//!              （image_crop 机制）→ struct/ + 记录入库。
//! @ai-context: 预算耗尽（auto 桶 80/会话）→ 停止本会话后续捕获（summary 标记，
//!              命令层提示）；旧会话无屏/无图 → 自然跳过（降级链）。

use std::path::Path;

use crate::db::Db;
use crate::error::Result;
use crate::layout_analyzer::{analyze_layout, FrameGrid, LayoutRegion};
use crate::structure_detect::{filter_structure_regions, pick_sharpest};

/// 每屏采样上限（帧解码成本 bound——屏窗口内归档帧通常 1-2 张，长屏最多 8）。
const MAX_FRAMES_PER_SCREEN: usize = 8;

/// 捕获结果摘要（命令层事件/前端提示数据源）。
#[derive(Debug, Clone, Copy, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSummary {
    /// 有图屏数（参与扫描的屏）
    pub screens_scanned: usize,
    /// 实际入库结构图数
    pub captured: usize,
    /// 自动桶预算是否耗尽（提前终止）
    pub budget_exhausted: bool,
}

/// 批量捕获主入口（编排 + IO；纯逻辑均在 structure_detect/layout_analyzer）。
///
/// @ai-context: now_ms 注入（文件名时间基；测试可控）；每屏独立失败不阻断
///              （解码失败帧跳过、无候选屏跳过——诚实降级）。
pub fn capture_session_structures(
    db: &Db,
    data_dir: &Path,
    session_id: i64,
    now_ms: u64,
) -> Result<CaptureSummary> {
    let images_dir = data_dir.join("session-images").join(session_id.to_string());
    let blocks = db.list_ocr_blocks(session_id)?;
    // ① 屏构建（复用屏卡体系；只保留有归档图的屏——无图无法裁剪）
    let mut screens = crate::screens::build_screens(&blocks, Some(&images_dir));
    screens.retain(|s| s.image_ref.is_some());
    let mut store = crate::structure_store::StructureImageStore::new(images_dir.clone())?;
    let mut summary = CaptureSummary { screens_scanned: screens.len(), ..Default::default() };
    let mut seq = 0u64;
    for screen in &screens {
        // ② 屏时间窗内归档帧采样（≤8 均匀）
        let candidates = frame_candidates(
            &images_dir,
            screen.first_seen_ms,
            screen.last_seen_ms,
            MAX_FRAMES_PER_SCREEN,
        );
        // ③ 解码（失败帧跳过）+ 网格
        let decoded = decode_candidates(&images_dir, &candidates);
        if decoded.is_empty() {
            continue;
        }
        let grids: Vec<(u64, FrameGrid)> =
            decoded.iter().map(|(ts, img)| (*ts, grid_from_rgb(img))).collect();
        // ④ 选优帧（边缘能量最高；全零能量 → 该屏跳过）
        let Some(idx) = pick_sharpest(&grids) else { continue };
        let grid = &grids[idx].1;
        // ⑤ 版面分析 + 区域过滤（结构三类直收 + Text/Image 门控）
        let kept = filter_structure_regions(&analyze_layout(grid), grid);
        if kept.is_empty() {
            continue;
        }
        let frame = &decoded[idx].1;
        let frame_regions = crate::frame_features::regions_to_frame(
            &kept,
            grid.cols,
            grid.rows,
            frame.width(),
            frame.height(),
        );
        // ⑥ 逐区域裁剪 → 存储 → 记录
        for r in frame_regions {
            let Some(crop) = crop_region(frame, &r) else { continue };
            let bgra = rgb_to_bgra(&crop);
            seq += 1;
            match store.save_auto(now_ms + seq, &bgra, crop.width(), crop.height()) {
                Ok(outcome) => {
                    // 去重命中（跨屏同图/重跑）：不重复插记录——同图只留一份
                    if !outcome.is_new {
                        continue;
                    }
                    crate::db_structures::insert_structure_image(
                        db,
                        &crate::db_structures::StructureImageRecord {
                            id: 0,
                            session_id,
                            screen_id: screen.screen_id,
                            kind: kind_name(r.kind),
                            bbox: bbox_json(&r),
                            source_ts_ms: grids[idx].0,
                            crop_path: outcome.rel,
                            source: "auto".to_string(),
                            created_at: now_ms + seq,
                        },
                    )?;
                    summary.captured += 1;
                }
                // 预算耗尽：终止本会话后续捕获（已捕获保留）
                Err(_) => {
                    summary.budget_exhausted = true;
                    return Ok(summary);
                }
            }
        }
    }
    Ok(summary)
}

/// 屏时间窗内归档帧候选（纯函数）：时间戳 ∈ [first, last]；超出采样上限
/// 均匀抽样（bound 解码成本）；目录缺失/空 → 空列表。
fn frame_candidates(
    images_dir: &Path,
    first_ms: u64,
    last_ms: u64,
    max: usize,
) -> Vec<u64> {
    let in_window: Vec<u64> = crate::screens::list_full_image_timestamps(images_dir)
        .into_iter()
        .filter(|t| *t >= first_ms && *t <= last_ms)
        .collect();
    if in_window.len() <= max {
        return in_window;
    }
    // 均匀抽样（首尾必含——首帧=屏开始画面、尾帧=最近画面，都值得参与选优）
    let last = in_window.len() - 1;
    (0..max)
        .map(|i| in_window[((i as f32 * last as f32 / (max - 1) as f32).round() as usize)])
        .collect()
}

/// 解码候选帧（纯 IO）：webp → RGB；解码失败帧跳过（不阻断）。
fn decode_candidates(images_dir: &Path, timestamps: &[u64]) -> Vec<(u64, image::RgbImage)> {
    timestamps
        .iter()
        .filter_map(|t| {
            let img = image::open(images_dir.join("full").join(format!("{t}.webp")))
                .ok()?
                .to_rgb8();
            Some((*t, img))
        })
        .collect()
}

/// RGB 帧 → 版面网格（纯函数；与 frame_features::grid_from_bgra 同口径：
/// 目标 ~32×18 格、中心像素采样、Rec.601 亮度）。
fn grid_from_rgb(rgb: &image::RgbImage) -> FrameGrid {
    let (width, height) = (rgb.width(), rgb.height());
    let cols = 32u32.min(width).max(1);
    let rows = 18u32.min(height).max(1);
    let mut cells = Vec::with_capacity((cols * rows) as usize);
    for gy in 0..rows {
        let y = (gy * height) / rows;
        for gx in 0..cols {
            let x = (gx * width) / cols;
            let p = rgb.get_pixel(x, y);
            let luma = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
            cells.push(luma.clamp(0, 255) as u8);
        }
    }
    FrameGrid { cols, rows, cells }
}

/// 区域裁剪（纯函数）：帧像素坐标 → 子图；越界钳制（不 panic），空尺寸 → None。
fn crop_region(frame: &image::RgbImage, r: &LayoutRegion) -> Option<image::RgbImage> {
    let x = r.x.min(frame.width());
    let y = r.y.min(frame.height());
    let w = r.w.min(frame.width() - x);
    let h = r.h.min(frame.height() - y);
    if w == 0 || h == 0 {
        return None;
    }
    Some(image::imageops::crop_imm(frame, x, y, w, h).to_image())
}

/// RGB → BGRA（结构图存储契约；纯函数）。
fn rgb_to_bgra(rgb: &image::RgbImage) -> Vec<u8> {
    let mut out = Vec::with_capacity((rgb.width() * rgb.height() * 4) as usize);
    for p in rgb.pixels() {
        out.extend_from_slice(&[p[2], p[1], p[0], 255]);
    }
    out
}

/// 区域类型 → 记录 kind（与 DB 字符串枚举一致）。
fn kind_name(kind: crate::layout_analyzer::RegionKind) -> String {
    match kind {
        crate::layout_analyzer::RegionKind::Table => "table",
        crate::layout_analyzer::RegionKind::Formula => "formula",
        crate::layout_analyzer::RegionKind::Code => "code",
        crate::layout_analyzer::RegionKind::Image => "image",
        _ => "unknown",
    }
    .to_string()
}

/// bbox JSON（帧坐标；记录契约）。
fn bbox_json(r: &LayoutRegion) -> String {
    format!(r#"{{"x":{},"y":{},"w":{},"h":{}}}"#, r.x, r.y, r.w, r.h)
}

#[cfg(test)]
#[path = "structure_capture_tests.rs"]
mod tests;
