//! 结构图批量捕获管线单测（REQ-182 / v0.7.7；v0.10.2 重构，AAA 模式）。
//!
//! @ai-context: 纯函数（网格换算/裁剪钳制/过滤上下文组装）+ 端到端集成（合成
//!              表格帧+字幕帧参考图集 → 直扫分析 → 只收表格拒字幕 + 幂等重跑
//!              + 降级跳过）；tempfile + 内存库隔离（不触碰真实数据）。

use std::path::Path;

use crate::db::Db;
use crate::layout_analyzer::{LayoutRegion, RegionKind};
use crate::structure_capture::{build_filter_context, capture_session_structures};
use crate::types::{NewSessionOcrBlock, TextBox};

/// 白底合成帧（纯函数）。
fn blank_frame(w: u32, h: u32) -> image::RgbImage {
    image::RgbImage::from_pixel(w, h, image::Rgb([255, 255, 255]))
}

/// 画实心矩形（纯函数）。
fn fill_rect(img: &mut image::RgbImage, x0: u32, y0: u32, x1: u32, y1: u32, rgb: [u8; 3]) {
    for y in y0..=y1.min(img.height() - 1) {
        for x in x0..=x1.min(img.width() - 1) {
            img.put_pixel(x, y, image::Rgb(rgb));
        }
    }
}

/// 合成表格帧（640×360）：横线 2 条贯穿 + 竖线 3 条——版面分析必判 Table。
/// 线宽 11px、左/上边界对齐降采样网格点（20px 格）——恰好命中 1 个采样
/// 行/列（线宽 ≥1 格尺寸会占 2 列，竖线互为邻列 → 孤立线判定失败；
/// 真实表格线 1-3px 即 1 采样列，与本合成口径一致）。
fn table_frame() -> image::RgbImage {
    let mut img = blank_frame(640, 360);
    let line = [0, 0, 0];
    // 横线（采样行 y=40/320 命中；行墨迹占比 24/32=0.75）
    fill_rect(&mut img, 80, 30, 550, 40, line);
    fill_rect(&mut img, 80, 310, 550, 320, line);
    // 竖线（采样列 x=80/320/540 命中；列墨迹占比 15/18=0.83；邻列静默）
    fill_rect(&mut img, 80, 30, 90, 320, line);
    fill_rect(&mut img, 320, 30, 330, 320, line);
    fill_rect(&mut img, 540, 30, 550, 320, line);
    img
}

/// 合成字幕帧（640×360）：底部深色背景条（y=310..340）+ 白色文字带——
/// 模拟视频字幕（背景条+字幕文字，旧版 50%+ 误收来源）。
fn subtitle_frame() -> image::RgbImage {
    let mut img = blank_frame(640, 360);
    fill_rect(&mut img, 0, 310, 639, 340, [20, 20, 20]);
    fill_rect(&mut img, 150, 318, 480, 328, [255, 255, 255]); // 白色文字带
    img
}

/// 会话 + 单屏 OCR 块 + 归档 full 帧（集成测试前置）。
fn setup_session_with_table_frame(
    dir: &Path,
    db: &Db,
) -> i64 {
    let session = db
        .create_session(&crate::types::NewSession {
            title: "结构图测试".to_string(),
            source_window: None,
            profile: None,
            kind: None,
        })
        .unwrap();
    // 屏成员块（screen_id=1；first=last=1000）
    db.add_ocr_block(&NewSessionOcrBlock {
        session_id: session.id,
        timestamp_ms: 1_000,
        text: "表格内容".to_string(),
        score: 0.9,
        region: "full".to_string(),
        region_kind: Some("table".to_string()),
        bbox: Some(TextBox { x: 80.0, y: 30.0, w: 480.0, h: 300.0 }),
        screen_id: Some(1),
    })
    .unwrap();
    // 归档 full 帧（时间戳=1000）
    let images_dir = dir.join("session-images").join(session.id.to_string());
    std::fs::create_dir_all(images_dir.join("full")).unwrap();
    let rgb = table_frame();
    crate::image_store::encode_webp(&rgb, &images_dir.join("full/1000.webp")).unwrap();
    session.id
}

