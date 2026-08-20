//! screens 屏构建单测（v0.7.3 REQ-155/156，ADR-015）。
//!
//! @ai-context: 覆盖分组/聚类双路径、结构块提取、图匹配；IO 用临时目录隔离。

use std::fs;

use crate::screens::build_screens;
use crate::types::{SessionOcrBlock, TextBox};

/// 测试辅助：构造会话 OCR 块（region=full，可带 bbox/screen_id/region_kind）。
fn blk(
    id: i64,
    ts: u64,
    text: &str,
    screen_id: Option<i64>,
    bbox: Option<(f32, f32, f32, f32)>,
    region_kind: Option<&str>,
) -> SessionOcrBlock {
    SessionOcrBlock {
        id,
        session_id: 1,
        timestamp_ms: ts,
        text: text.to_string(),
        score: 0.95,
        region: "full".to_string(),
        region_kind: region_kind.map(String::from),
        bbox: bbox.map(|(x, y, w, h)| TextBox { x, y, w, h }),
        screen_id,
    }
}

fn tmp_images_dir(tag: &str, files: &[u64]) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("entropy-screens-{}-{}", tag, std::process::id()));
    let full = dir.join("full");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&full).unwrap();
    for ts in files {
        fs::write(full.join(format!("{}.webp", ts)), b"img").unwrap();
    }
    dir
}

#[test]
fn build_screens_groups_by_screen_id() {
    // Arrange：两屏（各 2 帧）；标题/正文/标签块带 bbox；屏间无图目录
    let dir = tmp_images_dir("group", &[]);
    let blocks = vec![
        blk(1, 2_000, "为什么高手管理者思路特别清晰？", Some(1), Some((100.0, 100.0, 600.0, 50.0)), None),
        blk(2, 2_000, "系统思维", Some(1), Some((100.0, 170.0, 200.0, 36.0)), None),
        blk(3, 2_000, "一般系统思创始人贝塔郎非认为：系统是由相互联系的若干要素组成的整体。", Some(1), Some((100.0, 240.0, 700.0, 30.0)), None),
        blk(4, 2_000, "要素", Some(1), Some((100.0, 700.0, 80.0, 26.0)), None),
        blk(5, 30_000, "为什么高手管", Some(1), Some((100.0, 100.0, 300.0, 50.0)), None),
        blk(6, 30_000, "系统思维", Some(1), Some((100.0, 170.0, 200.0, 36.0)), None),
        blk(7, 60_000, "牛顿第一定律", Some(2), Some((100.0, 100.0, 400.0, 50.0)), None),
        blk(8, 60_000, "苹果为什么往下掉", Some(2), Some((100.0, 240.0, 300.0, 30.0)), None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：2 屏；屏1 区间 2000-30000、标题为字高最大者、标签含"要素"
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].screen_id, Some(1));
    assert_eq!(screens[0].first_seen_ms, 2_000);
    assert_eq!(screens[0].last_seen_ms, 30_000);
    assert_eq!(screens[0].title.as_deref(), Some("为什么高手管理者思路特别清晰？"));
    assert!(screens[0].labels.iter().any(|l| l == "要素"));
    assert_eq!(screens[1].screen_id, Some(2));
    assert_eq!(screens[1].first_seen_ms, 60_000);
}

#[test]
fn build_screens_clusters_legacy_blocks() {
    // Arrange：旧数据（无 screen_id）——同屏截断变体 + 翻页
    let dir = tmp_images_dir("legacy", &[]);
    let blocks = vec![
        blk(1, 2_000, "为什么高手管理者思路特别清晰？", None, None, None),
        blk(2, 2_000, "系统思维", None, None, None),
        blk(3, 30_000, "为什么高手管", None, None, None),
        blk(4, 30_000, "系统思维", None, None, None),
        blk(5, 60_000, "牛顿第一定律", None, None, None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：屏1（变体合并）+ 屏2（翻页）；屏1 无标题（无 bbox 诚实降级）
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].screen_id, None);
    assert_eq!(screens[0].first_seen_ms, 2_000);
    assert_eq!(screens[0].last_seen_ms, 30_000);
    assert_eq!(screens[0].title, None);
    assert!(screens[0].body.iter().any(|b| b == "系统思维"));
    assert_eq!(screens[1].first_seen_ms, 60_000);
}

#[test]
fn build_screens_mixed_old_and_new() {
    // Arrange：屏1 新数据（screen_id=1）+ 屏2 旧数据（NULL）混杂
    let dir = tmp_images_dir("mixed", &[]);
    let blocks = vec![
        blk(1, 2_000, "新屏内容A", Some(1), Some((100.0, 100.0, 300.0, 40.0)), None),
        blk(2, 60_000, "旧屏内容B", None, None, None),
        blk(3, 65_000, "旧屏内容C", None, None, None),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：两条路径都出屏（2 屏）
    assert_eq!(screens.len(), 2);
    assert_eq!(screens[0].screen_id, Some(1));
    assert_eq!(screens[1].screen_id, None);
}

#[test]
fn build_screens_structure_blocks_excluded_from_text() {
    // Arrange：表格区域块（region_kind=table）+ 正文
    let dir = tmp_images_dir("struct", &[]);
    let blocks = vec![
        blk(1, 2_000, "表格标题", Some(1), Some((100.0, 100.0, 300.0, 40.0)), None),
        blk(2, 2_000, "| A | B |", Some(1), Some((100.0, 200.0, 300.0, 60.0)), Some("table")),
    ];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：结构块进 structure 不进 body；rendered=None（M5 精修前）
    assert_eq!(screens.len(), 1);
    assert_eq!(screens[0].structure.len(), 1);
    assert_eq!(screens[0].structure[0].kind, "table");
    assert_eq!(screens[0].structure[0].rendered, None);
    assert!(!screens[0].body.iter().any(|b| b.contains("| A |")));
}

#[test]
fn build_screens_empty_and_no_full_blocks() {
    // Arrange：空输入 + 只有字幕区块
    let dir = tmp_images_dir("empty", &[]);
    let subtitle_only = vec![SessionOcrBlock {
        id: 1,
        session_id: 1,
        timestamp_ms: 1_000,
        text: "字幕内容".to_string(),
        score: 0.9,
        region: "subtitle".to_string(),
        region_kind: None,
        bbox: None,
        screen_id: None,
    }];
    // Act/Assert
    assert!(build_screens(&[], Some(&dir)).is_empty());
    assert!(build_screens(&subtitle_only, Some(&dir)).is_empty());
}

#[test]
fn image_ref_matches_nearest_at_or_before_first_seen() {
    // Arrange：归档图 2000/10000/30000；屏 first_seen=36404 → 最近 ≤ 为 30000
    let dir = tmp_images_dir("img", &[2_000, 10_000, 30_000]);
    let blocks = vec![blk(1, 36_404, "内容", Some(1), Some((100.0, 100.0, 200.0, 40.0)), None)];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert
    assert_eq!(screens[0].image_ref.as_deref(), Some("full/30000.webp"));
}

#[test]
fn image_ref_none_without_dir() {
    // Arrange：无图目录（路径不存在）
    let dir = std::env::temp_dir().join(format!("entropy-screens-missing-{}", std::process::id()));
    let blocks = vec![blk(1, 1_000, "内容", Some(1), Some((100.0, 100.0, 200.0, 40.0)), None)];
    // Act
    let screens = build_screens(&blocks, Some(&dir));
    // Assert：图匹配失败不阻断屏构建
    assert_eq!(screens.len(), 1);
    assert_eq!(screens[0].image_ref, None);
}
