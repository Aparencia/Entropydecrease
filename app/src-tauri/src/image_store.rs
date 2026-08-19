//! 会话图片存储（REQ-051 / v0.5.0 M6：三层图结构存储层）。
//!
//! @ai-context: 会话目录本地存图（关键图/参考图集/缩略图走廊三级）：
//!              原图 + 缩略图两级（WebP 压缩），去重（aHash）+
//!              每会话预算上限（默认 50 张）；图文对齐靠时间戳（产物块引用 frame_id）。
//! @ai-context: 纯逻辑为主 + 磁盘 IO（路径可注入，测试用 tempfile）；WebP 编码
//!              由 image crate 支持（WebPEncoder lossless）。
//! @ai-context: 数据主权：图片只存本地会话目录，绝不上云。

use std::path::{Path, PathBuf};

use crate::error::Result;

/// 每会话图片预算上限（默认 50 张，规划 M6）。
pub const BUDGET_MAX_IMAGES: usize = 50;
/// 缩略图最大宽度（走廊/画廊用；保持宽高比）。
const THUMB_MAX_WIDTH: u32 = 320;
/// 缩略图最大高度。
const THUMB_MAX_HEIGHT: u32 = 180;

/// 会话图片库（有状态：会话目录 + 已存图片数）。
#[derive(Debug, Clone)]
pub struct SessionImageStore {
    session_dir: PathBuf,
    /// 已存图片数（预算检查）
    saved: usize,
    /// REQ-067（v0.6.0 M3）：最近保存帧双指纹 + 相对路径——
    /// 图片去重与帧聚类共用 same_image（双稳定才判同图）
    last_fingerprint: Option<(u64, u64, String)>,
}

impl SessionImageStore {
    /// 创建会话图片库（目录不存在则创建）。
    ///
    /// @ai-context: 修复：saved 从磁盘已有图片数恢复（原实现恒为 0）——
    ///              save_user_screenshot 等命令每次调用都 new 一个 store，
    ///              预算检查因此从未对命令路径生效（可无限存图超上限）。
    pub fn new(session_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(session_dir.join("full"))?;
        std::fs::create_dir_all(session_dir.join("thumb"))?;
        std::fs::create_dir_all(session_dir.join("crop"))?;
        let saved = count_webp(&session_dir.join("full")) + count_webp(&session_dir.join("crop"));
        Ok(Self { session_dir, saved, last_fingerprint: None })
    }

    /// 剩余预算（0 = 已达上限；full/thumb 与 crop 共用预算，防总盘占用失控）。
    pub fn remaining_budget(&self) -> usize {
        BUDGET_MAX_IMAGES.saturating_sub(self.saved)
    }

    /// 保存区域裁剪图（v0.5.0 模型版：表格/公式区域裁剪，课后精修输入）。
    ///
    /// @ai-context: 存 `crop/<ts>.webp` 命名空间——与 `full/` 关键帧隔离，
    ///              防同帧双写覆盖（审查 H2 修复：原实现与 handle_full_frame
    ///              同时间戳写 full/ 互相覆盖）；无缩略图（精修需原图细节）。
    pub fn save_crop(
        &mut self,
        timestamp_ms: u64,
        bgraw: &[u8],
        width: u32,
        height: u32,
    ) -> Result<String> {
        if self.remaining_budget() == 0 {
            return Err(crate::error::AppError::Io(format!(
                "会话图片预算已达上限（{} 张）",
                BUDGET_MAX_IMAGES
            )));
        }
        let name = format!("{}.webp", timestamp_ms);
        let rgb = bgra_to_rgb(bgraw, width, height)
            .ok_or_else(|| crate::error::AppError::Io("裁剪图数据无效".to_string()))?;
        let crop_path = self.session_dir.join("crop").join(&name);
        encode_webp(&rgb, &crop_path)?;
        self.saved += 1;
        Ok(format!("crop/{}", name))
    }

