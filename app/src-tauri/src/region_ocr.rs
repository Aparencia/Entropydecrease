//! 分区域 OCR 编排（REQ-048 / v0.5.0 M4）。
//!
//! @ai-context: 原始帧 → LayoutAnalyzer → 区域列表 → 逐区域裁剪（内存 crop + 边距）
//!              → 区域级预处理 → 现有 OcrEngine::recognize_image（复用零改动）
//!              → 坐标还原（原帧坐标 = 区域坐标 + 裁剪偏移 × 缩放系数）→ 合并回时间轴。
//! @ai-context: 本模块为纯逻辑（坐标还原/裁剪参数/区域调度封顶），可单测；
//!              实际 OCR 调用由编排层（live_session_frame）执行。
//! @ai-context: 回退链：layout 失败 → 整帧直跑（现状行为）；区域识别失败 →
//!              该区域标记 unknown（低置信 → 图片归档候选/AI 补缝 V1.0）。

use crate::layout_analyzer::{region_sampling_weight, LayoutRegion, RegionKind};

/// 区域裁剪边距（像素）：防文字贴边被切（规划 M4：10-20px）。
pub const CROP_MARGIN_PX: i32 = 12;
/// 每帧最多 OCR 区域数（防多区域调用失控，规划 M4："每帧最多 N 区"封顶）。
pub const MAX_REGIONS_PER_FRAME: usize = 4;

/// 帧坐标（原帧坐标系）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrameCoord {
    pub x: i32,
    pub y: i32,
}

/// 裁剪参数（区域 → 内存 crop 的输入）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CropSpec {
    /// 裁剪矩形（原帧坐标，含边距，已钳制到帧内）
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
    /// 放大系数（表格 2x / 小字放大；1.0=不放大）
    pub scale: f32,
}

/// 坐标还原（纯函数）：区域裁剪图内坐标 → 原帧坐标。
///
/// @ai-context: 区域 bbox 来自版面分析网格（layout_analyzer 输出已换算到帧坐标），
///              crop 时加了 CROP_MARGIN_PX 边距；OCR 结果坐标相对裁剪图，
///              还原公式：frame = bbox.origin + margin + region_coord × scale。
/// @ai-context: 边界防御：裁剪图内坐标越界钳制；负偏移（bbox 贴边）安全。
pub fn map_to_frame(
    region_coord: FrameCoord,
    region_bbox: &crate::capture::frame_diff::Rect,
    scale: f32,
) -> FrameCoord {
    let scale = if scale <= 0.0 { 1.0 } else { scale };
    let bx = region_bbox.left + CROP_MARGIN_PX;
    let by = region_bbox.top + CROP_MARGIN_PX;
    FrameCoord {
        x: bx + ((region_coord.x as f32) / scale).round() as i32,
        y: by + ((region_coord.y as f32) / scale).round() as i32,
    }
}

/// 生成区域裁剪参数（纯函数）：区域 bbox + 帧尺寸 → 含边距的 CropSpec。
///
/// @ai-context: 边距向四周扩张 CROP_MARGIN_PX，再钳制到帧内（贴边区域不越界）；
///              区域为空（钳制后无面积）返回 None。
pub fn crop_spec(
    region: &LayoutRegion,
    frame_width: u32,
    frame_height: u32,
) -> Option<CropSpec> {
    // 区域 bbox（网格坐标 → 帧坐标：M3 输出已按帧比例缩放，此处按 LayoutRegion
    // 语义直接使用；若网格粒度与帧不同，由编排层先换算——本函数只做边距与钳制）
    let (fw, fh) = (frame_width as i32, frame_height as i32);
    let left = (region.x as i32 - CROP_MARGIN_PX).max(0);
    let top = (region.y as i32 - CROP_MARGIN_PX).max(0);
    let right = ((region.x + region.w) as i32 + CROP_MARGIN_PX).min(fw);
    let bottom = ((region.y + region.h) as i32 + CROP_MARGIN_PX).min(fh);
    if right <= left || bottom <= top {
        return None;
    }
    let (width, height) = ((right - left) as u32, (bottom - top) as u32);
    // 区域级预处理：表格放大 2x（结构线保留），小区域（公式/代码）放大 1.5x
    let scale = match region.kind {
        RegionKind::Table => 2.0,
        RegionKind::Formula | RegionKind::Code => 1.5,
        _ => 1.0,
    };
    Some(CropSpec { left, top, width, height, scale })
}