/// 会话 + 表格帧 + 字幕帧（v0.10.2 字幕拦截端到端前置）。
fn setup_session_with_subtitle_and_table(dir: &Path, db: &Db) -> i64 {
    let session = db
        .create_session(&crate::types::NewSession {
            title: "字幕拦截测试".to_string(),
            source_window: None,
            profile: None,
            kind: None,
        })
        .unwrap();
    // 表格画面要点块（ts=1000）
    db.add_ocr_block(&NewSessionOcrBlock {
        session_id: session.id,
        timestamp_ms: 1_000,
        text: "表格内容".to_string(),
        score: 0.9,
        region: "full".to_string(),
        region_kind: Some("table".to_string()),
        bbox: Some(TextBox { x: 80.0, y: 30.0, w: 480.0, h: 300.0 }),
        screen_id: Some(1),
    })
    .unwrap();
    // 字幕块（ts=5000，bbox 与字幕帧底部条带重叠）
    db.add_ocr_block(&NewSessionOcrBlock {
        session_id: session.id,
        timestamp_ms: 5_000,
        text: "字幕内容".to_string(),
        score: 0.95,
        region: "subtitle".to_string(),
        region_kind: None,
        bbox: Some(TextBox { x: 0.0, y: 310.0, w: 640.0, h: 30.0 }),
        screen_id: Some(1),
    })
    .unwrap();
    let images_dir = dir.join("session-images").join(session.id.to_string());
    std::fs::create_dir_all(images_dir.join("full")).unwrap();
    crate::image_store::encode_webp(&table_frame(), &images_dir.join("full/1000.webp")).unwrap();
    crate::image_store::encode_webp(&subtitle_frame(), &images_dir.join("full/5000.webp")).unwrap();
    session.id
}

#[test]
fn capture_captures_table_region_end_to_end() {
    // Arrange：tempdir + 内存库 + 表格屏
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(":memory:").unwrap();
    let sid = setup_session_with_table_frame(dir.path(), &db);

    // Act：批量捕获
    let summary = capture_session_structures(&db, dir.path(), sid, 5_000_000).unwrap();

    // Assert：扫描参考图 + 表格入库（记录 + 文件）
    assert_eq!(summary.images_scanned, 1);
    assert_eq!(summary.captured, 1);
    assert!(!summary.budget_exhausted);
    let list = crate::db_structures::list_structure_images(&db, sid).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].kind, "table");
    assert_eq!(list[0].source_ts_ms, 1_000);
    assert!(dir.path().join("session-images").join(sid.to_string()).join(&list[0].crop_path).exists());
}

#[test]
fn capture_rerun_is_idempotent() {
    // Arrange：首跑入库
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(":memory:").unwrap();
    let sid = setup_session_with_table_frame(dir.path(), &db);
    capture_session_structures(&db, dir.path(), sid, 5_000_000).unwrap();

    // Act：重跑（同图去重）
    let summary = capture_session_structures(&db, dir.path(), sid, 5_000_000).unwrap();

    // Assert：零新增（幂等），原记录保留
    assert_eq!(summary.captured, 0);
    assert_eq!(crate::db_structures::list_structure_images(&db, sid).unwrap().len(), 1);
}

#[test]
fn capture_skips_session_without_images() {
    // Arrange：无 OCR 块的会话
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(":memory:").unwrap();
    let session = db
        .create_session(&crate::types::NewSession {
            title: "空会话".to_string(),
            source_window: None,
            profile: None,
            kind: None,
        })
        .unwrap();

    // Act
    let summary = capture_session_structures(&db, dir.path(), session.id, 5_000_000).unwrap();

    // Assert：零扫描零捕获（降级不报错）
    assert_eq!(summary.images_scanned, 0);
    assert_eq!(summary.captured, 0);
}

#[test]
fn capture_rejects_subtitle_frame_end_to_end() {
    // Arrange：参考图集含表格帧（ts=1000）+ 字幕帧（ts=5000）
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(":memory:").unwrap();
    let sid = setup_session_with_subtitle_and_table(dir.path(), &db);

    // Act：直扫参考图集
    let summary = capture_session_structures(&db, dir.path(), sid, 5_000_000).unwrap();

    // Assert：两张图都扫描，但只收表格（字幕帧被 L0/L3 拦截）
    assert_eq!(summary.images_scanned, 2);
    assert_eq!(summary.captured, 1);
    let list = crate::db_structures::list_structure_images(&db, sid).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].kind, "table");
    assert_eq!(list[0].source_ts_ms, 1_000);
}

