//! 健康巡检与诊断 command（REQ-042 F2/F3/G2 / v0.4.0 M7）。
//!
//! @ai-context: health_status = 磁盘/模型/线程心跳三查（会话页状态徽标数据源）；
//!              diag_snapshot = 缓存命中率/失败计数/后端/回退原因（开发期诊断面板）。
//! @ai-context: 全部只读共享计数（engine worker 原子更新），无阻塞长操作。

use serde::Serialize;
use tauri::Manager;
use tauri::State;

use crate::commands::AppState;
use crate::device_config::OcrBackend;
use crate::health_check::{disk_free_bytes, disk_warn, missing_model_files};

/// 健康快照（会话页徽标）。
#[derive(Debug, Clone, Serialize)]
pub struct HealthSnapshot {
    pub disk_free_gb: Option<f64>,
    pub disk_warn: bool,
    pub missing_models: Vec<String>,
    pub asr_alive: bool,
    pub ocr_alive: bool,
}

/// 诊断快照（开发期面板）。
#[derive(Debug, Clone, Serialize)]
pub struct DiagSnapshot {
    pub ocr_cache_hits: u64,
    pub ocr_cache_misses: u64,
    pub ocr_hit_rate: f64,
    pub asr_failures: u64,
    pub ocr_failures: u64,
    pub ocr_backend: OcrBackend,
    pub ocr_fallback_reason: Option<String>,
}

/// 健康巡检（磁盘剩余 + 模型文件 + 引擎线程心跳）。
#[tauri::command]
pub fn health_status(state: State<'_, AppState>) -> HealthSnapshot {
    // 磁盘：应用数据目录所在卷
    let data_dir = state
        .app
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let free = if data_dir.is_empty() {
        None
    } else {
        disk_free_bytes(std::path::Path::new(&data_dir))
    };
    let (asr_alive, ocr_alive) = state.engines.liveness();
    let missing = {
        let m = &state.streaming_models;
        missing_model_files(&[
            ("streaming encoder", std::path::Path::new(&m.encoder)),
            ("streaming decoder", std::path::Path::new(&m.decoder)),
            ("streaming joiner", std::path::Path::new(&m.joiner)),
            ("streaming tokens", std::path::Path::new(&m.tokens)),
        ])
    };
    HealthSnapshot {
        disk_free_gb: free.map(|b| b as f64 / 1024.0 / 1024.0 / 1024.0),
        disk_warn: disk_warn(free),
        missing_models: missing,
        asr_alive,
        ocr_alive,
    }
}

/// 诊断快照（缓存命中率 / 失败计数 / OCR 后端）。
#[tauri::command]
pub fn diag_snapshot(state: State<'_, AppState>) -> DiagSnapshot {
    let (hits, misses) = state.engines.ocr_cache_counts();
    let (asr_failures, ocr_failures) = state.engines.failure_counts();
    let status = state.engines.ocr_device_status();
    let total = hits + misses;
    DiagSnapshot {
        ocr_cache_hits: hits,
        ocr_cache_misses: misses,
        ocr_hit_rate: if total == 0 { 0.0 } else { hits as f64 * 100.0 / total as f64 },
        asr_failures,
        ocr_failures,
        ocr_backend: status.actual,
        ocr_fallback_reason: status.fallback_reason,
    }
}
