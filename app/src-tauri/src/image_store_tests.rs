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

/// 构造固定种子噪声 BGRA 帧（REQ-067 起 save_frame 双指纹去重——纯色/两色
/// 帧是 aHash/dHash 的退化输入：亮度平移/相对明暗不变 → 指纹相同会被误判
/// 同图；噪声帧空间结构丰富，不同 seed 指纹必然不同，同 seed 完全复现）。
fn seeded_frame(w: u32, h: u32, seed: u32) -> Vec<u8> {
    let mut state = seed.wrapping_mul(0x9E37_79B9).wrapping_add(1);
    let mut raw = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..(w * h) {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        let v = (state >> 24) as u8;
        raw.extend_from_slice(&[v, v, v, 255]);
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
fn save_crop_isolated_from_full_frames() {
    // Arrange（审查 H2 回归验证：裁剪图与关键帧同时间戳不互相覆盖；
    // 用 seeded 帧——纯色帧是双指纹退化输入，跨命名空间会误判同图）
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    // Act：同时间戳先存关键帧（整帧）再存裁剪图（区域）
    store.save_frame(1000, &seeded_frame(640, 360, 1), 640, 360).unwrap();
    let crop_rel = store.save_crop(1000, &seeded_frame(200, 100, 2), 200, 100).unwrap();
    // Assert：命名空间隔离（crop/ 与 full/ 独立文件，互不覆盖）
    assert_eq!(crop_rel, "crop/1000.webp");
    assert!(dir.path().join("full/1000.webp").exists());
    assert!(dir.path().join("crop/1000.webp").exists());
    // 内容可区分（裁剪图为红色系，整帧为蓝系）
    let full = image::open(dir.path().join("full/1000.webp")).unwrap().to_rgb8();
    let crop = image::open(dir.path().join("crop/1000.webp")).unwrap().to_rgb8();
    assert_eq!(full.dimensions(), (640, 360));
    assert_eq!(crop.dimensions(), (200, 100));
    // 列表分离
    assert_eq!(store.list_images(), vec!["full/1000.webp".to_string()]);
    assert_eq!(store.list_crops(), vec!["crop/1000.webp".to_string()]);
}

#[test]
fn crop_and_full_same_content_isolated_by_namespace() {
    // Arrange（六轮审查修复回归：去重按命名空间隔离——旧实现同一 FIFO 无差别
    // 命中，裁剪图与整帧内容相同时 save_crop 返回 full/ 路径且不落盘；
    // save_user_screenshot 的返回路径直接暴露前端，必须正确）
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    let img = seeded_frame(64, 64, 7);
    // Act：完全相同内容先后存 full 与 crop
    let full = store.save_frame(1000, &img, 64, 64).unwrap();
    let crop = store.save_crop(2000, &img, 64, 64).unwrap();
    // Assert：命名空间隔离——两个文件都落盘、路径各自正确
    assert_eq!(full, "full/1000.webp");
    assert_eq!(crop, "crop/2000.webp");
    assert!(dir.path().join("full/1000.webp").exists());
    assert!(dir.path().join("crop/2000.webp").exists());
    // 同命名空间内重复仍去重（不落盘、返回首次路径）
    let dup = store.save_crop(3000, &img, 64, 64).unwrap();
    assert_eq!(dup, "crop/2000.webp");
    assert!(!dir.path().join("crop/3000.webp").exists());
}

#[test]
fn save_crop_shares_budget_with_frames() {
    // Arrange：裁剪图与关键帧共用预算（防总盘占用失控）
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    // Act：交替存满预算（分区帧——双指纹去重下不同内容仍各存）
    for i in 0..BUDGET_MAX_IMAGES {
        let ts = i as u64 * 100;
        let rel = if i % 2 == 0 {
            store.save_frame(ts, &seeded_frame(32, 32, i as u32 + 1), 32, 32).unwrap()
        } else {
            store.save_crop(ts, &seeded_frame(32, 32, (i + 100) as u32), 32, 32).unwrap()
        };
        assert!(rel.starts_with(if i % 2 == 0 { "full/" } else { "crop/" }));
    }
    // Assert：超预算两者都拒绝
    assert!(store.save_frame(9999, &seeded_frame(32, 32, 999), 32, 32).is_err());
    assert!(store.save_crop(9999, &seeded_frame(32, 32, 1999), 32, 32).is_err());
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
    // Act：保存 50 张（预算内；分区帧内容各异——双指纹去重不误并）
    for i in 0..BUDGET_MAX_IMAGES as u64 {
        store
            .save_frame(i * 100, &seeded_frame(32, 32, i as u32 + 1), 32, 32)
            .unwrap();
    }
    // Assert：第 51 张超预算报错
    let err = store.save_frame(9999, &seeded_frame(32, 32, 999), 32, 32);
    assert!(err.is_err(), "超预算应拒绝保存");
    assert_eq!(store.remaining_budget(), 0);
}

#[test]
fn reopened_store_restores_budget_from_disk() {
    // Arrange：存 3 张后关闭 store（模拟命令层每次 new——原实现 saved 重置为 0，
    // 预算从此失效：save_user_screenshot 可无限存图超上限）
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
        store.save_frame(100, &seeded_frame(32, 32, 1), 32, 32).unwrap();
        store.save_crop(200, &seeded_frame(32, 32, 2), 32, 32).unwrap();
        store.save_frame(300, &seeded_frame(32, 32, 3), 32, 32).unwrap();
    }
    // Act：重新打开（新实例，saved 应恢复为 3——full 2 + crop 1）
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    // Assert：预算按磁盘已有图片扣减，而非归零
    assert_eq!(store.remaining_budget(), BUDGET_MAX_IMAGES - 3);
    for i in 0..(BUDGET_MAX_IMAGES - 3) as u64 {
        store
            .save_frame(1000 + i, &seeded_frame(32, 32, (i + 10) as u32), 32, 32)
            .unwrap();
    }
    assert!(store.save_frame(99999, &seeded_frame(32, 32, 9999), 32, 32).is_err(), "恢复预算后仍应封顶");
}

#[test]
fn list_images_sorted_by_timestamp() {
    // Arrange：乱序保存（分区帧内容各异——双指纹去重不误并）
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    store.save_frame(3000, &seeded_frame(32, 32, 1), 32, 32).unwrap();
    store.save_frame(1000, &seeded_frame(32, 32, 2), 32, 32).unwrap();
    store.save_frame(2000, &seeded_frame(32, 32, 3), 32, 32).unwrap();
    // Act
    let list = store.list_images();
    // Assert：按文件名（时间戳）升序
    assert_eq!(list, vec!["full/1000.webp", "full/2000.webp", "full/3000.webp"]);
}

#[test]
fn duplicate_frame_deduped_by_dual_fingerprint() {
    // Arrange：REQ-067 去重语义——连续保存相同内容帧 → 第二次返回首次路径且不重复存
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    let frame = seeded_frame(64, 64, 7);
    // Act：相同内容两次保存（不同时间戳）
    let first = store.save_frame(1000, &frame, 64, 64).unwrap();
    let second = store.save_frame(2000, &frame, 64, 64).unwrap();
    // Assert：第二次去重命中（返回首次路径）；磁盘只存 1 张；预算只扣 1
    assert_eq!(first, "full/1000.webp");
    assert_eq!(second, "full/1000.webp", "重复帧应返回首次保存路径");
    assert!(!dir.path().join("full/2000.webp").exists(), "重复帧不得落盘");
    assert_eq!(store.remaining_budget(), BUDGET_MAX_IMAGES - 1);
    // 不同内容 → 正常保存（去重不误伤）
    let other = store.save_frame(3000, &seeded_frame(64, 64, 8), 64, 64).unwrap();
    assert_eq!(other, "full/3000.webp");
    assert_eq!(store.list_images().len(), 2);
}

#[test]
fn duplicate_crop_deduped_by_dual_fingerprint() {
    // Arrange：修复回归——裁剪图原无去重，视频进度条等静态误判区域每 tick
    // 重复存图（会话 15 实测 49 张全同垃圾 crop 耗尽 50 张预算）
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    let crop = seeded_frame(66, 45, 11);
    // Act：相同内容两次保存（不同时间戳）
    let first = store.save_crop(1000, &crop, 66, 45).unwrap();
    let second = store.save_crop(2000, &crop, 66, 45).unwrap();
    // Assert：第二次去重命中（返回首次路径）；磁盘只存 1 张；预算只扣 1
    assert_eq!(first, "crop/1000.webp");
    assert_eq!(second, "crop/1000.webp", "重复裁剪图应返回首次保存路径");
    assert!(!dir.path().join("crop/2000.webp").exists(), "重复裁剪图不得落盘");
    assert_eq!(store.remaining_budget(), BUDGET_MAX_IMAGES - 1);
    // 不同内容 → 正常保存（去重不误伤）
    let other = store.save_crop(3000, &seeded_frame(66, 45, 12), 66, 45).unwrap();
    assert_eq!(other, "crop/3000.webp");
    assert_eq!(store.list_crops().len(), 2);
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