/// 区域调度（纯函数）：按区域价值权重降序 + 每帧封顶。
///
/// @ai-context: 区域类型 → 采样权重（region_sampling_weight：table 高/装饰跳过）；
///              排序后取前 MAX_REGIONS_PER_FRAME——预算联动（REQ-039 升级）。
/// @ai-context: 跳过型区域（image）直接滤除（图集 M6 处理，不进 OCR）。
pub fn schedule_regions(regions: &[LayoutRegion]) -> Vec<&LayoutRegion> {
    let mut weighted: Vec<&LayoutRegion> = regions
        .iter()
        .filter(|r| !region_sampling_weight(r.kind).1)
        .collect();
    weighted.sort_by(|a, b| {
        let wa = region_sampling_weight(a.kind).0;
        let wb = region_sampling_weight(b.kind).0;
        wb.partial_cmp(&wa).unwrap_or(std::cmp::Ordering::Equal)
    });
    weighted.truncate(MAX_REGIONS_PER_FRAME);
    weighted
}

/// 区域识别结果（编排层回填：区域 + 还原后的块）。
///
/// @ai-context: 当前编排层内联处理区域结果（region_ocr_blocks），本结构为
///              测试契约与后续产物/补缝消费预留，登记豁免 dead_code。
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub struct RegionOcrResult {
    pub region: LayoutRegion,
    /// 区域级识别失败（true → 该区域标记 unknown，整帧结果不受影响）
    pub failed: bool,
}

/// 分区域 OCR 编排（REQ-048）：区域调度（权重+封顶）→ 逐区域裁剪 →
/// 区域级预处理（放大）→ 识别 → 坐标还原 + region_kind 标注 → 合并。
///
/// @ai-context: 区域识别失败不阻断整体（该区域标记 unknown，低置信 → 图片归档候选）；
///              坐标还原（map_to_frame）为纯函数单测覆盖（region_ocr_tests）。
/// @ai-context: 每帧最多 MAX_REGIONS_PER_FRAME 区（防多区域调用失控）。
/// @ai-context: 本函数由 live_session_frame 的全帧分支调用（M4 编排接入）；
///              返回 (合并块, 失败区域数)——失败计数由调用方并入 ScreenStats。
/// @ai-context: v0.5.0 模型版（REQ-049/050）：table/formula 区域的裁剪图
///              同步归档到会话图片库（课后精修输入；模型未启用时零成本跳过）。
pub fn region_ocr_blocks(
    frame: &crate::capture::dxgi_capture::CapturedFrame,
    engines: &crate::engine::EnginePool,
    regions: &[LayoutRegion],
    image_store: &mut Option<crate::image_store::SessionImageStore>,
) -> (Vec<crate::types::OcrBlock>, u32) {
    let scheduled = schedule_regions(regions);
    let mut merged: Vec<crate::types::OcrBlock> = Vec::new();
    let mut failed = 0u32;
    for region in scheduled {
        let Some(spec) = crop_spec(region, frame.width, frame.height) else {
            continue;
        };
        // 内存裁剪（含边距）→ 区域级预处理（表格/公式放大）
        let Some((mut crop, mut cw, mut ch)) =
            crop_region_bgra(&frame.bgraw, frame.width, frame.height, &spec)
        else {
            continue;
        };
        if let Some((up, uw, uh)) = upscale_bgra(&crop, cw, ch, spec.scale) {
            crop = up;
            cw = uw;
            ch = uh;
        }
        // v0.5.0 模型版：table/formula 区域裁剪图归档（课后精修输入；
        // 归档失败不阻断 OCR——静默降级日志可观测）
        if matches!(region.kind, RegionKind::Table | RegionKind::Formula) {
            if let Some(store) = image_store.as_mut() {
                if let Err(e) = store.save_frame(frame.timestamp_ms, &crop, cw, ch) {
                    eprintln!("[RegionOcr] 区域裁剪图归档失败（精修将跳过该区域）: {}", e);
                }
            }
        }
        let Some(rgb) = bgra_to_rgb_image(&crop, cw, ch) else { continue };
        match engines.recognize_image(rgb) {
            Ok(blocks) => {
                for mut b in blocks {
                    // 坐标还原：裁剪图坐标 → 原帧坐标（bbox 相对 OCR 输入图）
                    if let Some(bbox) = b.bbox {
                        let origin = crate::capture::frame_diff::Rect {
                            left: region.x as i32,
                            top: region.y as i32,
                            right: (region.x + region.w) as i32,
                            bottom: (region.y + region.h) as i32,
                        };
                        let mapped = map_to_frame(
                            FrameCoord { x: bbox.x as i32, y: bbox.y as i32 },
                            &origin,
                            spec.scale,
                        );
                        b.bbox = Some(crate::types::TextBox {
                            x: mapped.x as f32,
                            y: mapped.y as f32,
                            w: bbox.w / spec.scale,
                            h: bbox.h / spec.scale,
                        });
                    }
                    // 区域类型标注（M4：产物/补缝判定器消费）
                    b.region_kind = Some(region.kind.as_str().to_string());
                    merged.push(b);
                }
            }
            Err(e) => {
                // 区域级失败：标记 unknown 不阻断整体（诚实降级）
                failed += 1;
                eprintln!("[ScreenWorker] 区域 {:?} 识别失败（标记 unknown）: {}", region.kind, e);
            }
        }
    }
    (merged, failed)
}

