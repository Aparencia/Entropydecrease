//! 图文会话截图保存 + OCR 编排（v0.11.7，ADR-020）。
//!
//! @ai-context: 用户框选截屏 → base64（PNG 无损，前端 canvas 裁剪）→ 解码验证 →
//!              存图（full+thumb，双指纹去重）→ 全图 OCR（960px 口径，bbox 反算）
//!              → OCR 块落库（region=full，screen_id=None 走视图层聚类）。
//! @ai-context: 与实时/导入链路 OCR 口径统一（960px 缩放 + score≥0.5）；与自动
//!              采帧不同：用户显式框选的内容不过 UI 垃圾黑名单（意图即内容）。
//! @ai-context: OCR 失败不阻断截图保存（图已落盘，block_count=0 诚实返回）。

use base64::Engine;
use image::GenericImageView;
use serde::Serialize;

use crate::db::Db;
use crate::engine::EnginePool;
use crate::image_store::SessionImageStore;
use crate::types::{NewSessionOcrBlock, TextBox};

/// OCR 输入最大宽度（与实时/导入链路同口径——推理成本近平方下降）。
const OCR_MAX_WIDTH: u32 = 960;
/// OCR 块最低置信度（与实时/导入链路同口径）。
const MIN_SCORE: f32 = 0.5;
/// 识别预览条数上限（前端即时反馈）。
const PREVIEW_MAX: usize = 3;
/// 单图 base64 解码后字节上限（16MB——解码前拒绝，省 CPU）。
const MAX_PHOTO_BYTES: usize = 16 * 1024 * 1024;

/// 截图保存结果（前端反馈契约；camelCase 与前端 PhotoResult 对齐）。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoCaptureResult {
    /// 双指纹命中（与最近保存图相同，未重复存图/未重复落块）
    pub duplicated: bool,
    /// 新落库 OCR 块数（OCR 失败/超时可能为 0）
    pub block_count: usize,
    /// 识别文本预览（≤3 条；空 = 未识别出文字）
    pub preview: Vec<String>,
    /// 图片相对路径（full/<ts>.webp）
    pub image_ref: String,
}

/// 保存截图并 OCR（主入口；注入 store/DB/引擎池——端到端可测）。
///
/// @ai-context: store 由调用方跨命令持有（命令层互斥槽内复用）——双指纹去重
///              FIFO 是内存态，每次 new 会清空导致去重失效（实时链路即长驻
///              store）；budget 计数同样跨截图累计（50 张预算会话级生效）。
/// @ai-context: OCR 有界等待 ≤20s——调用方在锁内调用时锁时长与此相当；
///              图文采集为用户串行动线（同刻仅一个截图保存），可接受。
pub fn save_photo_capture(
    store: &mut SessionImageStore,
    db: &Db,
    engines: &EnginePool,
    session_id: i64,
    image_b64: &str,
    timestamp_ms: u64,
) -> Result<PhotoCaptureResult, String> {
    let img = decode_image(image_b64)?;
    let (w, h) = img.dimensions();
    // ① 存图：RGB → BGRA8（save_frame 输入口径）→ full+thumb + 双指纹去重
    let bgra: Vec<u8> = img.pixels().flat_map(|p| [p[2], p[1], p[0], 255u8]).collect();
    let rel = store
        .save_frame(timestamp_ms, &bgra, w, h)
        .map_err(|e| format!("保存截图失败: {}", e))?;
    // 重复判定：save_frame 对重复帧返回已有路径（旧时间戳）——文件名 ≠ 本次 ts 即重复
    let duplicated = rel != format!("full/{}.webp", timestamp_ms);
    if duplicated {
        return Ok(PhotoCaptureResult { duplicated: true, block_count: 0, preview: Vec::new(), image_ref: rel });
    }
    // ② 全图 OCR（960px 口径；失败/超时降级——图已保存）
    let (blocks, scale) = ocr_blocks(&img, engines);
    // ③ 落库（不过 UI 垃圾黑名单——用户显式框选的内容即意图）
    let mut count = 0usize;
    let mut preview = Vec::new();
    for b in blocks {
        if b.score < MIN_SCORE || b.text.trim().is_empty() {
            continue;
        }
        count += 1;
        if preview.len() < PREVIEW_MAX {
            preview.push(b.text.clone());
        }
        if let Err(e) = db.add_ocr_block(&NewSessionOcrBlock {
            session_id,
            timestamp_ms,
            text: b.text,
            score: b.score,
            region: "full".to_string(),
            region_kind: None,
            bbox: b.bbox.map(|bb| TextBox {
                x: bb.x * scale,
                y: bb.y * scale,
                w: bb.w * scale,
                h: bb.h * scale,
            }),
            screen_id: None,
        }) {
            eprintln!("[Photo] OCR 块落库失败: {}", e);
        }
    }
    Ok(PhotoCaptureResult { duplicated: false, block_count: count, preview, image_ref: rel })
}

/// base64 解码 + 解码器验证（白名单由 image 解码器把关——capture_fragment 同模式）。
fn decode_image(image_b64: &str) -> Result<image::RgbImage, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_b64.trim())
        .map_err(|e| format!("图片 base64 解码失败: {}", e))?;
    if bytes.is_empty() {
        return Err("图片数据为空".to_string());
    }
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err(format!("图片超限（>{}MB）", MAX_PHOTO_BYTES / 1024 / 1024));
    }
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("图片解码失败（仅支持 PNG/JPEG 等常见格式）: {}", e))?;
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("图片尺寸非法".to_string());
    }
    Ok(img.to_rgb8())
}

/// 全图 OCR：缩至 960px 后识别，返回 (块, bbox 缩放比)。
/// @ai-context: 缩放比用于 bbox 反算回原图坐标系（TD-046 同思路——OCR 输入
///              缩小后 bbox 处于缩小坐标系）。
fn ocr_blocks(img: &image::RgbImage, engines: &EnginePool) -> (Vec<crate::types::OcrBlock>, f32) {
    let (w, h) = img.dimensions();
    let scale = if w > OCR_MAX_WIDTH { w as f32 / OCR_MAX_WIDTH as f32 } else { 1.0 };
    let input = if w > OCR_MAX_WIDTH {
        let new_h = (h as u64 * OCR_MAX_WIDTH as u64 / w as u64).max(1) as u32;
        image::imageops::resize(img, OCR_MAX_WIDTH, new_h, image::imageops::FilterType::Triangle)
    } else {
        img.clone()
    };
    match engines.recognize_image_timeout(input, crate::engine::OCR_REQUEST_TIMEOUT) {
        Ok(blocks) => (blocks, scale),
        Err(e) => {
            // OCR 失败/超时：图已保存，块数 0 诚实返回（下张截图重试语义）
            eprintln!("[Photo] OCR 失败（截图已保存，块数 0）: {}", e);
            (Vec::new(), scale)
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "photo_capture_tests.rs"]
mod tests;
