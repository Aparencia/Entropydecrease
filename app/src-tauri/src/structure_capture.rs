//! 结构图批量捕获管线（REQ-182 / v0.7.7；v0.10.2 重构）：参考图集 → 版面分析 → 过滤 → 裁剪 → 入库。
//!
//! @ai-context: 非线性结构（表格/公式/代码/流程图等）"图像即产物"兜底（ADR-010）：
//!              v0.10.2 起取消逐屏自动捕获（会话 33 实测 50%+ 误收字幕条）——
//!              改为手动一键分析参考图集（full/ 全部归档帧，与图集画廊同源）：
//!              逐帧 decode → analyze_layout → regions_to_frame → decide_keep
//!              （L0 字幕重叠 / L1 版面类型 / L2 OCR 置信度反向 / L3 位置约束）
//!              → 白边裁剪（image_crop 机制）→ struct/ + 记录入库。
//! @ai-context: 去重（same_image）保证幂等——同图不重复入库，可重复分析；
//!              预算耗尽（auto 桶 80/会话）→ 停止本会话后续捕获（summary 标记，
//!              命令层提示）；旧会话无图 → 自然跳过（降级链）。

use std::path::Path;

use crate::db::Db;
use crate::error::Result;
use crate::layout_analyzer::{analyze_layout, FrameGrid, LayoutRegion, RegionKind};
use crate::structure_detect::{decide_keep, diagram_likeness, StructureFilterContext};
use crate::types::SessionOcrBlock;

/// OCR 块过滤时间窗（±3s）：字幕/full 块按帧时间戳对齐（同时间基：相对会话
/// 起点 ms）。字幕持续出现，相邻帧块可跨帧关联；窗太宽会引入他帧噪声。
const STRUCTURE_OCR_WINDOW_MS: u64 = 3_000;

/// 捕获结果摘要（命令层事件/前端提示数据源）。
#[derive(Debug, Clone, Copy, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSummary {
    /// 扫描参考图数（full/ 归档帧）
    pub images_scanned: usize,
    /// 实际入库结构图数
    pub captured: usize,
    /// 自动桶预算是否耗尽（提前终止）
    pub budget_exhausted: bool,
}

