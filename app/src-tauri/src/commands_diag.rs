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
    // 模型完整性：流式四件套 + 离线 SenseVoice（审查修复——此前仅查流式，
    // sensevoice 缺失要到首次识别失败才能暴露；OCR 模型经 ModelScope 缓存路径不稳定，留日志侧）
    // TD-2026-08-20-E/F 清偿：增查说话人（wespeaker）与标点恢复模型——
    // 此前就绪清单（ReadyCheckCard）不含这两项，缺失要到会话页才暴露
    let missing = {
        let m = &state.streaming_models;
        let mut list = missing_model_files(&[
            ("streaming encoder", std::path::Path::new(&m.encoder)),
            ("streaming decoder", std::path::Path::new(&m.decoder)),
            ("streaming joiner", std::path::Path::new(&m.joiner)),
            ("streaming tokens", std::path::Path::new(&m.tokens)),
        ]);
        let sense_dir = state.model_dir.join("asr/sensevoice");
        list.extend(missing_model_files(&[
            ("sensevoice model", &sense_dir.join("model.int8.onnx")),
            ("sensevoice tokens", &sense_dir.join("tokens.txt")),
        ]));
        // speaker-embedding/model.onnx（speaker_engine.rs 路径约定；缺失=讲者分离未启用）
        list.extend(missing_model_files(&[(
            "speaker model",
            &state.model_dir.join(crate::speaker_engine::SPEAKER_MODEL_REL),
        )]));
        // punctuation/model.int8.onnx（lib.rs punctuation_model 路径约定；缺失=无标点降级）
        list.extend(missing_model_files(&[(
            "punctuation model",
            &state.model_dir.join("punctuation/model.int8.onnx"),
        )]));
        list
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

/// VAD 阈值诊断（REQ-115 PRE-O4 / v0.7.0 M2）：当前自适应阈值 + 基础阈值对照。
///
/// @ai-context: 降级提示（固定阈值判定）与切段判定（自适应阈值）口径对照——
///              诊断可查阈值（验收点）；无活动会话时 current=上次会话残留值。
/// @ai-context: 审查 MEDIUM-8 修复：source_session/is_live 标注新鲜度——
///              诊断面板可区分"实时值"与"残留值"（避免误读旧会话口径）。
#[tauri::command]
pub fn vad_threshold_diag(state: State<'_, AppState>) -> crate::vad_threshold_slot::VadThresholdView {
    let current = state.vad_slot.read();
    let source = state.vad_slot.source_session_id();
    // 活动会话判定（Windows 实时链路；非 Windows 无活动会话概念）
    #[cfg(target_os = "windows")]
    let is_live = state.live_session.active_session_id() == Some(source);
    #[cfg(not(target_os = "windows"))]
    let is_live = false;
    crate::vad_threshold_slot::VadThresholdView {
        current,
        base: crate::streaming_asr::SILENCE_RMS_THRESHOLD,
        source_session: source,
        is_live,
    }
}

/// 模型磁盘占用总览（REQ-131 P13 / v0.7.0 M3）：models 目录各子目录占用 + 版本。
///
/// @ai-context: 磁盘占用面板数据源（版本可查——.model-version 标记；
///              回退动作由下载器执行，本命令只读清单）。
#[tauri::command]
pub fn model_disk_overview(state: State<'_, AppState>) -> crate::model_registry::ModelDiskOverview {
    crate::model_registry::build_disk_overview(&state.model_dir)
}
