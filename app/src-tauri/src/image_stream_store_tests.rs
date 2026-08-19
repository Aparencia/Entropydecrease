//! 图像流存储层单测（REQ-110 / v0.7.0 M1.5；AAA 模式，临时目录）。
//!
//! @ai-context: 由 image_stream_store.rs 以 #[cfg(test)] #[path] 引入；
//!              覆盖分级存储/指纹索引/步骤边界/索引恢复。

use super::*;

/// 生成确定性纯色帧（BGRA8）。
fn frame(r: u8, g: u8, b: u8, w: u32, h: u32) -> Vec<u8> {
    let mut raw = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..w * h {
        raw.extend_from_slice(&[b, g, r, 255]);
    }
    raw
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("entropy-stream-{}-{}", name, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

#[test]
fn high_frames_stored_with_paths() {
    // Arrange：三帧 High 价值
    let dir = temp_dir("high");
    let mut store = ImageStreamStore::new(dir.clone()).unwrap();
    // Act
    store.record(1000, FrameValue::High, Some(&frame(10, 20, 30, 32, 32)), 32, 32).unwrap();
    store.record(2000, FrameValue::High, Some(&frame(40, 50, 60, 32, 32)), 32, 32).unwrap();
    // Assert：两帧均存图（stream/ 目录有 2 个 webp）
    assert_eq!(store.stored_count(), 2);
    assert_eq!(store.frames().len(), 2);
    assert!(store.frames()[0].path.as_deref().unwrap().starts_with("stream/"));
    let webp_count = std::fs::read_dir(dir.join("stream")).unwrap().filter(|e| {
        e.as_ref().unwrap().path().extension().is_some_and(|x| x == "webp")
    }).count();
    assert_eq!(webp_count, 2, "High 帧应落盘");
}

#[test]
fn low_frames_fingerprint_only() {
    // Arrange：先 High 后重复帧（低价值）
    let dir = temp_dir("low");
    let mut store = ImageStreamStore::new(dir.clone()).unwrap();
    let f = frame(10, 20, 30, 32, 32);
    store.record(1000, FrameValue::High, Some(&f), 32, 32).unwrap();
    // Act：同帧 Low（重复帧 → 只记指纹占位）
    store.record(2000, FrameValue::Low, Some(&f), 32, 32).unwrap();
    // Assert：占位在索引中、不落盘（stored_count 仍 1）
    assert_eq!(store.frames().len(), 2);
    assert_eq!(store.stored_count(), 1);
    assert!(store.frames()[1].path.is_none());
    let webp_count = std::fs::read_dir(dir.join("stream")).unwrap().filter(|e| {
        e.as_ref().unwrap().path().extension().is_some_and(|x| x == "webp")
    }).count();
    assert_eq!(webp_count, 1, "Low 帧不落盘");
}

#[test]
fn skip_frames_ignored() {
    // Arrange
    let dir = temp_dir("skip");
    let mut store = ImageStreamStore::new(dir.clone()).unwrap();
    // Act：Skip 帧（纯色黑边）
    store.record(1000, FrameValue::Skip, Some(&frame(0, 0, 0, 32, 32)), 32, 32).unwrap();
    // Assert：索引无条目
    assert!(store.frames().is_empty());
}

#[test]
fn step_boundary_marked_on_last_frame() {
    // Arrange
    let dir = temp_dir("step");
    let mut store = ImageStreamStore::new(dir.clone()).unwrap();
    store.record(1000, FrameValue::High, Some(&frame(10, 20, 30, 32, 32)), 32, 32).unwrap();
    store.record(5000, FrameValue::High, Some(&frame(40, 50, 60, 32, 32)), 32, 32).unwrap();
    // Act：标记步骤边界
    let seq = store.mark_step_boundary().unwrap();
    // Assert：序号递增 + 标记在最近帧
    assert_eq!(seq, 1);
    let steps = store.step_frames();
    assert_eq!(steps.len(), 1);
    assert_eq!(steps[0].timestamp_ms, 5000);
}

#[test]
fn index_survives_reopen() {
    // Arrange：写帧 + 关闭
    let dir = temp_dir("reopen");
    {
        let mut store = ImageStreamStore::new(dir.clone()).unwrap();
        store.record(1000, FrameValue::High, Some(&frame(10, 20, 30, 32, 32)), 32, 32).unwrap();
        store.mark_step_boundary().unwrap();
    }
    // Act：重新打开（索引从磁盘恢复）
    let store = ImageStreamStore::new(dir.clone()).unwrap();
    // Assert：帧 + 步骤边界 + 序号恢复
    assert_eq!(store.frames().len(), 1);
    assert_eq!(store.step_frames().len(), 1);
    assert_eq!(store.step_seq, 1);
}

#[test]
fn corrupted_index_rebuilds_empty() {
    // Arrange：损坏索引 JSON
    let dir = temp_dir("corrupt");
    std::fs::create_dir_all(dir.join("stream")).unwrap();
    std::fs::write(dir.join("stream").join("index.json"), "{not json").unwrap();
    // Act：打开（防御：解析失败重建空索引）
    let mut store = ImageStreamStore::new(dir.clone()).unwrap();
    // Assert：不 panic，空索引可继续写入
    assert!(store.frames().is_empty());
    store.record(1000, FrameValue::High, Some(&frame(1, 2, 3, 32, 32)), 32, 32).unwrap();
    assert_eq!(store.frames().len(), 1);
}