    /// 已存裁剪图相对路径列表（crop/xxx.webp，按文件名=时间戳升序）。
    pub fn list_crops(&self) -> Vec<String> {
        let mut paths: Vec<String> = std::fs::read_dir(self.session_dir.join("crop"))
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().extension().is_some_and(|x| x == "webp"))
                    .map(|e| format!("crop/{}", e.file_name().to_string_lossy()))
                    .collect()
            })
            .unwrap_or_default();
        paths.sort();
        paths
    }

    /// 保存图片（原图 + 缩略图两级）：返回相对路径（full/xxx.webp）。
    ///
    /// @ai-context: 编码失败/超预算 → Err（调用方决定降级）；文件名 = 时间戳毫秒
    ///              （时间轴对齐：产物块按 frame_id 引用）。
    /// @ai-context: REQ-067 去重：与最近保存帧双指纹**双稳定**（same_image——
    ///              与帧聚类共用同一判定函数）→ 视为同图直接返回已有路径，
    ///              不重复存图/不占预算（旋转/缩放/静止重复帧去重）。
    pub fn save_frame(
        &mut self,
        timestamp_ms: u64,
        bgraw: &[u8],
        width: u32,
        height: u32,
    ) -> Result<String> {
        let rgb = bgra_to_rgb(bgraw, width, height)
            .ok_or_else(|| crate::error::AppError::Io("帧数据无效".to_string()))?;
        // 双指纹去重（先于预算检查——重复帧不消耗预算）
        let ah = crate::ocr_cache::average_hash(&rgb);
        let dh = crate::ocr_cache::difference_hash(&rgb);
        if let Some((la, ld, path)) = &self.last_fingerprint {
            if crate::frame_cluster::same_image(*la, *ld, ah, dh, 6, 8) {
                return Ok(path.clone());
            }
        }
        if self.remaining_budget() == 0 {
            return Err(crate::error::AppError::Io(format!(
                "会话图片预算已达上限（{} 张）",
                BUDGET_MAX_IMAGES
            )));
        }
        let name = format!("{}.webp", timestamp_ms);
        // 原图（WebP lossless）
        let full_path = self.session_dir.join("full").join(&name);
        encode_webp(&rgb, &full_path)?;
        // 缩略图（保持宽高比缩小后编码）
        let thumb_path = self.session_dir.join("thumb").join(&name);
        if let Some(thumb) = resize_bgra(bgraw, width, height) {
            encode_webp(&thumb, &thumb_path)?;
        }
        self.saved += 1;
        self.last_fingerprint = Some((ah, dh, format!("full/{}", name)));
        Ok(format!("full/{}", name))
    }

    /// 已存图片相对路径列表（full/xxx.webp，按文件名=时间戳升序）。
    pub fn list_images(&self) -> Vec<String> {
        let mut paths: Vec<String> = std::fs::read_dir(self.session_dir.join("full"))
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().extension().is_some_and(|x| x == "webp"))
                    .map(|e| format!("full/{}", e.file_name().to_string_lossy()))
                    .collect()
            })
            .unwrap_or_default();
        paths.sort();
        paths
    }
}

/// 统计目录内 WebP 文件数（预算恢复用；目录不存在/读失败按 0 计）。
fn count_webp(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().is_some_and(|x| x == "webp"))
                .count()
        })
        .unwrap_or(0)
}

/// BGRA8 → RGB（纯函数；尺寸/长度不匹配返回 None）。
fn bgra_to_rgb(bgraw: &[u8], width: u32, height: u32) -> Option<image::RgbImage> {
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

/// 编码 WebP（lossless）到文件（纯 IO）。
fn encode_webp(rgb: &image::RgbImage, path: &Path) -> Result<()> {
    let mut out = std::io::Cursor::new(Vec::new());
    let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut out);
    rgb.write_with_encoder(encoder)
        .map_err(|e| crate::error::AppError::Io(format!("WebP 编码失败: {}", e)))?;
    std::fs::write(path, out.into_inner())?;
    Ok(())
}

/// 缩略图（最近邻缩小 BGRA 到 THUMB 尺寸，保持宽高比；纯函数）。
fn resize_bgra(bgraw: &[u8], width: u32, height: u32) -> Option<image::RgbImage> {
    let rgb = bgra_to_rgb(bgraw, width, height)?;
    if width <= THUMB_MAX_WIDTH && height <= THUMB_MAX_HEIGHT {
        return Some(rgb);
    }
    let scale = (THUMB_MAX_WIDTH as f32 / width as f32)
        .min(THUMB_MAX_HEIGHT as f32 / height as f32)
        .min(1.0);
    let (dw, dh) = (
        ((width as f32 * scale).round().max(1.0)) as u32,
        ((height as f32 * scale).round().max(1.0)) as u32,
    );
    let raw = rgb.as_raw();
    let sw = width as usize;
    let mut out = Vec::with_capacity(dw as usize * dh as usize * 3);
    for y in 0..dh {
        let src_y = (y as usize * sw) / dw as usize;
        for x in 0..dw {
            let src_x = (x as usize * sw) / dw as usize;
            let i = (src_y * sw + src_x) * 3;
            out.extend_from_slice(&raw[i..i + 3]);
        }
    }
    image::RgbImage::from_raw(dw, dh, out)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "image_store_tests.rs"]
mod tests;
