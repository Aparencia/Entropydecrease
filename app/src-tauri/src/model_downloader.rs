//! 流式 ASR 模型自动下载器（ADR-003 模型分发，用户需求：模型自动下载与配置）。
//!
//! @ai-context: 应用内一键下载 streaming-zipformer 四件套（hf-mirror 国内镜像），
//!              后台线程流式写入 .part 后原子重命名（中断不残留）；进度经
//!              `model:download-progress` / `model:download-done` 事件推送前端。
//! @ai-context: 下载失败不静默——状态暴露 error 供前端引导手动放置（TLS 拦截
//!              环境下的兜底路径，与 scripts/download-streaming-asr.mjs 一致）。
//! @ai-context: 文件清单/URL 与 lib.rs streaming_asr_models() 路径约定严格一致。

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use serde::Serialize;
use tauri::Emitter;

use crate::error::{AppError, Result};
use crate::streaming_asr::StreamingAsrModels;

/// 下载文件清单（文件名 + 镜像 URL）。
/// @ai-context: 2025-06-30 新版中文 zipformer（fp16）——2026-08 升级决策；
///              文件命名与官方仓库 csukuangfj/sherpa-onnx-streaming-zipformer-zh-fp16-2025-06-30 一致。
const MODEL_FILES: &[&str] = &[
    "encoder.fp16.onnx",
    "decoder.fp16.onnx",
    "joiner.fp16.onnx",
    "tokens.txt",
];
const MIRROR_BASE: &str =
    "https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-zipformer-zh-fp16-2025-06-30/resolve/main";

/// 模型版本标记（写入 .model-version；升级时变更以触发旧文件清理）。
/// @ai-context: 2026-08 升级教训：新旧模型文件混用（旧 tokens.txt 被"已存在"跳过）
///              会导致词表不匹配——版本标记不匹配时全量清理重下。
const MODEL_VERSION: &str = "zh-fp16-2025-06-30";

/// 下载状态（跨线程共享，供 command 查询）。
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatus {
    /// idle | downloading | done | failed
    pub state: String,
    pub current_file: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub error: Option<String>,
}

/// 下载进度事件载荷。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub file: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// 模型自动下载器（AppState 持有）。
pub struct ModelDownloader {
    status: Arc<Mutex<DownloadStatus>>,
    running: Arc<AtomicBool>,
    thread: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl Default for ModelDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for ModelDownloader {
    fn clone(&self) -> Self {
        Self {
            status: self.status.clone(),
            running: self.running.clone(),
            thread: self.thread.clone(),
        }
    }
}

impl ModelDownloader {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(DownloadStatus {
                state: "idle".into(),
                current_file: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                error: None,
            })),
            running: Arc::new(AtomicBool::new(false)),
            thread: Arc::new(Mutex::new(None)),
        }
    }

    /// 启动后台下载（已在下载中则拒绝）。
    pub fn start(&self, models: StreamingAsrModels, app: tauri::AppHandle) -> Result<()> {
        if self.running.load(Ordering::SeqCst) {
            return Err(AppError::Io("模型下载已在进行中".into()));
        }
        {
            let mut status = self.status.lock().expect("download status lock");
            *status = DownloadStatus {
                state: "downloading".into(),
                current_file: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                error: None,
            };
        }
        self.running.store(true, Ordering::SeqCst);

        let status = self.status.clone();
        let running = self.running.clone();
        let handle = std::thread::Builder::new()
            .name("entropy-model-download".into())
            .spawn(move || download_all(models, app, status, running))
            .map_err(|e| AppError::Io(format!("启动下载线程失败: {}", e)))?;
        *self.thread.lock().expect("download thread lock") = Some(handle);
        Ok(())
    }

    /// 当前下载状态（command 查询用）。
    pub fn status(&self) -> DownloadStatus {
        self.status.lock().expect("download status lock").clone()
    }
}

