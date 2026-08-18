//! 导入关键帧画面处理（REQ-015，ADR-008；TD-037 区域裁剪优化）。
//!
//! @ai-context: "区域裁剪 → 识别 → 信息整合"：关键帧按语义分两路识别——
//!              中部区域（画面要点，region=full，避开标题栏/字幕带）与
//!              底部区域（烧录字幕，region=subtitle，与实时链路 region 语义一致）。
//!              烧录字幕是 L1/L2 探测不到的硬字幕，底部裁剪保证其不被丢弃。
//! @ai-context: 两路均缩至 960px 宽（OCR 成本近平方下降，相对全帧直识别快 ~4 倍）；
//!              帧间文本集合去重——10s 采样下静态画面（老师站桩）不重复落库。
//! @ai-context: 本模块纯图像/文本逻辑（无 ffmpeg 依赖），管线编排在 import.rs。

use crate::db::Db;
use crate::engine::EnginePool;
use crate::types::NewSessionOcrBlock;

/// 中部区域上下边界（帧高度比例）：顶部 5%（避开标题栏）~ 75%（避开字幕带）。
const MIDDLE_TOP_RATIO: f32 = 0.05;
const MIDDLE_BOTTOM_RATIO: f32 = 0.75;
/// 底部区域（烧录字幕带）上边界（比例）。
const BOTTOM_TOP_RATIO: f32 = 0.75;
/// OCR 输入最大宽度（与实时链路 P4 同口径）。
const OCR_MAX_WIDTH: u32 = 960;
/// OCR 块最低置信度（与实时链路全帧识别同口径）。
const MIN_SCORE: f32 = 0.5;

/// 区域裁剪 + 等比缩放（纯函数）：按帧高度比例裁剪 RgbImage 并缩至最大宽度。
///
/// @ai-context: 区域比例非法（bottom ≤ top / 越界）或 max_width=0 返回 None；
///              缩放用 Triangle 滤波（文字边缘优于 Nearest）。
pub fn crop_and_scale(
    img: &image::RgbImage,
    top_ratio: f32,
    bottom_ratio: f32,
    max_width: u32,
) -> Option<image::RgbImage> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 || max_width == 0 {
        return None;
    }
    let top = (h as f32 * top_ratio) as u32;
    let bottom = (h as f32 * bottom_ratio) as u32;
    if bottom <= top || bottom > h {
        return None;
    }
    let cropped = image::imageops::crop_imm(img, 0, top, w, bottom - top).to_image();
    if cropped.width() <= max_width {
        return Some(cropped);
    }
    let new_h = ((cropped.height() as u64) * (max_width as u64) / (cropped.width() as u64)).max(1) as u32;
    Some(image::imageops::resize(&cropped, max_width, new_h, image::imageops::FilterType::Triangle))
}

/// 两帧同区域文本集合是否完全一致（排序后比较；静态画面去重，TD-037）。
pub fn same_texts(a: &[String], b: &[String]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut x: Vec<&String> = a.iter().collect();
    let mut y: Vec<&String> = b.iter().collect();
    x.sort();
    y.sort();
    x == y
}

/// 单帧两路识别落库：中部（full）+ 底部（subtitle），各自帧间去重。
///
/// @ai-context: 识别失败静默跳过（下帧重试语义）；落库失败记录告警不阻断
///              （与实时链路 OCR 块同口径，画面要点为增强内容）。
pub fn ocr_keyframe(
    db: &Db,
    engines: &EnginePool,
    session_id: i64,
    timestamp_ms: u64,
    image: &image::RgbImage,
    last_full: &mut Vec<String>,
    last_subtitle: &mut Vec<String>,
) {
    // 中部区域 → 画面要点（region=full，避开字幕带干扰）
    if let Some(mid) = crop_and_scale(image, MIDDLE_TOP_RATIO, MIDDLE_BOTTOM_RATIO, OCR_MAX_WIDTH) {
        recognize_region(db, engines, session_id, timestamp_ms, mid, "full", last_full);
    }
    // 底部区域 → 烧录字幕（region=subtitle，与实时链路语义一致）
    if let Some(bot) = crop_and_scale(image, BOTTOM_TOP_RATIO, 1.0, OCR_MAX_WIDTH) {
        recognize_region(db, engines, session_id, timestamp_ms, bot, "subtitle", last_subtitle);
    }
}

