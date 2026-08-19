//! 实时链路音频落盘（REQ-068 / v0.6.0 M4，S4 早期排）。
//!
//! @ai-context: 实时链路当前不落盘（已核查）——本模块按会话落 WAV
//!              （16kHz 单声道 PCM16，~115MB/小时），为 AL3 漂移实测
//!              （REQ-063 真机校准数据源）、V4 两遍解码（v0.7.0+）、
//!              X1 回听（待议）铺路。
//! @ai-context: 策略可配：默认开 / 保留期 30 天 / 磁盘预算上限（超限删最旧，
//!              在会话结束时触发）；清理 UI 由命令层暴露（M6 前端消费）。
//! @ai-context: 落盘失败不阻断会话主链路（本地优先铁律的降级方向：音频是
//!              增强数据源，ASR/OCR 不依赖落盘）。
//! @ai-context: WAV 头 44 字节（RIFF/WAVE/fmt/data），长度字段 finalize 回填
//!              （防崩溃残留半成品：头部长度 0 可识别，清理/回听可跳过）。

use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// 默认保留期（天）。
pub const DEFAULT_RETENTION_DAYS: u64 = 30;
/// 默认磁盘预算（字节；1 小时 ≈ 115MB，预算 4GB ≈ 35 小时会话）。
pub const DEFAULT_DISK_BUDGET_BYTES: u64 = 4 * 1024 * 1024 * 1024;
/// WAV 头长度（RIFF 12 + fmt 24 + data 8）。
const WAV_HEADER_LEN: usize = 44;
/// 采样率（与捕获链路契约一致：16kHz）。
const SAMPLE_RATE: u32 = 16_000;
/// 声道数（单声道）。
const CHANNELS: u16 = 1;

/// 落盘策略配置。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioStoreConfig {
    /// 总开关（默认开；关闭=现状行为零开销）
    pub enabled: bool,
    /// 保留期（天；超期文件清理）
    pub retention_days: u64,
    /// 磁盘预算（字节；总大小超限删最旧）
    pub disk_budget_bytes: u64,
}

impl Default for AudioStoreConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            retention_days: DEFAULT_RETENTION_DAYS,
            disk_budget_bytes: DEFAULT_DISK_BUDGET_BYTES,
        }
    }
}

/// 清理结果摘要（命令层/日志消费）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct CleanupSummary {
    /// 删除的文件数
    pub deleted: usize,
    /// 释放字节数
    pub freed_bytes: u64,
}

/// 会话音频写入器（有状态：目标文件 + 已写样本数）。
pub struct SessionAudioWriter {
    file: Option<std::fs::File>,
    samples_written: u64,
}

impl SessionAudioWriter {
    /// 创建会话音频文件（含 WAV 头；失败 → None——落盘降级不阻断主链路）。
    ///
    /// @ai-context: 目录不存在则创建（data_dir/session-audio/）；头部长度
    ///              字段占位 0，finalize 回填（崩溃残留可识别）。
    pub fn create(session_audio_dir: &Path, session_id: i64, config: &AudioStoreConfig) -> Option<Self> {
        if !config.enabled {
            return None;
        }
        std::fs::create_dir_all(session_audio_dir).ok()?;
        let path = session_audio_dir.join(format!("{}.wav", session_id));
        let mut file = std::fs::File::create(&path).ok()?;
        if write_header(&mut file, 0).is_err() {
            return None;
        }
        Some(Self { file: Some(file), samples_written: 0 })
    }

    /// 追加一块样本（f32 → PCM16；失败静默降级——落盘不阻断主链路）。
    pub fn write_chunk(&mut self, samples: &[f32]) {
        let Some(file) = self.file.as_mut() else { return };
        let mut buf = Vec::with_capacity(samples.len() * 2);
        for s in samples {
            // f32 → i16 量化（round 半远离零——截断会引入 -0.5 偏置）
            let v = (s.clamp(-1.0, 1.0) * 32767.0).round() as i16;
            buf.extend_from_slice(&v.to_le_bytes());
        }
        if file.write_all(&buf).is_err() {
            // 写盘失败：释放句柄（后续块不再尝试——降级为不落盘）
            self.file = None;
        } else {
            self.samples_written += samples.len() as u64;
        }
    }

