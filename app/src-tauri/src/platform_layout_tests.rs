//! platform_layout 单测（v0.14 D4 spec §6：平台识别/模板加载/几何兜底；AAA 模式）。

use super::*;

#[test]
fn detect_bilibili_from_title_suffix() {
    // Arrange/Act：窗口标题形态 `标题_哔哩哔哩_bilibili`（series_detect 平台表）
    let kind = detect_platform_kind(Some("化妆教程_哔哩哔哩_bilibili"), None);
    // Assert
    assert_eq!(kind, PlatformLayoutKind::Bilibili);
}

#[test]
fn detect_bilibili_from_url() {
    // Arrange/Act：b23.tv 短链 + 主站
    assert_eq!(
        detect_platform_kind(None, Some("https://www.bilibili.com/video/BV1xx")),
        PlatformLayoutKind::Bilibili
    );
    assert_eq!(detect_platform_kind(None, Some("https://b23.tv/abc")), PlatformLayoutKind::Bilibili);
}

#[test]
fn detect_douyin_from_url_and_title() {
    // Arrange/Act：URL 主机名 + 窗口标题关键词
    assert_eq!(
        detect_platform_kind(None, Some("https://www.douyin.com/video/123")),
        PlatformLayoutKind::Douyin
    );
    assert_eq!(detect_platform_kind(Some("教程视频 抖音"), None), PlatformLayoutKind::Douyin);
}

#[test]
fn detect_youtube_from_url_and_title() {
    // Arrange/Act
    assert_eq!(
        detect_platform_kind(None, Some("https://www.youtube.com/watch?v=abc")),
        PlatformLayoutKind::Youtube
    );
    assert_eq!(detect_platform_kind(Some("教程 - YouTube"), None), PlatformLayoutKind::Youtube);
}

#[test]
fn detect_local_file_title_is_edge_local() {
    // Arrange/Act：播放器窗口标题 = 文件路径（platform_adapter Local 同源）
    let kind = detect_platform_kind(Some("D:\\教程\\化妆\\眼影篇.mp4"), None);
    // Assert
    assert_eq!(kind, PlatformLayoutKind::EdgeLocal);
}

#[test]
fn detect_unknown_without_signals() {
    // Arrange/Act：无平台信号的独立播放器窗口
    let kind = detect_platform_kind(Some("我的播放器窗口"), None);
    // Assert：不猜（几何兜底——零回归）
    assert_eq!(kind, PlatformLayoutKind::Unknown);
}

#[test]
fn bilibili_template_matches_spec_values() {
    // Arrange/Act：模板命中（spec §4.4 示例值）
    let t = template_for(PlatformLayoutKind::Bilibili).expect("bilibili 模板存在");
    // Assert：videoRoi [0.15, 0.08, 0.62, 0.72] / 字幕带 y=0.82 h=0.10 / 噪音掩码
    assert_eq!(t.video_roi, NormalizedRoi { x: 0.15, y: 0.08, w: 0.62, h: 0.72 });
    let band = t.subtitle_band.expect("字幕带先验存在");
    assert!((band.y - 0.82).abs() < 1e-4 && (band.h - 0.10).abs() < 1e-4);
    assert_eq!(t.noise_masks, vec!["danmaku_band".to_string(), "right_recommend".to_string()]);
}

#[test]
fn unknown_has_no_template() {
    // Arrange/Act/Assert：unknown 无模板（走几何兜底）
    assert!(template_for(PlatformLayoutKind::Unknown).is_none());
}

#[test]
fn fallback_roi_by_aspect_ratio() {
    // Arrange/Act：横屏 16:9 裁黑边、竖屏裁 UI 区、方形全窗口
    let wide = fallback_roi(1920, 1080);
    let tall = fallback_roi(1080, 1920);
    let square = fallback_roi(800, 800);
    // Assert：横屏 y=0.08 起（裁上黑边）；竖屏 h=0.76；方形全窗口
    assert!((wide.y - 0.08).abs() < 1e-4);
    assert!((tall.h - 0.76).abs() < 1e-4);
    assert_eq!(square, NormalizedRoi { x: 0.0, y: 0.0, w: 1.0, h: 1.0 });
}

#[test]
fn resolve_layout_unknown_falls_back_to_geometry() {
    // Arrange/Act：unknown + 1920x1080 → 几何兜底模板
    let t = resolve_layout(PlatformLayoutKind::Unknown, 1920, 1080);
    // Assert：兜底 ROI（横屏）+ 无字幕先验 + 无噪音掩码
    assert!((t.video_roi.y - 0.08).abs() < 1e-4);
    assert!(t.subtitle_band.is_none());
    assert!(t.noise_masks.is_empty());
}

#[test]
fn resolve_layout_hit_uses_template_not_fallback() {
    // Arrange/Act：douyin 命中模板（无视帧尺寸）
    let t = resolve_layout(PlatformLayoutKind::Douyin, 1920, 1080);
    // Assert：模板 ROI（非兜底值）
    assert!((t.video_roi.y - 0.12).abs() < 1e-4);
    assert_eq!(t.noise_masks.len(), 2);
}

#[test]
fn roi_to_pixels_scales_to_frame() {
    // Arrange/Act：归一化 ROI → 1920x1080 像素矩形
    let roi = NormalizedRoi { x: 0.15, y: 0.08, w: 0.62, h: 0.72 };
    let (x, y, w, h) = roi.to_pixels(1920.0, 1080.0);
    // Assert（f32 乘积累差——近似断言）
    assert!((x - 288.0).abs() < 1e-3);
    assert!((y - 86.4).abs() < 1e-3);
    assert!((w - 1190.4).abs() < 1e-3);
    assert!((h - 777.6).abs() < 1e-3);
}

#[test]
fn roi_serde_roundtrip_array_form() {
    // Arrange/Act：模板 JSON 数组形态 ↔ struct 互转（spec 原样 [x, y, w, h]）
    let json = serde_json::to_string(&NormalizedRoi { x: 0.15, y: 0.08, w: 0.62, h: 0.72 }).unwrap();
    // Assert：序列化为数组
    assert_eq!(json, "[0.15,0.08,0.62,0.72]");
    let back: NormalizedRoi = serde_json::from_str(&json).unwrap();
    assert_eq!(back.x, 0.15);
}