/// 逐个下载四件套（.part 原子写入；任一失败记录 error 并停止）。
fn download_all(
    models: StreamingAsrModels,
    app: tauri::AppHandle,
    status: Arc<Mutex<DownloadStatus>>,
    running: Arc<AtomicBool>,
) {
    let dir = std::path::Path::new(&models.encoder)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(std::env::temp_dir);
    if std::fs::create_dir_all(&dir).is_err() {
        fail(&status, "创建模型目录失败".into());
        running.store(false, Ordering::SeqCst);
        return;
    }

    // 版本迁移：.model-version 标记不匹配 → 全量清理旧文件（防新旧混用）
    let version_file = dir.join(".model-version");
    let version_mismatch = match std::fs::read_to_string(&version_file) {
        Ok(v) => v.trim() != MODEL_VERSION,
        Err(_) => true,
    };
    if version_mismatch {
        let cleaned = clean_dir_models(&dir);
        eprintln!("[模型升级] 版本标记不匹配（期望 {}），已清理 {} 个旧文件", MODEL_VERSION, cleaned);
    }

    // 失败路径需要推送事件（审查 M4 修复：否则前端永久"下载中"）
    let emit_fail = |error: String| {
        let _ = app.emit("model:download-failed", error.clone());
        fail(&status, error);
    };

    for file in MODEL_FILES {
        if !running.load(Ordering::SeqCst) {
            return; // 被取消（预留）
        }
        let target = dir.join(file);
        if target.exists() && target.metadata().map(|m| m.len() > 0).unwrap_or(false) {
            continue; // 已就绪跳过
        }
        let url = format!("{}/{}", MIRROR_BASE, file);
        let part = dir.join(format!("{}.part", file));
        {
            let mut st = status.lock().expect("download status lock");
            st.current_file = Some(file.to_string());
            st.downloaded_bytes = 0;
            st.total_bytes = 0;
        }
        match download_file(&url, &part, file, &app, &status) {
            Ok(()) => {
                if std::fs::rename(&part, &target).is_err() {
                    emit_fail(format!("{} 落盘失败", file));
                    break;
                }
            }
            Err(e) => {
                let _ = std::fs::remove_file(&part);
                emit_fail(format!("{} 下载失败: {}", file, e));
                break;
            }
        }
    }

    let done = {
        let st = status.lock().expect("download status lock");
        st.state != "failed"
    };
    if done {
        let mut st = status.lock().expect("download status lock");
        st.state = "done".into();
        st.current_file = None;
        // 写入版本标记（下次启动/下载据此判断是否需要迁移清理）
        let _ = std::fs::write(&version_file, MODEL_VERSION);
        let _ = app.emit("model:download-done", true);
    }
    running.store(false, Ordering::SeqCst);
}

/// 清理模型目录中的 onnx/tokens 文件（版本迁移用，保留 .model-version 与无关文件）。
fn clean_dir_models(dir: &std::path::Path) -> usize {
    let mut cleaned = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if (name.ends_with(".onnx") || name == "tokens.txt" || name.ends_with(".part"))
                && std::fs::remove_file(entry.path()).is_ok()
            {
                cleaned += 1;
            }
        }
    }
    cleaned
}

/// 下载单个文件到 .part（流式，每 1MB 推送一次进度）。
///
/// @ai-context: 全局超时 30 分钟（650MB 级大文件放宽；防网络挂起永久阻塞，审查 M5 修复）。
fn download_file(
    url: &str,
    part: &std::path::Path,
    file: &str,
    app: &tauri::AppHandle,
    status: &Arc<Mutex<DownloadStatus>>,
) -> std::result::Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(30 * 60))
        .build();
    let resp = agent
        .get(url)
        .call()
        .map_err(|e| format!("请求失败: {}", e))?;
    let total = resp
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    {
        let mut st = status.lock().expect("download status lock");
        st.total_bytes = total;
    }

    let mut reader = resp.into_reader();
    let mut out = std::fs::File::create(part).map_err(|e| format!("创建临时文件失败: {}", e))?;
    let mut buf = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("读取响应失败: {}", e))?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n]).map_err(|e| format!("写入失败: {}", e))?;
        downloaded += n as u64;
        if downloaded - last_emit >= 1024 * 1024 {
            last_emit = downloaded;
            let _ = app.emit(
                "model:download-progress",
                DownloadProgress { file: file.to_string(), downloaded_bytes: downloaded, total_bytes: total },
            );
        }
    }
    {
        let mut st = status.lock().expect("download status lock");
        st.downloaded_bytes = downloaded;
        st.total_bytes = total;
    }
    if total > 0 && downloaded != total {
        return Err(format!("大小不符（期望 {}，实得 {}）", total, downloaded));
    }
    Ok(())
}

/// 置失败状态（附带错误信息）。
fn fail(status: &Arc<Mutex<DownloadStatus>>, error: String) {
    let mut st = status.lock().expect("download status lock");
    st.state = "failed".into();
    st.error = Some(error);
}