    /// 结束会话：回填 WAV 长度字段（RIFF/data）并关闭文件。
    pub fn finalize(&mut self) {
        let Some(mut file) = self.file.take() else { return };
        // data 长度 = 样本数 × 2 字节；RIFF 长度 = 36 + data 长度
        let data_len = self.samples_written * 2;
        let riff_len = 36 + data_len;
        let _ = file.seek(std::io::SeekFrom::Start(4));
        let _ = file.write_all(&(riff_len as u32).to_le_bytes());
        let _ = file.seek(std::io::SeekFrom::Start(40));
        let _ = file.write_all(&(data_len as u32).to_le_bytes());
        let _ = file.sync_all();
    }
}

/// 写 WAV 头（fmt 16-bit PCM + data 占位）。
fn write_header(file: &mut std::fs::File, data_len: u64) -> std::io::Result<()> {
    let mut hdr = Vec::with_capacity(WAV_HEADER_LEN);
    hdr.extend_from_slice(b"RIFF");
    hdr.extend_from_slice(&((36 + data_len) as u32).to_le_bytes());
    hdr.extend_from_slice(b"WAVE");
    hdr.extend_from_slice(b"fmt ");
    hdr.extend_from_slice(&16u32.to_le_bytes()); // fmt 块长度
    hdr.extend_from_slice(&1u16.to_le_bytes()); // PCM
    hdr.extend_from_slice(&CHANNELS.to_le_bytes());
    hdr.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    hdr.extend_from_slice(&(SAMPLE_RATE * CHANNELS as u32 * 2).to_le_bytes()); // byte rate
    hdr.extend_from_slice(&2u16.to_le_bytes()); // block align
    hdr.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    hdr.extend_from_slice(b"data");
    hdr.extend_from_slice(&(data_len as u32).to_le_bytes());
    file.write_all(&hdr)
}

/// 清理过期/超预算音频（纯 IO；保留期内未超预算的文件不动）。
///
/// @ai-context: 两阶段：① 超保留期（mtime 距今 > retention_days）全删；
///              ② 剩余文件总大小超预算 → 按 mtime 从旧到新删至达标。
///              崩溃残留（头部长度 0）按最旧处理（正常清理路径覆盖）。
pub fn cleanup(
    session_audio_dir: &Path,
    retention_days: u64,
    disk_budget_bytes: u64,
) -> CleanupSummary {
    let mut deleted = 0usize;
    let mut freed_bytes: u64 = 0;
    let Ok(entries) = std::fs::read_dir(session_audio_dir) else {
        return CleanupSummary { deleted: 0, freed_bytes: 0 };
    };
    // 收集 wav 文件（路径 + mtime + 大小）
    let cutoff = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        .saturating_sub((retention_days * 86_400) as i64);
    let mut files: Vec<(PathBuf, i64, u64)> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "wav"))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let mtime = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs() as i64;
            Some((e.path(), mtime, meta.len()))
        })
        .collect();
    // ① 保留期清理
    files.retain(|(path, mtime, size)| {
        if *mtime < cutoff {
            if std::fs::remove_file(path).is_ok() {
                deleted += 1;
                freed_bytes += *size;
            }
            false
        } else {
            true
        }
    });
    // ② 磁盘预算清理（按 mtime 升序删最旧）
    files.sort_by_key(|(_, mtime, _)| *mtime);
    let total: u64 = files.iter().map(|(_, _, size)| *size).sum();
    let mut over = total.saturating_sub(disk_budget_bytes);
    for (path, _, size) in files {
        if over == 0 {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            deleted += 1;
            freed_bytes += size;
            over = over.saturating_sub(size);
        }
    }
    CleanupSummary { deleted, freed_bytes }
}

/// 会话音频目录统计（状态命令用：文件数 + 总字节）。
pub fn audio_dir_stats(session_audio_dir: &Path) -> (usize, u64) {
    let Ok(entries) = std::fs::read_dir(session_audio_dir) else {
        return (0, 0);
    };
    let mut count = 0usize;
    let mut bytes = 0u64;
    for e in entries.flatten() {
        if e.path().extension().is_some_and(|x| x == "wav") {
            if let Ok(meta) = e.metadata() {
                count += 1;
                bytes += meta.len();
            }
        }
    }
    (count, bytes)
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "audio_store_tests.rs"]
mod tests;
