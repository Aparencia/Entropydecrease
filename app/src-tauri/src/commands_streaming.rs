//! 流式 ASR 模型状态 command（REQ-009，ADR-003 模型分发）。
//!
//! @ai-context: 前端在开始实时会话前调用 asr_streaming_model_status，
//!              未就绪时给出缺失文件清单与下载引导（hf-mirror 镜像脚本）。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;
use crate::model_downloader::DownloadStatus;

/// 流式 ASR 模型就绪状态。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingModelStatus {
    pub ready: bool,
    /// 缺失的文件名列表（可操作引导）
    pub missing: Vec<String>,
}

/// 查询流式 ASR 模型是否就绪（四件套文件存在性检查）。
#[tauri::command]
pub fn asr_streaming_model_status(state: State<'_, AppState>) -> Result<StreamingModelStatus, String> {
    let models = &state.streaming_models;
    let mut missing = Vec::new();
    for (name, path) in [
        ("encoder.fp16.onnx", &models.encoder),
        ("decoder.fp16.onnx", &models.decoder),
        ("joiner.fp16.onnx", &models.joiner),
        ("tokens.txt", &models.tokens),
    ] {
        if !std::path::Path::new(path).exists() {
            missing.push(name.to_string());
        }
    }
    Ok(StreamingModelStatus { ready: missing.is_empty(), missing })
}

/// 启动流式 ASR 模型自动下载（hf-mirror 镜像，后台线程，进度经 model:download-progress 事件）。
///
/// @ai-context: 用户需求：模型自动下载与配置——应用内一键下载，无需手动跑脚本；
///              下载中重复调用返回错误；失败后前端引导手动放置。
#[tauri::command]
pub async fn download_streaming_model(state: State<'_, AppState>) -> Result<(), String> {
    state
        .model_downloader
        .start(state.streaming_models.clone(), state.app.clone())
        .map_err(|e| e.to_string())
}

/// 查询模型下载状态（前端轮询/初始化恢复）。
#[tauri::command]
pub fn model_download_status(state: State<'_, AppState>) -> DownloadStatus {
    state.model_downloader.status()
}
