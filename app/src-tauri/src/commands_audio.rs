//! 会话音频落盘 Tauri commands（REQ-068 / v0.6.0 M4，S4）。
//!
//! @ai-context: 本层只做参数校验、调用 audio_store、错误映射（AGENTS.md §6）；
//!              清理 UI（M6 前端消费）的两个后端命令：
//!              session_audio_status（文件数/总字节/预算/保留期——展示用）、
//!              session_audio_cleanup（手动触发清理——超保留期/超预算删最旧）。

use tauri::State;

use crate::audio_store::{audio_dir_stats, cleanup, AudioStoreConfig};
use crate::commands::AppState;

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
