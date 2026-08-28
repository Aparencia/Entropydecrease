//! 平台版面模板（v0.14 D4 platform_layout；三层降级：模板 → 几何兜底 → 现状）。
//!
//! @ai-context: spec §4.4——平台先验 + 通用兜底：窗口标题/URL → 平台识别 →
//!              platform_templates.json 模板（JSON 数据非代码——网页改版只改
//!              数据）→ 命中用模板；未命中走几何兜底（宽高比启发）；全失败
//!              走现状（全窗口 OCR）。收益：OCR 只在视频区 ROI 内跑——弹幕/
//!              推荐流/评论区噪音从源头消失；字幕带先验让屏幕字幕检测从
//!              "盲找"变"带先验找"。
//! @ai-context: 纯函数 + include_str! 内嵌模板（打包无资源路径问题；测试零
//!              IO）；模板 JSON 解析失败 → 空表（走几何兜底，spec §5 能力
//!              降级不失效——全失败 = 现状零回归）。
//! @ai-context: lib 内暂无生产调用方（采集 ROI 应用接线留后续任务，目标版本
//!              v0.14.1）；测试目标已覆盖，登记 dead_code 豁免（机制先行
//!              模式，watermark_cluster 先例）。
#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// 平台版面种类（spec §4.4：bilibili/douyin/youtube/edge-local/unknown）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformLayoutKind {
    Bilibili,
    Douyin,
    Youtube,
    /// Edge 播放本地文件（窗口标题 = 文件路径——platform_adapter Local 同源）
    EdgeLocal,
    /// 无平台信号（走几何兜底——零回归）
    Unknown,
}

impl PlatformLayoutKind {
    /// 模板键名（platform_templates.json 顶层键）。
    pub fn key(self) -> &'static str {
        match self {
            PlatformLayoutKind::Bilibili => "bilibili",
            PlatformLayoutKind::Douyin => "douyin",
            PlatformLayoutKind::Youtube => "youtube",
            PlatformLayoutKind::EdgeLocal => "edge-local",
            PlatformLayoutKind::Unknown => "unknown",
        }
    }
}

/// 归一化 ROI（0.0-1.0 比例 [x, y, w, h]——适配任意帧尺寸；spec 原样数组）。
/// @ai-context: serde 手写（字段级不支持 #[serde(into/from)]——容器级属性）：
///              JSON 数组形态 ↔ struct 互转（模板数据与 spec §4.4 示例一致）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NormalizedRoi {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Serialize for NormalizedRoi {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        [self.x, self.y, self.w, self.h].serialize(s)
    }
}

impl<'de> Deserialize<'de> for NormalizedRoi {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let a = <[f32; 4]>::deserialize(d)?;
        Ok(Self { x: a[0], y: a[1], w: a[2], h: a[3] })
    }
}

impl From<[f32; 4]> for NormalizedRoi {
    fn from(v: [f32; 4]) -> Self {
        Self { x: v[0], y: v[1], w: v[2], h: v[3] }
    }
}

impl From<NormalizedRoi> for [f32; 4] {
    fn from(r: NormalizedRoi) -> Self {
        [r.x, r.y, r.w, r.h]
    }
}

impl NormalizedRoi {
    /// 像素化 ROI（帧尺寸 → (x, y, w, h) 像素矩形）。
    pub fn to_pixels(&self, fw: f32, fh: f32) -> (f32, f32, f32, f32) {
        (self.x * fw, self.y * fh, self.w * fw, self.h * fh)
    }
}

/// 字幕带先验（归一化 y/h——屏幕字幕检测从盲找变带先验找）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SubtitleBandPrior {
    pub y: f32,
    pub h: f32,
}

/// 平台版面模板（platform_templates.json 数据结构——数据非代码）。
/// @ai-context: rename_all = camelCase——模板 JSON 键与 spec §4.4 示例一致
///              （videoRoi/subtitleBand/noiseMasks），Rust 侧保持 snake_case。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoLayoutTemplate {
    /// 视频区 ROI（归一化；OCR 只在此区域内跑）
    pub video_roi: NormalizedRoi,
    /// 字幕带先验（可选——无先验的模板字幕检测维持现状）
    #[serde(default)]
    pub subtitle_band: Option<SubtitleBandPrior>,
    /// 噪音区掩码名（弹幕带/推荐流/评论区——OCR 前掩码，噪音从源头消失）
    #[serde(default)]
    pub noise_masks: Vec<String>,
}