/// 批量捕获主入口（编排 + IO；纯逻辑均在 structure_detect/layout_analyzer）。
///
/// @ai-context: now_ms 注入（文件名时间基；测试可控）；逐帧独立失败不阻断
///              （解码失败帧跳过——诚实降级）。
pub fn capture_session_structures(
    db: &Db,
    data_dir: &Path,
    session_id: i64,
    now_ms: u64,
) -> Result<CaptureSummary> {
    let images_dir = data_dir.join("session-images").join(session_id.to_string());
    // ① 参考图集时间戳（全量；与图集画廊 list_session_images 同源）
    let timestamps = crate::screens::list_full_image_timestamps(&images_dir);
    // ② OCR 块（过滤上下文数据源：字幕 bbox + full 块置信度）
    let blocks = db.list_ocr_blocks(session_id)?;
    let mut store = crate::structure_store::StructureImageStore::new(images_dir.clone())?;
    let mut summary = CaptureSummary { images_scanned: timestamps.len(), ..Default::default() };
    let mut seq = 0u64;
    for ts in timestamps {
        // ③ 解码（失败帧跳过，不阻断后续帧）
        let Some(frame) = decode_frame(&images_dir, ts) else { continue };
        let grid = grid_from_rgb(&frame);
        // ④ 版面分析（网格坐标）→ 帧坐标区域（顺序保持，索引对应）
        let analyzed = analyze_layout(&grid);
        let frame_regions = crate::frame_features::regions_to_frame(
            &analyzed,
            grid.cols,
            grid.rows,
            frame.width(),
            frame.height(),
        );
        if frame_regions.is_empty() {
            continue;
        }
        // ⑤ 过滤上下文（时间窗 ±3s）——逐帧组装（按帧 ts 对齐）
        let ctx = build_filter_context(&blocks, ts);
        // ⑥ 逐区域判定 → 裁剪 → 存储 → 记录
        for (i, r) in frame_regions.iter().enumerate() {
            // 预算前置检查（save_auto 内部同检查——前置拦截避免单区域编码/IO
            // 错误被误判为预算耗尽而终止整个会话：审查修复）
            if store.remaining_budget() == 0 {
                summary.budget_exhausted = true;
                return Ok(summary);
            }
            // 图结构似然（仅 Image/Text 需要；结构三类 0.0 占位）
            let diagram_score = match r.kind {
                RegionKind::Image | RegionKind::Text => {
                    let gr = &analyzed[i];
                    diagram_likeness(&grid, gr.x, gr.y, gr.x + gr.w - 1, gr.y + gr.h - 1)
                }
                _ => 0.0,
            };
            // 四层判定（L3 位置 → L0 字幕重叠 → L1 类型 → L2 OCR 置信度）
            if !decide_keep(
                r.kind,
                r,
                diagram_score,
                &ctx,
                frame.width(),
                frame.height(),
            ) {
                continue;
            }
            let Some(crop) = crop_region(&frame, r) else { continue };
            let bgra = rgb_to_bgra(&crop);
            seq += 1;
            match store.save_auto(now_ms + seq, &bgra, crop.width(), crop.height()) {
                Ok(outcome) => {
                    // 去重命中（跨帧同图/重跑）：不重复插记录——同图只留一份
                    if !outcome.is_new {
                        continue;
                    }
                    crate::db_structures::insert_structure_image(
                        db,
                        &crate::db_structures::StructureImageRecord {
                            id: 0,
                            session_id,
                            screen_id: None,
                            kind: kind_name(r.kind),
                            bbox: bbox_json(r),
                            source_ts_ms: ts,
                            crop_path: outcome.rel,
                            source: "auto".to_string(),
                            created_at: now_ms + seq,
                        },
                    )?;
                    summary.captured += 1;
                }
                // 单区域失败（编码/IO）不阻断后续区域——仅留日志（预算已前置）
                Err(e) => {
                    eprintln!("[Structures] 结构图入库失败（跳过该区域）: {e}");
                }
            }
        }
    }
    Ok(summary)
}

/// 过滤上下文组装（纯函数）：OCR 块 → 帧时间窗 ±STRUCTURE_OCR_WINDOW_MS 内信号。
///
/// @ai-context: 字幕块（region="subtitle"）进 subtitle_boxes（L0 重叠拦截）；
///              其余（region="full"）进 full_blocks 带置信度（L2 反向信号）。
///              无 bbox 的旧数据块跳过（无法参与重叠判定——L3 位置兜底）。
fn build_filter_context(blocks: &[SessionOcrBlock], ts: u64) -> StructureFilterContext {
    let (lo, hi) = (
        ts.saturating_sub(STRUCTURE_OCR_WINDOW_MS),
        ts + STRUCTURE_OCR_WINDOW_MS,
    );
    let mut ctx = StructureFilterContext {
        subtitle_boxes: Vec::new(),
        full_blocks: Vec::new(),
    };
    for b in blocks {
        if b.timestamp_ms < lo || b.timestamp_ms > hi {
            continue;
        }
        if let Some(bb) = b.bbox {
            if b.region == "subtitle" {
                ctx.subtitle_boxes.push(bb);
            } else {
                ctx.full_blocks.push((bb, b.score));
            }
        }
    }
    ctx
}

/// 解码单帧（纯 IO）：webp → RGB；失败 → None（调用方跳过该帧）。
fn decode_frame(images_dir: &Path, ts: u64) -> Option<image::RgbImage> {
    image::open(images_dir.join("full").join(format!("{ts}.webp")))
        .ok()?
        .to_rgb8()
        .into()
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
/// @ai-context: pub(crate)（审查修复）：commands_structures 手动捕获复用——
///              消除两处重复实现。
pub(crate) fn rgb_to_bgra(rgb: &image::RgbImage) -> Vec<u8> {
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
