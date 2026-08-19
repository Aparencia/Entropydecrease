//! 实时音频落盘单测（REQ-068 / v0.6.0 M4）。
//!
//! @ai-context: AAA 模式；tempfile 隔离；覆盖 WAV 头/数据 roundtrip、
//!              finalize 回填、保留期/磁盘预算清理、降级路径。

use super::*;

fn config() -> AudioStoreConfig {
    AudioStoreConfig::default()
}

#[test]
fn wav_header_and_data_roundtrip() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 42, &config()).expect("writer");
    // Act：写两块样本（每块 100 样本）
    let chunk: Vec<f32> = (0..100).map(|i| (i as f32 / 100.0) - 0.5).collect();
    writer.write_chunk(&chunk);
    writer.write_chunk(&chunk);
    writer.finalize();
    // Assert：WAV 头（RIFF/WAVE/PCM16/16kHz/单声道/200 样本）
    let raw = std::fs::read(dir.path().join("42.wav")).unwrap();
    assert_eq!(&raw[0..4], b"RIFF");
    assert_eq!(&raw[8..12], b"WAVE");
    assert_eq!(&raw[20..22], &1u16.to_le_bytes(), "PCM 格式");
    assert_eq!(&raw[22..24], &1u16.to_le_bytes(), "单声道");
    assert_eq!(&raw[24..28], &16_000u32.to_le_bytes(), "16kHz");
    assert_eq!(&raw[34..36], &16u16.to_le_bytes(), "16-bit");
    // data 长度 = 200 样本 × 2 字节 = 400
    assert_eq!(&raw[40..44], &400u32.to_le_bytes(), "finalize 回填 data 长度");
    // RIFF 长度 = 36 + 400 = 436
    assert_eq!(&raw[4..8], &436u32.to_le_bytes(), "finalize 回填 RIFF 长度");
    // 数据区 400 字节
    assert_eq!(raw.len(), WAV_HEADER_LEN + 400);
    // 首个样本 = (-0.5 → i16) = -16384（f32 → i16 钳制转换）
    let first = i16::from_le_bytes([raw[WAV_HEADER_LEN], raw[WAV_HEADER_LEN + 1]]);
    assert_eq!(first, -16384);
}

#[test]
fn disabled_config_produces_no_file() {
    // Arrange：关闭落盘
    let cfg = AudioStoreConfig { enabled: false, ..config() };
    let dir = tempfile::tempdir().unwrap();
    // Act
    let writer = SessionAudioWriter::create(dir.path(), 1, &cfg);
    // Assert：None（零开销路径）
    assert!(writer.is_none());
    assert!(!dir.path().join("1.wav").exists());
}

#[test]
fn create_failure_degrades_silently() {
    // Arrange：目录路径是文件（create_dir_all 失败）
    let dir = tempfile::tempdir().unwrap();
    let blocker = dir.path().join("session-audio");
    std::fs::write(&blocker, "not a dir").unwrap();
    // Act
    let writer = SessionAudioWriter::create(&blocker, 1, &config());
    // Assert：None（降级不 panic）
    assert!(writer.is_none());
}

#[test]
fn retention_cleanup_removes_expired() {
    // Arrange：两个文件，一个 mtime 超保留期（改 mtime 到 40 天前）
    let dir = tempfile::tempdir().unwrap();
    let old = dir.path().join("old.wav");
    let fresh = dir.path().join("fresh.wav");
    std::fs::write(&old, vec![0u8; 1000]).unwrap();
    std::fs::write(&fresh, vec![0u8; 2000]).unwrap();
    let old_time = std::time::SystemTime::now() - std::time::Duration::from_secs(40 * 86_400);
    std::fs::File::options().write(true).open(&old).unwrap().set_modified(old_time).unwrap();
    // Act：保留期 30 天
    let summary = cleanup(dir.path(), 30, u64::MAX);
    // Assert：旧文件删除、新文件保留
    assert_eq!(summary.deleted, 1);
    assert_eq!(summary.freed_bytes, 1000);
    assert!(!old.exists());
    assert!(fresh.exists());
}

#[test]
fn budget_cleanup_removes_oldest_until_under() {
    // Arrange：三个文件（大小 1KB/2KB/3KB），预算 3.5KB → 删最旧 1KB
    let dir = tempfile::tempdir().unwrap();
    for (name, size) in [("a.wav", 1000u64), ("b.wav", 2000), ("c.wav", 3000)] {
        std::fs::write(dir.path().join(name), vec![0u8; size as usize]).unwrap();
    }
    // 确保 mtime 递增（依次 +1s）
    let base = std::time::SystemTime::now() - std::time::Duration::from_secs(60);
    for (i, name) in ["a.wav", "b.wav", "c.wav"].iter().enumerate() {
        let t = base + std::time::Duration::from_secs(i as u64);
        std::fs::File::options().write(true).open(dir.path().join(name)).unwrap().set_modified(t).unwrap();
    }
    // Act：预算 3500 字节
    let summary = cleanup(dir.path(), 365, 3500);
    // Assert：删最旧 a.wav（1000 字节）后总 5000-1000=4000 仍超 3500 → 再删 b.wav
    assert_eq!(summary.deleted, 2);
    assert!(dir.path().join("c.wav").exists());
    assert!(!dir.path().join("a.wav").exists());
    assert!(!dir.path().join("b.wav").exists());
}

#[test]
fn budget_cleanup_under_budget_keeps_all() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.wav"), vec![0u8; 100]).unwrap();
    // Act：预算巨大 → 不删
    let summary = cleanup(dir.path(), 30, u64::MAX);
    // Assert
    assert_eq!(summary.deleted, 0);
    assert!(dir.path().join("a.wav").exists());
}

#[test]
fn stats_counts_files_and_bytes() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.wav"), vec![0u8; 100]).unwrap();
    std::fs::write(dir.path().join("b.wav"), vec![0u8; 200]).unwrap();
    std::fs::write(dir.path().join("c.txt"), vec![0u8; 300]).unwrap();
    // Act & Assert：只统计 wav
    assert_eq!(audio_dir_stats(dir.path()), (2, 300));
}

#[test]
fn write_after_finalize_is_noop() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 7, &config()).unwrap();
    writer.write_chunk(&[0.1, 0.2]);
    writer.finalize();
    // finalize 后写入不再增长（句柄已释放）
    writer.write_chunk(&[0.3]);
    let len = std::fs::metadata(dir.path().join("7.wav")).unwrap().len();
    assert_eq!(len, (WAV_HEADER_LEN + 4) as u64);
}
