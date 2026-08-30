//! 结构图存储单测（REQ-183 / v0.7.7，AAA 模式）。
//!
//! @ai-context: tempfile 隔离；覆盖 auto 预算/去重/文件名唯一化/manual 不设限/
//!              删除/路径防御。去重用 seeded 帧（纯色帧是双指纹退化输入，
//!              image_store_tests 同口径）。

use super::*;

/// 固定种子噪声 BGRA 帧（同 seed 完全复现——去重判定输入；image_store 同口径）。
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

/// 构造纯色 BGRA 帧。
fn solid_frame(w: u32, h: u32, r: u8, g: u8, b: u8) -> Vec<u8> {
    let mut raw = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..(w * h) {
        raw.extend_from_slice(&[b, g, r, 255]);
    }
    raw
}

#[test]
fn save_auto_writes_struct_and_thumb() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let mut store = StructureImageStore::new(dir.path().to_path_buf()).unwrap();

    // Act
    let out = store.save_auto(5_000, &seeded_frame(200, 100, 1), 200, 100).unwrap();

    // Assert：相对路径 + 原图与缩略图均存在 + 新入库标记
    assert_eq!(out.rel, "struct/5000.webp");
    assert!(out.is_new);
    assert!(dir.path().join("struct/5000.webp").exists());
    assert!(dir.path().join("struct/thumb/5000.webp").exists());
    assert_eq!(store.remaining_budget(), STRUCT_BUDGET_AUTO - 1);
}

#[test]
fn save_auto_dedupes_same_image() {
    // Arrange：同 seed 帧两次入库（同图）
    let dir = tempfile::tempdir().unwrap();
    let mut store = StructureImageStore::new(dir.path().to_path_buf()).unwrap();
    store.save_auto(1_000, &seeded_frame(200, 100, 7), 200, 100).unwrap();

    // Act：同图再存（时间戳不同）
    let out = store.save_auto(2_000, &seeded_frame(200, 100, 7), 200, 100).unwrap();

    // Assert：返回已有路径 + 非新入库标记（调用方不插记录）；不新增文件不占预算
    assert_eq!(out.rel, "struct/1000.webp");
    assert!(!out.is_new);
    assert!(!dir.path().join("struct/2000.webp").exists());
    assert_eq!(store.remaining_budget(), STRUCT_BUDGET_AUTO - 1);
}

#[test]
fn save_auto_dedupes_across_store_instances() {
    // Arrange：实例 A 入库（模拟批量任务首跑）
    let dir = tempfile::tempdir().unwrap();
    {
        let mut a = StructureImageStore::new(dir.path().to_path_buf()).unwrap();
        a.save_auto(1_000, &seeded_frame(200, 100, 9), 200, 100).unwrap();
    }
    // Act：实例 B（模拟重跑——内存 FIFO 不跨调用，必须从磁盘重建指纹）
    let mut b = StructureImageStore::new(dir.path().to_path_buf()).unwrap();
    let out = b.save_auto(2_000, &seeded_frame(200, 100, 9), 200, 100).unwrap();

    // Assert：跨实例同图命中（重跑幂等的关键路径）
    assert_eq!(out.rel, "struct/1000.webp");
    assert!(!out.is_new);
}

#[test]
fn save_auto_respects_budget() {
    // Arrange：预算 2 张
    let dir = tempfile::tempdir().unwrap();
    let mut store = StructureImageStore::with_budget(dir.path().to_path_buf(), 2).unwrap();

    // Act：第 1、2 张成功，第 3 张超预算报错
    store.save_auto(1_000, &seeded_frame(200, 100, 1), 200, 100).unwrap();
    store.save_auto(2_000, &seeded_frame(200, 100, 2), 200, 100).unwrap();
    let err = store.save_auto(3_000, &seeded_frame(200, 100, 3), 200, 100);

    // Assert：Err 且文件未落盘
    assert!(err.is_err());
    assert!(!dir.path().join("struct/3000.webp").exists());
    assert_eq!(store.remaining_budget(), 0);
}

#[test]
fn save_manual_ignores_budget_and_dedupe() {
    // Arrange：预算 0（手动路径不应被预算拦截）
    let dir = tempfile::tempdir().unwrap();
    let mut store = StructureImageStore::with_budget(dir.path().to_path_buf(), 0).unwrap();

    // Act：手动存同图两次 + 纯色帧一次
    let rel1 = store.save_manual(1_000, &seeded_frame(200, 100, 5), 200, 100).unwrap();
    let rel2 = store.save_manual(2_000, &seeded_frame(200, 100, 5), 200, 100).unwrap();
    store.save_manual(3_000, &solid_frame(200, 100, 10, 20, 30), 200, 100).unwrap();

    // Assert：全成功；同图不去重（两次入库两个文件）；预算不消耗（0 预算仍可存）
    assert_eq!(rel1, "struct/1000.webp");
    assert_eq!(rel2, "struct/2000.webp");
    assert!(dir.path().join("struct/3000.webp").exists());
}

#[test]
fn unique_name_avoids_collision() {
    // Arrange：同毫秒两次入库（先 auto 占名）
    let dir = tempfile::tempdir().unwrap();
    let mut store = StructureImageStore::new(dir.path().to_path_buf()).unwrap();
    store.save_auto(4_000, &seeded_frame(200, 100, 1), 200, 100).unwrap();

    // Act：同毫秒再存（不同内容）
    let rel = store.save_manual(4_000, &seeded_frame(200, 100, 2), 200, 100).unwrap();

    // Assert：文件名递增兜底（不覆盖）
    assert_eq!(rel, "struct/4001.webp");
    assert!(dir.path().join("struct/4000.webp").exists());
    assert!(dir.path().join("struct/4001.webp").exists());
}

#[test]
fn delete_removes_full_and_thumb() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let mut store = StructureImageStore::new(dir.path().to_path_buf()).unwrap();
    let out = store.save_auto(6_000, &seeded_frame(200, 100, 1), 200, 100).unwrap();

    // Act
    store.delete_image(&out.rel).unwrap();

    // Assert：两文件均删除
    assert!(!dir.path().join("struct/6000.webp").exists());
    assert!(!dir.path().join("struct/thumb/6000.webp").exists());
}

#[test]
fn delete_rejects_non_struct_path() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let store = StructureImageStore::new(dir.path().to_path_buf()).unwrap();

    // Act/Assert：路径穿越/非 struct/ 前缀拒绝（防御）
    assert!(store.delete_image("full/1000.webp").is_err());
    assert!(store.delete_image("../outside.webp").is_err());
}

#[test]
fn invalid_frame_data_rejected() {
    // Arrange：长度不匹配的脏数据
    let dir = tempfile::tempdir().unwrap();
    let mut store = StructureImageStore::new(dir.path().to_path_buf()).unwrap();

    // Act/Assert：数据无效 → Err（不 panic、不落盘）
    assert!(store.save_auto(1_000, &[0u8; 10], 200, 100).is_err());
    assert!(store.save_manual(1_000, &[0u8; 10], 200, 100).is_err());
}
