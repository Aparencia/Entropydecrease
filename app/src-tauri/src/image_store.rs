//! 会话图片存储（REQ-051 / v0.5.0 M6：三层图结构存储层）。
//!
//! @ai-context: 会话目录本地存图（关键图/参考图集/缩略图走廊三级）：
//!              原图 + 缩略图两级（WebP 压缩），去重（aHash）+
//!              每会话预算上限（默认 50 张）；图文对齐靠时间戳（产物块引用 frame_id）。
//! @ai-context: 纯逻辑为主 + 磁盘 IO（路径可注入，测试用 tempfile）；WebP 编码
//!              由 image crate 支持（WebPEncoder lossless）。
//! @ai-context: 数据主权：图片只存本地会话目录，绝不上云。
//! @ai-context: REQ-110（v0.7.0 M1.5）：预算档位参数化——TextFirst=50 张
//!              （现状零回归）/ Balanced=150 / ImageFirst=不截断（图像流存储
//!              层在 image_stream_store.rs，时间轴帧序列不占图集预算）。

use std::path::{Path, PathBuf};

use crate::error::Result;

/// 每会话图片预算上限（默认 50 张，规划 M6；TextFirst 档）。
pub const BUDGET_MAX_IMAGES: usize = 50;
/// 均衡档预算（REQ-110：实操等画面价值中——150 张）。
pub const BUDGET_BALANCED_IMAGES: usize = 150;
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
    /// 预算上限（REQ-110：按档案存储档位注入；None=不截断——图像优先档）
    budget: Option<usize>,
    /// REQ-067（v0.6.0 M3）：最近保存帧双指纹 + 相对路径（去重缓冲）——
    /// 图片去重与帧聚类共用 same_image；审查修复（2026-08-19）：
    /// 单张指纹在 PPT 往返（A→B→A）场景失效（B 覆盖指纹后 A 再存）——
    /// 改最近 8 张 FIFO（往返窗口内去重），仍不占预算
    recent_fingerprints: std::collections::VecDeque<(u64, u64, String)>,
}

/// 去重指纹缓冲容量（往返窗口：PPT 翻页往返通常 ≤8 帧）。
const DEDUPE_BUFFER: usize = 8;

impl SessionImageStore {
    /// 创建会话图片库（目录不存在则创建；TextFirst 档——现状行为零回归）。
    pub fn new(session_dir: PathBuf) -> Result<Self> {
        Self::with_budget(session_dir, Some(BUDGET_MAX_IMAGES))
    }

    /// 按存储档位创建（REQ-110）：TextFirst=50 / Balanced=150 / ImageFirst=不截断。
    ///
    /// @ai-context: ImageFirst 档图集不截断（图像流时间轴帧序列是主存储，
    ///              图集仍是关键帧入口——预算保护转移到 stream 层分级标记）。
    pub fn with_tier(session_dir: PathBuf, tier: crate::video_profile::StoreTier) -> Result<Self> {
        let budget = match tier {
            crate::video_profile::StoreTier::TextFirst => Some(BUDGET_MAX_IMAGES),
            crate::video_profile::StoreTier::Balanced => Some(BUDGET_BALANCED_IMAGES),
            crate::video_profile::StoreTier::ImageFirst => None,
        };
        Self::with_budget(session_dir, budget)
    }

    /// 显式预算创建（测试/命令层注入）。
    pub fn with_budget(session_dir: PathBuf, budget: Option<usize>) -> Result<Self> {
        std::fs::create_dir_all(session_dir.join("full"))?;
        std::fs::create_dir_all(session_dir.join("thumb"))?;
        std::fs::create_dir_all(session_dir.join("crop"))?;
        let saved = count_webp(&session_dir.join("full")) + count_webp(&session_dir.join("crop"));
        Ok(Self { session_dir, saved, budget, recent_fingerprints: std::collections::VecDeque::new() })
    }

    /// 剩余预算（None=不截断——图像优先档；0 = 已达上限；full/thumb 与 crop 共用预算）。
    pub fn remaining_budget(&self) -> Option<usize> {
        self.budget.map(|b| b.saturating_sub(self.saved))
    }