/// 内置模板表（include_str! 内嵌——打包/测试零资源路径问题）。
const TEMPLATES_JSON: &str = include_str!("../platform_templates.json");

/// 模板表加载（惰性缓存；JSON 解析失败 → 空表——调用方走几何兜底，spec §5）。
fn templates() -> &'static HashMap<String, VideoLayoutTemplate> {
    static CACHE: OnceLock<HashMap<String, VideoLayoutTemplate>> = OnceLock::new();
    CACHE.get_or_init(|| serde_json::from_str(TEMPLATES_JSON).unwrap_or_default())
}

/// 平台识别（纯函数）：窗口标题/URL → 平台版面种类。
///
/// @ai-context: 复用 platform_adapter::infer_platform（B站/本地判定单源）为基底，
///              前置扩展抖音/YouTube 关键词（infer_platform 的 Other 无法细分
///              ——版面差异大必须细分）；unknown = 无信号（几何兜底，零回归）。
pub fn detect_platform_kind(title: Option<&str>, url: Option<&str>) -> PlatformLayoutKind {
    if let Some(u) = url.map(str::to_lowercase) {
        if u.contains("douyin.com") {
            return PlatformLayoutKind::Douyin;
        }
        if u.contains("youtube.com") || u.contains("youtu.be") {
            return PlatformLayoutKind::Youtube;
        }
        if u.contains("bilibili.com") || u.contains("b23.tv") {
            return PlatformLayoutKind::Bilibili;
        }
    }
    if let Some(t) = title {
        let t = t.to_lowercase();
        if t.contains("douyin") || t.contains("抖音") {
            return PlatformLayoutKind::Douyin;
        }
        if t.contains("youtube") || t.contains("油管") {
            return PlatformLayoutKind::Youtube;
        }
    }
    match crate::platform_adapter::infer_platform(title, url) {
        Some(crate::platform_adapter::PlatformKind::Bilibili) => PlatformLayoutKind::Bilibili,
        Some(crate::platform_adapter::PlatformKind::Local) => PlatformLayoutKind::EdgeLocal,
        _ => PlatformLayoutKind::Unknown,
    }
}

/// 模板命中（纯函数）：平台 → 模板（未命中 None → 调用方走几何兜底）。
pub fn template_for(kind: PlatformLayoutKind) -> Option<VideoLayoutTemplate> {
    templates().get(kind.key()).cloned()
}

/// 几何兜底（纯函数）：无模板平台的通用 ROI 推定（宽高比启发）。
///
/// @ai-context: 全失败走现状 = 全窗口 ROI；16:9 横屏裁上下黑边（视频普遍留
///              黑边），竖屏裁上下 UI 区（短视频类保守近似）——归一化输出
///              适配任意帧尺寸，无像素依赖。
pub fn fallback_roi(frame_w: u32, frame_h: u32) -> NormalizedRoi {
    let ratio = frame_h as f32 / frame_w.max(1) as f32;
    if ratio < 0.6 {
        // 横屏（16:9 类）：裁上下黑边带
        NormalizedRoi { x: 0.0, y: 0.08, w: 1.0, h: 0.84 }
    } else if ratio > 1.2 {
        // 竖屏（短视频类）：裁上下 UI 区
        NormalizedRoi { x: 0.0, y: 0.12, w: 1.0, h: 0.76 }
    } else {
        // 近似方形：全窗口（现状零回归）
        NormalizedRoi { x: 0.0, y: 0.0, w: 1.0, h: 1.0 }
    }
}

/// 综合版面解析（三层降级）：模板 → 几何兜底 → 全窗口。
pub fn resolve_layout(kind: PlatformLayoutKind, frame_w: u32, frame_h: u32) -> VideoLayoutTemplate {
    template_for(kind).unwrap_or_else(|| VideoLayoutTemplate {
        video_roi: fallback_roi(frame_w, frame_h),
        subtitle_band: None,
        noise_masks: Vec::new(),
    })
}

#[cfg(test)]
#[path = "platform_layout_tests.rs"]
mod tests;