/// BGRA8 像素 → image::RgbImage（纯函数；尺寸与像素长度不匹配返回 None）。
pub fn bgra_to_rgb_image(bgraw: &[u8], width: u32, height: u32) -> Option<image::RgbImage> {
    let pixel_len = width as usize * height as usize * 4;
    if width == 0 || height == 0 || bgraw.len() != pixel_len {
        return None;
    }
    let mut rgb = Vec::with_capacity(pixel_len / 4 * 3);
    for px in bgraw.chunks_exact(4) {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    image::RgbImage::from_raw(width, height, rgb)
}

/// 区域类型标识（kebab-case，落库/前端契约；与 serde 序列化同口径）。
impl RegionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            RegionKind::Text => "text",
            RegionKind::Table => "table",
            RegionKind::Formula => "formula",
            RegionKind::Code => "code",
            RegionKind::Image => "image",
            RegionKind::Unknown => "unknown",
        }
    }
}

/// 从 BGRA8 帧裁剪区域（纯函数）：按 CropSpec 输出区域图像（BGRA8）。
///
/// @ai-context: 区域裁剪在内存完成（不落盘）；返回 (像素, 宽, 高)；
///              裁剪区越界已由 crop_spec 钳制，此处仅做像素拷贝。
pub fn crop_region_bgra(
    bgraw: &[u8],
    frame_width: u32,
    frame_height: u32,
    spec: &CropSpec,
) -> Option<(Vec<u8>, u32, u32)> {
    let fw = frame_width as usize;
    let fh = frame_height as usize;
    if bgraw.len() != fw * fh * 4 || spec.width == 0 || spec.height == 0 {
        return None;
    }
    let (left, top) = (spec.left as usize, spec.top as usize);
    let (w, h) = (spec.width as usize, spec.height as usize);
    if left + w > fw || top + h > fh {
        return None;
    }
    let mut out = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        let src_row = (top + y) * fw * 4;
        out.extend_from_slice(&bgraw[src_row + left * 4..src_row + (left + w) * 4]);
    }
    Some((out, spec.width, spec.height))
}

/// 最近邻放大 BGRA8 帧（纯函数）：scale >1 时放大（表格/公式区域预处理）。
///
/// @ai-context: 区域级预处理（规划 M4：表格放大 2x / 公式高对比 / 小字放大）——
///              放大提升小字/细线识别质量；scale ≤1 原样返回（零拷贝语义由调用方
///              处理：返回 clone 不经济时由调用方判断跳过）。
pub fn upscale_bgra(
    bgraw: &[u8],
    width: u32,
    height: u32,
    scale: f32,
) -> Option<(Vec<u8>, u32, u32)> {
    if scale <= 1.0 || width == 0 || height == 0 {
        return Some((bgraw.to_vec(), width, height));
    }
    let (sw, sh) = (width as usize, height as usize);
    if bgraw.len() != sw * sh * 4 {
        return None;
    }
    let (dw, dh) = (
        ((width as f32) * scale).round().max(1.0) as usize,
        ((height as f32) * scale).round().max(1.0) as usize,
    );
    let mut out = Vec::with_capacity(dw * dh * 4);
    for y in 0..dh {
        let src_y = (y * sh) / dh;
        let src_row = src_y * sw * 4;
        for x in 0..dw {
            let src_x = (x * sw) / dw;
            let i = src_row + src_x * 4;
            out.extend_from_slice(&bgraw[i..i + 4]);
        }
    }
    Some((out, dw as u32, dh as u32))
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "region_ocr_tests.rs"]
mod tests;