    /// 双指纹去重命中（纯读）：与最近保存图双稳定同图 → 返回已有相对路径。
    ///
    /// @ai-context: REQ-067 same_image 双稳定判定（与帧聚类共用）——
    ///              旋转/缩放/静止重复图不重复存/不占预算。
    /// @ai-context: namespace 限定（"crop/" 或 "full/"）——六轮审查修复：
    ///              同一 FIFO 但匹配仅限同命名空间，防跨命名空间误判
    ///              （裁剪图与整帧内容相近时 save_crop 返回 full/ 路径且不落盘，
    ///              save_user_screenshot 返回路径直接暴露前端，必须正确）。
    fn dedupe_hit(&self, ah: u64, dh: u64, namespace: &str) -> Option<String> {
        self.recent_fingerprints
            .iter()
            .find(|(la, ld, path)| {
                path.starts_with(namespace)
                    && crate::frame_cluster::same_image(*la, *ld, ah, dh, 6, 8)
            })
            .map(|(_, _, path)| path.clone())
    }

    /// 记录指纹（FIFO 缓冲；容量 DEDUPE_BUFFER——覆盖 PPT 往返窗口）。
    fn remember(&mut self, ah: u64, dh: u64, path: String) {
        self.recent_fingerprints.push_back((ah, dh, path));
        if self.recent_fingerprints.len() > DEDUPE_BUFFER {
            self.recent_fingerprints.pop_front();
        }
    }

    /// 保存区域裁剪图（v0.5.0 模型版：表格/公式区域裁剪，课后精修输入）。
    ///
    /// @ai-context: 存 `crop/<ts>.webp` 命名空间——与 `full/` 关键帧隔离，
    ///              防同帧双写覆盖（审查 H2 修复：原实现与 handle_full_frame
    ///              同时间戳写 full/ 互相覆盖）；无缩略图（精修需原图细节）。
    /// @ai-context: 修复：双指纹去重与 save_frame 同口径——旧实现无去重，
    ///              视频进度条等静态误判区域每 tick 重复存图（会话 15 实测
    ///              49 张全同垃圾 crop，耗尽与 full 共享的 50 张预算）。
    pub fn save_crop(
        &mut self,
        timestamp_ms: u64,
        bgraw: &[u8],
        width: u32,
        height: u32,
    ) -> Result<String> {
        let rgb = bgra_to_rgb(bgraw, width, height)
            .ok_or_else(|| crate::error::AppError::Io("裁剪图数据无效".to_string()))?;
        let ah = crate::ocr_cache::average_hash(&rgb);
        let dh = crate::ocr_cache::difference_hash(&rgb);
        if let Some(existing) = self.dedupe_hit(ah, dh, "crop/") {
            return Ok(existing);
        }
        if self.remaining_budget() == Some(0) {
            return Err(crate::error::AppError::Io(format!(
                "会话图片预算已达上限（{} 张）",
                self.budget.unwrap_or(BUDGET_MAX_IMAGES)
            )));
        }
        let name = format!("{}.webp", timestamp_ms);
        let crop_path = self.session_dir.join("crop").join(&name);
        encode_webp(&rgb, &crop_path)?;
        self.saved += 1;
        self.remember(ah, dh, format!("crop/{}", name));
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
        // 双指纹去重（先于预算检查——重复帧不消耗预算；FIFO 缓冲覆盖往返窗口）
        let ah = crate::ocr_cache::average_hash(&rgb);
        let dh = crate::ocr_cache::difference_hash(&rgb);
        if let Some(existing) = self.dedupe_hit(ah, dh, "full/") {
            return Ok(existing);
        }
        if self.remaining_budget() == Some(0) {
            return Err(crate::error::AppError::Io(format!(
                "会话图片预算已达上限（{} 张）",
                self.budget.unwrap_or(BUDGET_MAX_IMAGES)
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
        self.remember(ah, dh, format!("full/{}", name));
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

/// 公共包装：BGRA8 → RGB（图像流存储层复用；纯函数）。
/// @ai-context: 图像流存储层（image_stream_store.rs）调用但该层当前未接线
///              （M2 档案组刚注册）——登记豁免 dead_code（接线时移除）。
#[allow(dead_code)]
pub fn bgra_to_rgb_public(bgraw: &[u8], width: u32, height: u32) -> Option<image::RgbImage> {
    bgra_to_rgb(bgraw, width, height)
}

/// 公共包装：BGRA8 编码 WebP lossless（图像流存储层复用；纯 IO）。
/// @ai-context: 同 bgra_to_rgb_public——登记豁免 dead_code（接线时移除）。
#[allow(dead_code)]
pub fn encode_webp_public(bgraw: &[u8], width: u32, height: u32, path: &Path) -> Result<()> {
    let rgb = bgra_to_rgb(bgraw, width, height)
        .ok_or_else(|| crate::error::AppError::Io("帧数据无效".to_string()))?;
    encode_webp(&rgb, path)
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
