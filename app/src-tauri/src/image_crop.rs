//! 图片内容裁剪/去白边（REQ-134 IMG-2 / v0.7.0 M3）。

// 机制先行（v0.7.0 M3 登记）：本模块为影子层（白边裁剪能力先行交付）——
// 审查更正（2026-08-19）：尚无生产调用（接线点 = image_store 调用侧：
// 存图前 detect_crop_box + apply_crop；REQ-134 IMG-2 验收时接线）。
#![allow(dead_code)]
//!
//! @ai-context: PPT 全屏截图白边大——存储浪费 + 缩略图文字不可读。白边检测
//!              纯函数（边缘扫描）：四边连续"近白"像素带 → 裁剪边界；版面
//!              区域框（REQ-047 产出）复用裁剪在 image_store 调用侧。
//! @ai-context: 防误裁：保留 8px 安全边距（文字贴边不切）；全白/纯色图
//!              （无内容）不裁剪（返回原图——诚实降级）。

/// 近白判定阈值（RGB 三通道均 ≥ 该值视为白底——扫描 PPT 白边）。
const WHITE_THRESHOLD: u8 = 240;
/// 边缘扫描判定比例：某行/列近白像素占比 ≥ 该值视为"白边带"（90%——
/// 内容行可能有零星白点，但不会 90% 白）。
const EDGE_WHITE_RATIO: f32 = 0.9;
/// 安全边距（px）：裁剪后保留的边界宽度（防文字贴边被切）。
const SAFE_MARGIN: u32 = 8;
/// 最小裁剪收益（px）：白边带 < 该宽度不裁剪（避免无意义重编码）。
const MIN_CROP_GAIN: u32 = 16;

/// 裁剪结果（相对原图的边界）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CropBox {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

impl CropBox {
    /// 是否实际发生了裁剪（False=原图直通）。
    pub fn is_cropped(&self, full_w: u32, full_h: u32) -> bool {
        self.w < full_w || self.h < full_h
    }
}

/// 行是否为白边带（纯函数）：该行近白像素占比 ≥ 阈值。
fn row_is_white(raw: &[u8], width: usize, y: usize, threshold: u8) -> bool {
    let start = y * width * 3;
    let mut white = 0usize;
    for x in 0..width {
        let i = start + x * 3;
        if raw[i] >= threshold && raw[i + 1] >= threshold && raw[i + 2] >= threshold {
            white += 1;
        }
    }
    white as f32 / width as f32 >= EDGE_WHITE_RATIO
}

/// 列是否为白边带（纯函数）。
fn col_is_white(raw: &[u8], width: usize, height: usize, x: usize, threshold: u8) -> bool {
    let mut white = 0usize;
    for y in 0..height {
        let i = (y * width + x) * 3;
        if raw[i] >= threshold && raw[i + 1] >= threshold && raw[i + 2] >= threshold {
            white += 1;
        }
    }
    white as f32 / height as f32 >= EDGE_WHITE_RATIO
}

/// 检测白边裁剪框（纯函数）：从四边向内容收缩。
///
/// @ai-context: 白边带必须连续（遇到非白行/列即停——中间有内容则不裁）；
///              行/列判定为全扫（行内全宽/列内全高）——审查更正（2026-08-19）：
///              原注释"1/8 间距采样"与实现不符；全扫成本由提前终止兜底
///              （白边带遇内容即停；全白图最坏 O(w×h) 由小图/纯色提前返回豁免）。
/// @ai-context: 返回 None=无需裁剪（无足够白边——原图直通）。
pub fn detect_crop_box(rgb: &image::RgbImage) -> Option<CropBox> {
    let (w, h) = rgb.dimensions();
    if w < 32 || h < 32 {
        return None; // 小图不裁（收益低）
    }
    let raw = rgb.as_raw();
    let width = w as usize;
    let height = h as usize;

    // 上边：从 0 向下扫，连续白行
    let mut top = 0u32;
    while top + SAFE_MARGIN < h && row_is_white(raw, width, top as usize, WHITE_THRESHOLD) {
        top += 1;
    }
    // 下边：从 h-1 向上扫
    let mut bottom = h;
    while bottom > SAFE_MARGIN + top && row_is_white(raw, width, (bottom - 1) as usize, WHITE_THRESHOLD) {
        bottom -= 1;
    }
    // 左边
    let mut left = 0u32;
    while left + SAFE_MARGIN < w && col_is_white(raw, width, height, left as usize, WHITE_THRESHOLD) {
        left += 1;
    }
    // 右边
    let mut right = w;
    while right > SAFE_MARGIN + left && col_is_white(raw, width, height, (right - 1) as usize, WHITE_THRESHOLD) {
        right -= 1;
    }

    let crop_w = right.saturating_sub(left);
    let crop_h = bottom.saturating_sub(top);
    // 内容区过小（全白/近全白图——四边扫描交汇）→ 不裁（原图直通）
    if crop_w < 2 * SAFE_MARGIN || crop_h < 2 * SAFE_MARGIN {
        return None;
    }
    // 收益不足（净裁剪 < MIN_CROP_GAIN）→ 不裁（避免无意义重编码）
    let gain_w = w.saturating_sub(crop_w);
    let gain_h = h.saturating_sub(crop_h);
    if gain_w < MIN_CROP_GAIN && gain_h < MIN_CROP_GAIN {
        return None;
    }
    Some(CropBox { x: left, y: top, w: crop_w, h: crop_h })
}

