//! 实时音频落盘单测（REQ-068 / v0.6.0 M4）。
//!
//! @ai-context: AAA 模式；tempfile 隔离；覆盖 WAV 头/数据 roundtrip、
//!              finalize 回填、保留期/磁盘预算清理、降级路径。
//! @ai-context: T23 的签名连带（R5.5-b）：`write_chunk` 加了 `timestamp_ms` 入参 ⇒ 本文件
//!              4 处旧调用点传 `None`（**只改调用形态、断言一字未动**）——`None` 正好
//!              覆盖「无时间基准 ⇒ 纯追加」的降级路径（与 T23 前的行为逐字节相同）。

use super::*;

fn config() -> AudioStoreConfig {
    AudioStoreConfig::default()
}

#[test]
fn wav_header_and_data_roundtrip() {
    // Arrange
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 42, &config()).expect("writer");
    // Act：写两块样本（每块 100 样本；无时间戳 ⇒ 纯追加，与 T23 前同形）
    let chunk: Vec<f32> = (0..100).map(|i| (i as f32 / 100.0) - 0.5).collect();
    writer.write_chunk(&chunk, None);
    writer.write_chunk(&chunk, None);
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
    writer.write_chunk(&[0.1, 0.2], None);
    writer.finalize();
    // finalize 后写入不再增长（句柄已释放）
    writer.write_chunk(&[0.3], None);
    let len = std::fs::metadata(dir.path().join("7.wav")).unwrap().len();
    assert_eq!(len, (WAV_HEADER_LEN + 4) as u64);
}

// ───────────────────────── T23/R5.5-b：WAV 轴 ≡ 会话轴 ─────────────────────────

/// 一块 200 ms @16 kHz 的样本数（与 `capture/audio_loopback.rs:338` 的块长一致）。
const BLOCK: usize = 3_200;

/// 读 sidecar（断言键名与取值；缺文件即红 —— 不做容错）。
fn sidecar(dir: &std::path::Path, id: i64) -> serde_json::Value {
    let text = std::fs::read_to_string(dir.join(format!("{}.wav.meta.json", id))).expect("sidecar");
    serde_json::from_str(&text).expect("sidecar 是 JSON")
}

/// V1（行为级）：空档补静音 —— 文件字节数 == `44 + (3200 + 3200 + 200ms×16 + 3200) × 2`。
#[test]
fn write_chunk_pads_silence_for_gaps() {
    // Arrange：t0 → t0+200ms（连续）→ t0+600ms（空档 200ms）
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 23, &config()).expect("writer");
    let block = vec![0.5f32; BLOCK];
    // Act
    writer.write_chunk(&block, Some(1_000));
    writer.write_chunk(&block, Some(1_200));
    writer.write_chunk(&block, Some(1_600));
    writer.finalize();
    // Assert：44 + 12800×2 字节；data 长度字段同步
    let raw = std::fs::read(dir.path().join("23.wav")).unwrap();
    assert_eq!(raw.len(), WAV_HEADER_LEN + 12_800 * 2, "空档补静音后的文件长度");
    assert_eq!(&raw[40..44], &(12_800u32 * 2).to_le_bytes(), "finalize 回填 data 长度");
    // 空档区（第 3 块之前）确实是零样本：偏移 = 44 + (3200+3200)×2
    let gap = WAV_HEADER_LEN + 6_400 * 2;
    assert!(raw[gap..gap + BLOCK * 2].iter().all(|b| *b == 0), "空档必须补静音");
    // 反证：样本区不得是零（0.5 ⇒ 16384）—— 防「整段填零」的假绿
    assert_eq!(i16::from_le_bytes([raw[44], raw[45]]), 16_384);
    let third = gap + BLOCK * 2;
    assert_eq!(i16::from_le_bytes([raw[third], raw[third + 1]]), 16_384);
}

/// V2：缺 `timestamp_ms` ⇒ 纯追加 + `aligned = false`，**样本一个不丢**、写盘不中断。
#[test]
fn missing_timestamp_degrades_to_append_and_marks_unaligned() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 24, &config()).expect("writer");
    let block = vec![0.25f32; BLOCK];
    writer.write_chunk(&block, Some(1_000));
    writer.write_chunk(&block, None); // 时间戳缺失 ⇒ 永久失效
    writer.write_chunk(&block, Some(9_000)); // 后续即便单调也不补（且样本照写）
    writer.finalize();
    let raw = std::fs::read(dir.path().join("24.wav")).unwrap();
    assert_eq!(raw.len(), WAV_HEADER_LEN + 9_600 * 2, "三块样本一个不少、且没有任何补零");
    assert_eq!(sidecar(dir.path(), 24)["aligned"], serde_json::json!(false));
    assert_eq!(sidecar(dir.path(), 24)["samplesWritten"], serde_json::json!(9_600));
}