#[test]
fn filter_context_windows_by_timestamp() {
    // Arrange：OCR 块跨时间窗分布（直接构造 SessionOcrBlock）
    let block = |ts: u64, region: &str, score: f32, bbox: Option<TextBox>| {
        crate::types::SessionOcrBlock {
            id: 0,
            session_id: 1,
            timestamp_ms: ts,
            text: "块".to_string(),
            score,
            region: region.to_string(),
            region_kind: None,
            bbox,
            screen_id: Some(1),
        }
    };
    let blocks = vec![
        block(1_000, "subtitle", 0.9, Some(TextBox { x: 0.0, y: 300.0, w: 640.0, h: 30.0 })),
        block(5_000, "full", 0.8, Some(TextBox { x: 10.0, y: 10.0, w: 100.0, h: 50.0 })),
        block(9_001, "subtitle", 0.7, Some(TextBox { x: 0.0, y: 300.0, w: 640.0, h: 30.0 })),
    ];

    // Act：ts=6000 时窗 [3000,9000]——命中 5s full 块，字幕 A/窗外均出窗
    let ctx = build_filter_context(&blocks, 6_000);

    // Assert：只带窗内信号（full 块进 L2；窗外字幕不参与 L0）
    assert_eq!(ctx.subtitle_boxes.len(), 0);
    assert_eq!(ctx.full_blocks.len(), 1);
    assert_eq!(ctx.full_blocks[0].1, 0.8);
}

#[test]
fn filter_context_ignores_blocks_without_bbox() {
    // Arrange：旧数据无 bbox 块（无法参与重叠判定）
    let session_blocks = vec![crate::types::SessionOcrBlock {
        id: 0,
        session_id: 1,
        timestamp_ms: 1_000,
        text: "无框".to_string(),
        score: 0.9,
        region: "subtitle".to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }];

    // Act
    let ctx = build_filter_context(&session_blocks, 1_000);

    // Assert：跳过（L3 位置约束兜底）
    assert!(ctx.subtitle_boxes.is_empty());
    assert!(ctx.full_blocks.is_empty());
}

#[test]
fn grid_from_rgb_matches_bgra_route() {
    // Arrange：同一像素内容——RGB 帧与其 BGRA 表示
    let mut rgb = blank_frame(64, 36);
    fill_rect(&mut rgb, 10, 5, 40, 20, [20, 40, 60]);
    let mut bgra: Vec<u8> = Vec::with_capacity(64 * 36 * 4);
    for p in rgb.pixels() {
        bgra.extend_from_slice(&[p[2], p[1], p[0], 255]);
    }

    // Act：两条路径出网格
    let via_rgb = super::grid_from_rgb(&rgb);
    let via_bgra = crate::frame_features::grid_from_bgra(&bgra, 64, 36).unwrap();

    // Assert：同口径（降采样网格逐格一致）
    assert_eq!(via_rgb, via_bgra);
}

#[test]
fn crop_region_clamps_out_of_bounds() {
    // Arrange：小帧 + 越界区域
    let img = blank_frame(100, 80);
    let region = LayoutRegion {
        kind: RegionKind::Table,
        x: 90,
        y: 70,
        w: 50,
        h: 40,
        confidence: 0.9,
        is_structural: true,
    };

    // Act：越界钳制
    let crop = super::crop_region(&img, &region);

    // Assert：裁剪到帧边界（10×10），不 panic
    let crop = crop.unwrap();
    assert_eq!((crop.width(), crop.height()), (10, 10));
}

#[test]
fn crop_region_empty_rejected() {
    // Arrange：区域完全在帧外
    let img = blank_frame(100, 80);
    let region = LayoutRegion {
        kind: RegionKind::Table,
        x: 200,
        y: 200,
        w: 10,
        h: 10,
        confidence: 0.9,
        is_structural: true,
    };

    // Act/Assert：空尺寸 → None
    assert!(super::crop_region(&img, &region).is_none());
}

#[test]
fn grid_from_rgb_degenerate_sizes() {
    // Arrange：1×1 帧（网格退化 1×1）
    let rgb = image::RgbImage::from_pixel(1, 1, image::Rgb([10, 20, 30]));

    // Act
    let grid = super::grid_from_rgb(&rgb);

    // Assert：1×1 网格且亮度 = Rec.601(R=10,G=20,B=30)
    assert_eq!(grid.cols, 1);
    assert_eq!(grid.rows, 1);
    let luma = (10u32 * 299 + 20 * 587 + 30 * 114) / 1000;
    assert_eq!(grid.cells[0], luma as u8);
}