/// 执行裁剪（纯函数）：按 CropBox 裁出子图。
pub fn apply_crop(rgb: &image::RgbImage, box_: &CropBox) -> image::RgbImage {
    image::imageops::crop_imm(
        rgb,
        box_.x.min(rgb.width() - 1),
        box_.y.min(rgb.height() - 1),
        box_.w.min(rgb.width() - box_.x),
        box_.h.min(rgb.height() - box_.y),
    )
    .to_image()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造白边 + 内容图：四边白（20px），中央灰块。
    fn white_margin_image(w: u32, h: u32, margin: u32) -> image::RgbImage {
        let mut img = image::RgbImage::from_pixel(w, h, image::Rgb([255, 255, 255]));
        for y in margin..h - margin {
            for x in margin..w - margin {
                img.put_pixel(x, y, image::Rgb([100, 100, 100]));
            }
        }
        img
    }

    #[test]
    fn white_margins_detected() {
        // Arrange：200×200 图 + 20px 白边
        let img = white_margin_image(200, 200, 20);
        // Act
        let crop = detect_crop_box(&img).expect("检测到白边");
        // Assert：裁剪框 ≈ 内容区（20±安全边距——安全边距防文字贴边被切，
        // 故裁剪框会保留一部分白边）
        assert!(crop.x >= 12 && crop.x <= 20, "x={}", crop.x);
        assert!(crop.y >= 12 && crop.y <= 20, "y={}", crop.y);
        assert!(crop.w >= 160 && crop.w <= 176, "w={}", crop.w);
        assert!(crop.is_cropped(200, 200));
    }

    #[test]
    fn full_content_no_crop() {
        // Arrange：无白边（全内容）
        let mut img = image::RgbImage::from_pixel(200, 200, image::Rgb([100, 100, 100]));
        img.put_pixel(0, 0, image::Rgb([50, 50, 50]));
        // Act & Assert：无可裁白边 → None（原图直通）
        assert!(detect_crop_box(&img).is_none());
    }

    #[test]
    fn all_white_image_no_crop() {
        // 全白图：四边都是白 → 裁剪框会缩到 0（防崩溃返回 None）
        let img = image::RgbImage::from_pixel(200, 200, image::Rgb([255, 255, 255]));
        assert!(detect_crop_box(&img).is_none());
    }

    #[test]
    fn tiny_image_no_crop() {
        // 小图（<32px）不裁
        let img = image::RgbImage::from_pixel(16, 16, image::Rgb([255, 255, 255]));
        assert!(detect_crop_box(&img).is_none());
    }

    #[test]
    fn apply_crop_keeps_content() {
        // Arrange：白边图
        let img = white_margin_image(200, 200, 20);
        let crop = detect_crop_box(&img).expect("白边");
        // Act
        let cropped = apply_crop(&img, &crop);
        // Assert：尺寸缩小且内容保留（非全白）
        assert!(cropped.width() < 200);
        let has_content = cropped.as_raw().chunks_exact(3).any(|px| px[0] < 200);
        assert!(has_content, "裁剪后应保留内容像素");
    }
}