/// V3：时间戳非单调 ⇒ 同上，且回退块**照常写入**（不被丢弃、不产生负长度）。
#[test]
fn non_monotonic_timestamp_degrades_to_append() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 25, &config()).expect("writer");
    let block = vec![0.25f32; BLOCK];
    writer.write_chunk(&block, Some(2_000));
    writer.write_chunk(&block, Some(1_500)); // 回退 500ms
    writer.finalize();
    let raw = std::fs::read(dir.path().join("25.wav")).unwrap();
    assert_eq!(raw.len(), WAV_HEADER_LEN + 6_400 * 2, "回退块照常写入（纯追加）");
    assert_eq!(sidecar(dir.path(), 25)["aligned"], serde_json::json!(false));
}

/// V4：`aligned` **不得恒 true** —— 全程单调 ⇒ `true`；且 sidecar 键名 = 冻结快照
/// （T22 读侧按它取 `aligned`；改名会让读侧静默回落 `false`）。
#[test]
fn sidecar_marks_aligned_session_with_frozen_keys() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 26, &config()).expect("writer");
    let block = vec![0.1f32; BLOCK];
    writer.write_chunk(&block, Some(1_000));
    writer.write_chunk(&block, Some(1_200));
    writer.finalize();
    let s = sidecar(dir.path(), 26);
    assert_eq!(s["version"], serde_json::json!(1));
    assert_eq!(s["aligned"], serde_json::json!(true));
    assert_eq!(s["firstTsMs"], serde_json::json!(1_000));
    assert_eq!(s["samplesWritten"], serde_json::json!(6_400));
    let mut keys: Vec<String> = s.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, vec!["aligned", "firstTsMs", "samplesWritten", "version"]);
}

/// V6：超大空档（> `MAX_GAP_MS`）⇒ 不补（否则会当场写 ≈9.6M 样本静音）+ `aligned = false`。
#[test]
fn oversized_gap_does_not_write_bulk_silence() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 27, &config()).expect("writer");
    let block = vec![0.1f32; BLOCK];
    writer.write_chunk(&block, Some(1_000));
    // 空档自**上块末端**（1_200）起算 ⇒ 取 MAX_GAP_MS + 1 才真的超上限
    writer.write_chunk(&block, Some(1_200 + audio_align::MAX_GAP_MS + 1));
    writer.finalize();
    let raw = std::fs::read(dir.path().join("27.wav")).unwrap();
    assert_eq!(raw.len(), WAV_HEADER_LEN + 6_400 * 2, "超上限不补");
    assert_eq!(sidecar(dir.path(), 27)["aligned"], serde_json::json!(false));
}

/// 自证不变式（writer 级）：`data 长度 ÷ 2 ÷ 16 ==（末块 ts − 首块 ts）+ 块长`，
/// 在**发生过暂停 + 静默窗**的会话形态上同样成立（暂停两侧抵消：端点停采 ↔ 时间戳冻结）。
#[test]
fn wav_axis_equals_session_axis_after_pause_and_silence_window() {
    let dir = tempfile::tempdir().unwrap();
    let mut writer = SessionAudioWriter::create(dir.path(), 28, &config()).expect("writer");
    let block = vec![0.1f32; BLOCK];
    // 会话形态：连续两块 →（暂停 30s：会话轴上不可见，`timestamp_ms` 已补偿）→ 一块
    //          → 静默窗 1.8s（无包）→ 收尾两块
    for ts in [1_000i64, 1_200, 1_400, 3_400, 3_600] {
        writer.write_chunk(&block, Some(ts));
    }
    writer.finalize();
    let raw = std::fs::read(dir.path().join("28.wav")).unwrap();
    let data_len = u64::from(u32::from_le_bytes(raw[40..44].try_into().unwrap()));
    // 逐字读数：44800 样本 ⇒ 2800 ms == (3600 − 1000) + 200
    assert_eq!(data_len, 44_800 * 2);
    assert_eq!(data_len / 2 / 16, (3_600 - 1_000) + 200);
    assert_eq!(sidecar(dir.path(), 28)["aligned"], serde_json::json!(true));
}

/// R5.5-b 第 3 条：**历史录音必须能区分** —— 本修复之前的 WAV 无 sidecar（读侧 false）；
/// 本模块产出的会话**一定**带 sidecar（`true`/`false` 皆可读 ⇒ 与历史录音区分得开）。
#[test]
fn sidecar_distinguishes_history_from_new_sessions() {
    let dir = tempfile::tempdir().unwrap();
    // 历史录音形态：只有 WAV（T23 之前录的）
    std::fs::write(dir.path().join("9.wav"), b"RIFF").unwrap();
    assert!(!dir.path().join("9.wav.meta.json").exists(), "历史录音无 sidecar");
    // 新会话：即便无时间基准（`aligned=false`）也**有据可查**
    let mut writer = SessionAudioWriter::create(dir.path(), 10, &config()).expect("writer");
    writer.write_chunk(&vec![0.0f32; BLOCK], None);
    writer.finalize();
    assert!(dir.path().join("10.wav.meta.json").exists(), "新会话必写 sidecar");
    assert_eq!(sidecar(dir.path(), 10)["aligned"], serde_json::json!(false));
}
