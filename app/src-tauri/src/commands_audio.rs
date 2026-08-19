//! 会话音频落盘 Tauri commands（REQ-068 / v0.6.0 M4，S4）。
//!
//! @ai-context: 本层只做参数校验、调用 audio_store、错误映射（AGENTS.md §6）；
//!              清理 UI（M6 前端消费）的两个后端命令：
//!              session_audio_status（文件数/总字节/预算/保留期——展示用）、
//!              session_audio_cleanup（手动触发清理——超保留期/超预算删最旧）。

//! @ai-context: REQ-101（v0.7.0 M1）：audio_preproc 开/关命令——CER 微基准
//!              （bin/cer_bench.rs）定默认值后的用户开关通道；配置 JSON 持久化
//!              应用数据目录（AudioPreprocConfig，原子写），下次实时会话生效。

use tauri::State;

use crate::audio_preproc_config::AudioPreprocConfig;
use crate::audio_store::{audio_dir_stats, cleanup, AudioStoreConfig};
use crate::commands::AppState;

/// 音频预处理配置状态（前端开关载荷）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioPreprocStatus {
    /// 持久化配置开关
    pub enabled: bool,
    /// 生效开关（env ENTROPY_AUDIO_PREPROC 覆盖配置文件时不同）
    pub effective: bool,
}

/// 查询音频预处理链配置（REQ-101）。
#[tauri::command]
pub fn audio_preproc_status(state: State<'_, AppState>) -> AudioPreprocStatus {
    let cfg = AudioPreprocConfig::load(&state.data_dir.join("audio-preproc.json"));
    AudioPreprocStatus { enabled: cfg.enabled, effective: cfg.effective() }
}

/// 设置音频预处理链开关（REQ-101；持久化，下次实时会话生效）。
#[tauri::command]
pub fn audio_preproc_set(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<AudioPreprocStatus, String> {
    let cfg = AudioPreprocConfig { enabled };
    cfg.save(&state.data_dir.join("audio-preproc.json")).map_err(|e| e.to_string())?;
    Ok(AudioPreprocStatus { enabled: cfg.enabled, effective: cfg.effective() })
}

/// 会话音频状态载荷（前端展示）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAudioStatus {
    /// 已落盘音频文件数
    pub file_count: usize,
    /// 总字节数
    pub total_bytes: u64,
    /// 保留期（天；策略配置）
    pub retention_days: u64,
    /// 磁盘预算（字节；策略配置）
    pub disk_budget_bytes: u64,
    /// 落盘策略开关（false=未启用，前端提示）
    pub enabled: bool,
}

/// 查询会话音频落盘状态（数量/占用/策略）。
#[tauri::command]
pub fn session_audio_status(state: State<'_, AppState>) -> SessionAudioStatus {
    let dir = state.data_dir.join("session-audio");
    let (file_count, total_bytes) = audio_dir_stats(&dir);
    let config = AudioStoreConfig::default();
    SessionAudioStatus {
        file_count,
        total_bytes,
        retention_days: config.retention_days,
        disk_budget_bytes: config.disk_budget_bytes,
        enabled: config.enabled,
    }
}

/// 手动触发音频清理（超保留期删除 + 超预算删最旧）。
#[tauri::command]
pub fn session_audio_cleanup(state: State<'_, AppState>) -> Result<crate::audio_store::CleanupSummary, String> {
    let dir = state.data_dir.join("session-audio");
    let config = AudioStoreConfig::default();
    Ok(cleanup(&dir, config.retention_days, config.disk_budget_bytes))
}