/// 单区域识别 + 帧间去重 + 落库。
fn recognize_region(
    db: &Db,
    engines: &EnginePool,
    session_id: i64,
    timestamp_ms: u64,
    region_img: image::RgbImage,
    region: &str,
    last_texts: &mut Vec<String>,
) {
    let Ok(blocks) = engines.recognize_image(region_img) else {
        return; // 识别失败：下帧重试（不阻断管线）
    };
    let texts: Vec<String> = blocks
        .iter()
        .filter(|b| b.score >= MIN_SCORE && !b.text.trim().is_empty())
        .map(|b| b.text.clone())
        .collect();
    if same_texts(&texts, last_texts) {
        return; // 静态画面：与上帧完全一致，不重复落库
    }
    for block in blocks {
        if block.score >= MIN_SCORE && !block.text.trim().is_empty() {
            if let Err(e) = db.add_ocr_block(&NewSessionOcrBlock {
                session_id,
                timestamp_ms,
                text: block.text,
                score: block.score,
                region: region.to_string(),
            }) {
                eprintln!("[Import] OCR 块落库失败: {}", e);
            }
        }
    }
    *last_texts = texts;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid_image(w: u32, h: u32) -> image::RgbImage {
        image::RgbImage::from_pixel(w, h, image::Rgb([200u8, 200, 200]))
    }

    #[test]
    fn middle_region_crops_and_scales_to_max_width() {
        // Arrange：1080p 全帧
        let img = solid_image(1920, 1080);
        // Act：中部区域（5%~75%）缩至 960
        let mid = crop_and_scale(&img, 0.05, 0.75, 960).expect("crop");
        // Assert：宽度 960、高度按 756/1920 比例 = 378
        assert_eq!(mid.dimensions(), (960, 378));
    }

    #[test]
    fn bottom_region_covers_subtitle_band() {
        // Arrange & Act：底部（75%~100%）
        let img = solid_image(1920, 1080);
        let bot = crop_and_scale(&img, 0.75, 1.0, 960).expect("crop");
        // Assert：960×135
        assert_eq!(bot.dimensions(), (960, 135));
    }

    #[test]
    fn crop_rejects_invalid_ratios() {
        // Arrange & Act & Assert：bottom ≤ top / 越界 / max_width=0 → None
        let img = solid_image(100, 100);
        assert!(crop_and_scale(&img, 0.5, 0.5, 960).is_none());
        assert!(crop_and_scale(&img, 0.8, 1.2, 960).is_none());
        assert!(crop_and_scale(&img, 0.0, 1.0, 0).is_none());
    }

    #[test]
    fn small_region_keeps_original_size() {
        // Act & Assert：已 ≤ 最大宽时不缩放
        let img = solid_image(640, 360);
        let out = crop_and_scale(&img, 0.0, 1.0, 960).expect("crop");
        assert_eq!(out.dimensions(), (640, 360));
    }

    #[test]
    fn same_texts_order_insensitive() {
        // Arrange & Act & Assert：集合相等与顺序无关；长度/内容不同判不等
        let a = vec!["第一点".to_string(), "第二点".to_string()];
        let b = vec!["第二点".to_string(), "第一点".to_string()];
        let c = vec!["第一点".to_string()];
        let d = vec!["其他".to_string(), "第一点".to_string()];
        assert!(same_texts(&a, &b));
        assert!(!same_texts(&a, &c));
        assert!(!same_texts(&a, &d));
        assert!(same_texts(&[], &[]));
    }
}
