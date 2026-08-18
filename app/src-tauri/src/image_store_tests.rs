//! 会话图片存储单测（REQ-051 / v0.5.0 M6）。
//!
//! @ai-context: AAA 模式；tempfile 隔离（不触碰真实数据）；覆盖保存/预算/
//!              列表/防御/缩略图。

use super::*;

/// 构造纯色 BGRA 帧。
fn solid_frame(w: u32, h: u32, r: u8, g: u8, b: u8) -> Vec<u8> {
    let mut raw = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..(w * h) {
        raw.extend_from_slice(&[b, g, r, 255]);
    }
    raw
}

#[test]
fn save_frame_writes_full_and_thumb() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    // Act
    let rel = store.save_frame(1000, &solid_frame(640, 360, 100, 150, 200), 640, 360).unwrap();
    // Assert：相对路径 + 两个文件均存在
    assert_eq!(rel, "full/1000.webp");
    assert!(dir.path().join("full/1000.webp").exists());
    assert!(dir.path().join("thumb/1000.webp").exists());
}

#[test]
fn save_frame_large_image_creates_smaller_thumb() {
    // Arrange：1920×1080 帧（缩略图应缩小）
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    // Act
    store.save_frame(1, &solid_frame(1920, 1080, 50, 60, 70), 1920, 1080).unwrap();
    // Assert：缩略图存在且可解码（尺寸 ≤ 上限）
    let thumb = image::open(dir.path().join("thumb/1.webp")).expect("thumb decodable").to_rgb8();
    let (tw, th) = thumb.dimensions();
    assert!(tw <= THUMB_MAX_WIDTH && th <= THUMB_MAX_HEIGHT);
    // 原图保持尺寸
    let full = image::open(dir.path().join("full/1.webp")).expect("full decodable").to_rgb8();
    assert_eq!(full.dimensions(), (1920, 1080));
}

#[test]
fn budget_limited_to_max() {
    // Arrange：预算上限 50
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    // Act：保存 50 张（预算内）
    for i in 0..BUDGET_MAX_IMAGES as u64 {
        store.save_frame(i * 100, &solid_frame(32, 32, 10, 20, 30), 32, 32).unwrap();
    }
    // Assert：第 51 张超预算报错
    let err = store.save_frame(9999, &solid_frame(32, 32, 10, 20, 30), 32, 32);
    assert!(err.is_err(), "超预算应拒绝保存");
    assert_eq!(store.remaining_budget(), 0);
}

#[test]
fn list_images_sorted_by_timestamp() {
    // Arrange：乱序保存
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    store.save_frame(3000, &solid_frame(32, 32, 1, 1, 1), 32, 32).unwrap();
    store.save_frame(1000, &solid_frame(32, 32, 2, 2, 2), 32, 32).unwrap();
    store.save_frame(2000, &solid_frame(32, 32, 3, 3, 3), 32, 32).unwrap();
    // Act
    let list = store.list_images();
    // Assert：按文件名（时间戳）升序
    assert_eq!(list, vec!["full/1000.webp", "full/2000.webp", "full/3000.webp"]);
}

#[test]
fn malformed_frame_rejected() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    // Act/Assert：长度不匹配 → Err（不写盘）
    assert!(store.save_frame(1, &[0u8; 10], 4, 4).is_err());
    assert!(store.list_images().is_empty());
}

#[test]
fn zero_size_frame_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    assert!(store.save_frame(1, &[], 0, 0).is_err());
}

#[test]
fn store_creates_directories() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let sub = dir.path().join("sessions/42");
    // Act
    SessionImageStore::new(sub.clone()).unwrap();
    // Assert：full/thumb 目录已创建
    assert!(sub.join("full").is_dir());
    assert!(sub.join("thumb").is_dir());
}

#[test]
fn save_frame_roundtrip_preserves_color() {
    // Arrange：纯红帧
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    store.save_frame(7, &solid_frame(64, 64, 255, 0, 0), 64, 64).unwrap();
    // Act：解码原图验证像素
    let full = image::open(dir.path().join("full/7.webp")).unwrap().to_rgb8();
    let pixel = full.get_pixel(10, 10);
    // Assert：红色保留（WebP lossless：RGB 无损）
    assert_eq!(*pixel, image::Rgb([255, 0, 0]));
}
