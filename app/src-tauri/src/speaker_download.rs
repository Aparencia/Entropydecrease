//! 说话人模型下载器（TD-2026-08-20-D 清偿 / G1：wespeaker 应用内一键下载）。
//!
//! @ai-context: 对照 structure_models 模式（ureq + .part 原子写 + 1MB 进度事件 +
//!              Content-Length 比对防截断）；单文件（model.onnx，20-70MB）双镜像
//!              回退（GitHub release + hf-mirror，与 download-speaker-model.ps1
//!              同源）；目标 models/speaker-embedding/model.onnx（speaker_engine
//!              路径约定）。网络路径不单测（与 model_downloader 同口径）。

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use serde::Serialize;
use tauri::Emitter;

use crate::error::{AppError, Result};

/// 下载镜像源（与 scripts/download-speaker-model.ps1 同源；多源回退防单点失效）。
///
/// 上游文件名为 wespeaker_zh_cnceleb_resnet34.onnx（wespeaker 中文 CN-Celeb 模型，
/// 约 26.5MB；曾误用不存在的 wespeaker-zh.onnx 导致双镜像 404）：
/// 1) GitHub release（sherpa-onnx 官方分发，speaker-recongition-models 为官方 tag 名）
/// 2) HuggingFace 镜像（csukuangfj/speaker-embedding-models，注意非 sherpa-onnx-speaker-embedding）
const MIRRORS: &[&str] = &[
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_zh_cnceleb_resnet34.onnx",
    "https://hf-mirror.com/csukuangfj/speaker-embedding-models/resolve/main/wespeaker_zh_cnceleb_resnet34.onnx",
];
/// 下载超时（30 分钟；同 structure_models 口径）。
const DOWNLOAD_TIMEOUT_SECS: u64 = 30 * 60;

/// 下载状态（前端进度展示；camelCase 契约）。
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerDownloadStatus {
    /// idle | downloading | done | failed
    pub state: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub error: Option<String>,
}

impl Default for SpeakerDownloadStatus {
    fn default() -> Self {
        Self { state: "idle".into(), downloaded_bytes: 0, total_bytes: 0, error: None }
    }
}

/// 模型已就绪判定（纯函数）：目标文件存在且非空。
/// @ai-context: pub 供单测（start 内短路与命令层共用；测试不依赖网络/运行时）。
pub fn already_downloaded(dir: &std::path::Path) -> bool {
    dir.join("model.onnx").metadata().is_ok_and(|m| m.len() > 0)
}

/// 说话人模型下载器（AppState 持有；单文件状态机 + 防并发）。
#[derive(Clone)]
pub struct SpeakerModelDownloader {
    status: Arc<Mutex<SpeakerDownloadStatus>>,
    running: Arc<AtomicBool>,
    /// 线程句柄持有（进程生命周期内完成即弃；join 非必需——状态即完成信号）
    _threads: Arc<Mutex<Vec<JoinHandle<()>>>>,
}

impl Default for SpeakerModelDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl SpeakerModelDownloader {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(SpeakerDownloadStatus::default())),
            running: Arc::new(AtomicBool::new(false)),
            _threads: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// 启动下载（已在下载中 → 拒绝；模型已存在 → done 直接返回）。
    ///
    /// @param dir - 装配目标目录（models/speaker-embedding，命令层提供）
    pub fn start(&self, dir: std::path::PathBuf, app: tauri::AppHandle) -> Result<()> {
        // 防并发（structure_models 审查 M2 教训：启动标记必须可复位）
        if self.running.swap(true, Ordering::SeqCst) {
            return Err(AppError::Io("说话人模型下载已在进行中".to_string()));
        }
        if already_downloaded(&dir) {
            self.running.store(false, Ordering::SeqCst);
            {
                let mut st = self.status.lock().expect("speaker dl status lock");
                *st = SpeakerDownloadStatus { state: "done".into(), ..Default::default() };
            }
            return Ok(());
        }
        {
            let mut st = self.status.lock().expect("speaker dl status lock");
            *st = SpeakerDownloadStatus { state: "downloading".into(), ..Default::default() };
        }
        let status = self.status.clone();
        let running = self.running.clone();
        let threads = self._threads.clone();
        let handle = std::thread::Builder::new()
            .name("entropy-speaker-download".into())
            .spawn(move || download_impl(dir, app, status, running))
            .map_err(|e| {
                // spawn 失败必须复位 running（防永久"下载中"）
                self.running.store(false, Ordering::SeqCst);
                AppError::Io(format!("启动说话人模型下载线程失败: {}", e))
            })?;
        threads.lock().expect("speaker dl threads lock").push(handle);
        Ok(())
    }

    /// 当前状态（无记录 → idle）。
    pub fn status(&self) -> SpeakerDownloadStatus {
        self.status.lock().expect("speaker dl status lock").clone()
    }
}

/// 下载实现（后台线程）：双镜像回退 → .part 原子写 → 进度事件 → 落盘校验。
fn download_impl(
    dir: std::path::PathBuf,
    app: tauri::AppHandle,
    status: Arc<Mutex<SpeakerDownloadStatus>>,
    running: Arc<AtomicBool>,
) {
    let _ = std::fs::create_dir_all(&dir);
    let target = dir.join("model.onnx");
    let part = dir.join("model.onnx.part");
    let result = (|| -> std::result::Result<(), String> {
        let mut last_err: Option<String> = None;
        for url in MIRRORS {
            match download_one(url, &part, &app, &status) {
                Ok(()) => {
                    std::fs::rename(&part, &target)
                        .map_err(|e| format!("模型落盘失败: {}", e))?;
                    return Ok(());
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&part);
                    last_err = Some(format!("{}（{}）", e, url));
                }
            }
        }
        Err(last_err.unwrap_or_else(|| "无可用镜像".to_string()))
    })();
    {
        let mut st = status.lock().expect("speaker dl status lock");
        match result {
            Ok(()) => {
                *st = SpeakerDownloadStatus { state: "done".into(), ..Default::default() };
                let _ = app.emit("speaker-model:download-done", ());
            }
            Err(e) => {
                *st = SpeakerDownloadStatus {
                    state: "failed".into(),
                    error: Some(e.clone()),
                    ..Default::default()
                };
                let _ = app.emit("speaker-model:download-failed", e);
            }
        }
    }
    running.store(false, Ordering::SeqCst);
}

/// 下载单文件（流式，每 1MB 推送进度；Content-Length 比对防截断——structure_models 同款）。
fn download_one(
    url: &str,
    part: &std::path::Path,
    app: &tauri::AppHandle,
    status: &Arc<Mutex<SpeakerDownloadStatus>>,
) -> std::result::Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(DOWNLOAD_TIMEOUT_SECS))
        .build();
    let resp = agent.get(url).call().map_err(|e| format!("请求失败: {}", e))?;
    let total = resp
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
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
                "speaker-model:download-progress",
                crate::model_downloader::DownloadProgress {
                    file: "wespeaker_zh_cnceleb_resnet34.onnx".to_string(),
                    downloaded_bytes: downloaded,
                    total_bytes: total,
                },
            );
            if let Ok(mut st) = status.lock() {
                st.downloaded_bytes = downloaded;
                st.total_bytes = total;
            }
        }
    }
    if total > 0 && downloaded != total {
        return Err(format!("大小不符（期望 {}，实得 {}）", total, downloaded));
    }
    Ok(())
}

#[cfg(test)]
#[path = "speaker_download_tests.rs"]
mod tests;
