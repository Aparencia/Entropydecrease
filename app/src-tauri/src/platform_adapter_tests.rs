//! 平台信号适配测试（REQ-191 / v0.9.0 M4）。
//!
//! @ai-context: AAA 模式；覆盖平台推断（标题后缀/URL/本地文件）、bilibili
//!              分区标签提取（会话 33 实证形态）、local 路径语义、OCR 标签
//!              通用化（不依赖平台枚举）、无平台信号零回归。

use super::*;

#[test]
fn infer_platform_from_title_suffix() {
    // Arrange/Act/Assert：B站窗口标题后缀（series_detect 平台表同源）
    assert_eq!(
        infer_platform(Some("你长大了，该了解公积金了_哔哩哔哩_bilibili"), None),
        Some(PlatformKind::Bilibili)
    );
    // 其他平台（YouTube 等）→ Other（本版不解析，纯通用信号）
    assert_eq!(
        infer_platform(Some("Lecture - YouTube"), None),
        Some(PlatformKind::Other)
    );
}

#[test]
fn infer_platform_from_url() {
    // Arrange/Act/Assert：URL 主机名
    assert_eq!(
        infer_platform(None, Some("https://www.bilibili.com/video/BV1xx")),
        Some(PlatformKind::Bilibili)
    );
    assert_eq!(
        infer_platform(None, Some("https://b23.tv/abc")),
        Some(PlatformKind::Bilibili)
    );
}

#[test]
fn infer_platform_from_local_file() {
    // Arrange/Act/Assert：本地文件窗口标题 = 路径（含扩展名）
    assert_eq!(
        infer_platform(Some(r"D:\教程\化妆\眼影篇.mp4"), None),
        Some(PlatformKind::Local)
    );
    assert_eq!(
        infer_platform(None, Some("file:///D:/videos/tutorial.mkv")),
        Some(PlatformKind::Local)
    );
}

#[test]
fn infer_platform_no_signal_zero_regression() {
    // Arrange/Act/Assert：无平台信号 → None（独立播放器/普通标题——零回归）
    assert_eq!(infer_platform(Some("高等数学-第3章 微积分课程"), None), None);
    assert_eq!(infer_platform(None, None), None);
}

#[test]
fn bilibili_inline_category_extracted() {
    // Arrange：标题内联分区（B站标题 `| 知识科普` 后缀形态）
    let h = adapt_bilibili(Some("公积金科普 | 知识科普|经济管理_哔哩哔哩_bilibili"), None);
    // Act/Assert：分区标签提取（经济管理命中已知分区词表）
    assert!(h.platform_tags.iter().any(|t| t.contains("经济管理")), "分区标签应含经济管理");
    // 标题正文（"公积金科普"）不得误判为分区（非已知分区词）
    assert!(!h.platform_tags.iter().any(|t| t.contains("公积金科普")), "标题正文不误判分区");
}

#[test]
fn bilibili_title_without_category_empty() {
    // Arrange：普通 B站标题（无内联分区）
    let h = adapt_bilibili(Some("你长大了，该了解公积金了_哔哩哔哩_bilibili"), None);
    // Act/Assert：无分区标签（分区在画面内——OCR 标签通用化通道补）
    assert!(h.platform_tags.is_empty());
}

#[test]
fn local_path_segments_extracted() {
    // Arrange：本地文件完整路径（目录名=分类语义）
    let h = adapt_local(Some(r"D:\教程\化妆\眼影篇.mp4"));
    // Act/Assert：目录/文件名分段（"教程"、"化妆"、"眼影篇"）
    assert!(h.path_segments.iter().any(|s| s == "教程"));
    assert!(h.path_segments.iter().any(|s| s == "化妆"));
    assert!(h.path_segments.iter().any(|s| s == "眼影篇"));
    // 扩展名/纯数字过滤（无分类语义）
    assert!(!h.path_segments.iter().any(|s| s.contains(".mp4")));
}

#[test]
fn ocr_tags_to_domain_generalized() {
    // Arrange：画面内分区标签 OCR（会话 33 实证：`知识科普|经济管理`）
    let d = ocr_tags_to_domain(&["知识科普".to_string(), "经济管理".to_string()]);
    // Act/Assert：不依赖平台枚举——通用 OCR 信号命中经济领域
    assert_eq!(d.kind, Some(crate::video_profile_domain::DomainKind::Economy));
    assert_eq!(d.source, "platform");
}

#[test]
fn ocr_tags_unknown_text_no_domain() {
    // Arrange：画面内非分类文字（防骗提示/标题卡正文——无领域种子词）
    let d = ocr_tags_to_domain(&["谨防诈骗".to_string(), "小马的故事".to_string()]);
    // Act/Assert：无领域命中（诚实空——不误判）
    assert_eq!(d.kind, None);
}

#[test]
fn platform_hints_json_roundtrip() {
    // Arrange
    let h = PlatformHints {
        platform_tags: vec!["经济管理".into()],
        path_segments: vec!["化妆".into()],
    };
    // Act：JSON roundtrip（检测命令 payload 传输）
    let raw = serde_json::to_string(&h).unwrap();
    let back: PlatformHints = serde_json::from_str(&raw).unwrap();
    // Assert：字段无损
    assert_eq!(back, h);
}
