//! 分区域 OCR 编排单测（REQ-048 / v0.5.0 M4）。
//!
//! @ai-context: AAA 模式；坐标还原（含边界/缩放/负偏移）、裁剪参数钳制、调度封顶。

use super::*;
use crate::capture::frame_diff::Rect;

fn region(kind: RegionKind, x: u32, y: u32, w: u32, h: u32) -> LayoutRegion {
    LayoutRegion { kind, x, y, w, h, confidence: 0.9, is_structural: false }
}

#[test]
fn map_to_frame_basic_offset() {
    // Arrange：区域 bbox (100, 50)，裁剪图内坐标 (0, 0)（左上角）
    let bbox = Rect { left: 100, top: 50, right: 300, bottom: 200 };
    // Act：scale=1（不放大）
    let mapped = map_to_frame(FrameCoord { x: 0, y: 0 }, &bbox, 1.0);
    // Assert：frame = bbox 原点 + 边距（100+12, 50+12）
    assert_eq!(mapped, FrameCoord { x: 112, y: 62 });
}

#[test]
fn map_to_frame_with_scale() {
    // Arrange：表格放大 2x——裁剪图坐标 (40, 30) 还原为原帧坐标
    let bbox = Rect { left: 100, top: 50, right: 300, bottom: 200 };
    // Act
    let mapped = map_to_frame(FrameCoord { x: 40, y: 30 }, &bbox, 2.0);
    // Assert：100+12 + 40/2 = 132；50+12 + 30/2 = 77
    assert_eq!(mapped, FrameCoord { x: 132, y: 77 });
}

#[test]
fn map_to_frame_negative_coord_safe() {
    // Arrange：裁剪图内负坐标（OCR 检测框越界防御）
    let bbox = Rect { left: 100, top: 50, right: 300, bottom: 200 };
    // Act
    let mapped = map_to_frame(FrameCoord { x: -5, y: -3 }, &bbox, 1.0);
    // Assert：负坐标仍还原（bbox+margin 后可能为负——原帧内由调用方钳制）
    assert_eq!(mapped, FrameCoord { x: 107, y: 59 });
}

#[test]
fn map_to_frame_zero_scale_defaults_one() {
    // Arrange：scale=0（防御：非法值回退 1.0）
    let bbox = Rect { left: 0, top: 0, right: 100, bottom: 100 };
    // Act
    let mapped = map_to_frame(FrameCoord { x: 10, y: 10 }, &bbox, 0.0);
    // Assert：0+12+10 = 22
    assert_eq!(mapped, FrameCoord { x: 22, y: 22 });
}

#[test]
fn crop_spec_adds_margin_and_clamps() {
    // Arrange：贴边区域（x=0, y=0）在 1920×1080 帧内
    let r = region(RegionKind::Text, 0, 0, 200, 100);
    // Act
    let spec = crop_spec(&r, 1920, 1080).expect("spec");
    // Assert：边距 12 被钳制到 0（贴边），右下不越界
    assert_eq!(spec.left, 0);
    assert_eq!(spec.top, 0);
    assert_eq!(spec.width, 200 + 12);
    assert_eq!(spec.height, 100 + 12);
}

#[test]
fn crop_spec_right_edge_clamped() {
    // Arrange：右贴边区域（x+w = 1920）
    let r = region(RegionKind::Text, 1800, 100, 120, 80);
    // Act
    let spec = crop_spec(&r, 1920, 1080).expect("spec");
    // Assert：right = 1800+120+12 = 1932 → 钳制 1920；width = 1920-1800+12-12?
    assert_eq!(spec.left + spec.width as i32, 1920);
}

#[test]
fn crop_spec_out_of_frame_none() {
    // Arrange：完全越界区域（x > 帧宽）
    let r = region(RegionKind::Text, 2000, 100, 50, 50);
    // Act
    let spec = crop_spec(&r, 1920, 1080);
    // Assert：None（无有效裁剪区）
    assert!(spec.is_none());
}

#[test]
fn crop_spec_scale_by_kind() {
    // Act：表格 2x、公式 1.5x、文本 1x
    let table = crop_spec(&region(RegionKind::Table, 10, 10, 100, 100), 1920, 1080).unwrap();
    let formula = crop_spec(&region(RegionKind::Formula, 10, 10, 100, 100), 1920, 1080).unwrap();
    let text = crop_spec(&region(RegionKind::Text, 10, 10, 100, 100), 1920, 1080).unwrap();
    // Assert
    assert_eq!(table.scale, 2.0);
    assert_eq!(formula.scale, 1.5);
    assert_eq!(text.scale, 1.0);
}

#[test]
fn schedule_regions_caps_and_sorts() {
    // Arrange：7 个区域（混合类型）
    let regions = vec![
        region(RegionKind::Text, 0, 0, 10, 10),
        region(RegionKind::Table, 0, 20, 10, 10),
        region(RegionKind::Text, 0, 40, 10, 10),
        region(RegionKind::Image, 0, 60, 10, 10),
        region(RegionKind::Code, 0, 80, 10, 10),
        region(RegionKind::Formula, 0, 100, 10, 10),
        region(RegionKind::Unknown, 0, 120, 10, 10),
    ];
    // Act
    let scheduled = schedule_regions(&regions);
    // Assert：image 被滤除；封顶 4 个；table 优先
    assert_eq!(scheduled.len(), MAX_REGIONS_PER_FRAME);
    assert!(!scheduled.iter().any(|r| r.kind == RegionKind::Image));
    assert_eq!(scheduled[0].kind, RegionKind::Table, "表格权重最高应排首位");
}

#[test]
fn schedule_regions_fewer_than_cap_all_kept() {
    // Arrange：2 个区域 < 封顶
    let regions = vec![
        region(RegionKind::Text, 0, 0, 10, 10),
        region(RegionKind::Text, 0, 20, 10, 10),
    ];
    // Act
    let scheduled = schedule_regions(&regions);
    // Assert：全部保留
    assert_eq!(scheduled.len(), 2);
}

#[test]
fn schedule_regions_empty_safe() {
    // Act/Assert：空输入安全
    assert!(schedule_regions(&[]).is_empty());
}

#[test]
fn region_ocr_result_serializable_fields() {
    // Arrange：失败标记 + 区域
    let r = region(RegionKind::Unknown, 0, 0, 10, 10);
    let result = RegionOcrResult { region: r, failed: true };
    // Act/Assert：字段可读（编排层回填契约）
    assert!(result.failed);
    assert_eq!(result.region.kind, RegionKind::Unknown);
}
