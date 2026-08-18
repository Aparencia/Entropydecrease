//! 结构分析模型清单与下载器（版面/表格/公式模型版，REQ-047/049/050 模型版落地）。
//!
//! @ai-context: 模型文件托管于 ModelScope `greatv/oar-ocr`（与 oar-ocr 内置注册表
//!              同源，本机 TLS 拦截环境已通过现有 OCR 模型验证可达）。
//! @ai-context: 下载走应用层（进度事件 + .part 原子写 + 失败可重试），
//!              与 model_downloader（流式 ASR）同模式但独立状态机——
//!              三类模型可独立下载/独立启用（按需启用）。
//! @ai-context: 装配路径约定：models/structure/<file>（lib.rs 装配，禁止硬编码）。

use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use serde::Serialize;
use tauri::Emitter;

use crate::error::{AppError, Result};

/// ModelScope 下载 URL 模板（与 oar-ocr-core::download 同构）。
const MODELSCOPE_URL: &str =
    "https://www.modelscope.cn/api/v1/models/greatv/oar-ocr/repo?Revision=master&FilePath=";

/// 结构模型类别（按需启用维度）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum StructureModelKind {
    /// 版面分析（pp-doclayout-l，129MB，高精度档）
    Layout,
    /// 表格结构（SLANet v2 + 表格分类）
    Table,
    /// 公式识别（PP-FormulaNet-s 默认；UniMERNet 高精度可选）
    Formula,
}

/// 单个模型文件条目。
#[derive(Debug, Clone, Copy)]
pub struct StructureModelFile {
    pub name: &'static str,
    pub size_mb: u64,
}

/// 三类模型的文件清单（按需下载：只有启用该能力才拉取对应文件）。
pub const LAYOUT_FILES: &[StructureModelFile] = &[
    StructureModelFile { name: "pp-doclayout-l.onnx", size_mb: 129 },
];
pub const TABLE_FILES: &[StructureModelFile] = &[
    StructureModelFile { name: "slanet_plus_v2.onnx", size_mb: 8 },
    StructureModelFile { name: "table_structure_dict_ch.txt", size_mb: 1 },
    StructureModelFile { name: "pp-lcnet_x1_0_table_cls.onnx", size_mb: 7 },
];
/// PP-FormulaNet-s 默认档（231MB）；UniMERNet 高精度档（1.84GB）由用户切换后下载。
pub const FORMULA_FILES: &[StructureModelFile] = &[
    StructureModelFile { name: "pp-formulanet-s.onnx", size_mb: 231 },
    StructureModelFile { name: "pp-formulanet-tokenizer.json", size_mb: 2 },
];
/// UniMERNet 高精度档（用户可选项；切换后下载，代价大需显式确认）。
pub const UNIMERNET_FILES: &[StructureModelFile] = &[
    StructureModelFile { name: "unimernet.onnx", size_mb: 1842 },
    StructureModelFile { name: "unimernet_tokenizer.json", size_mb: 2 },
    StructureModelFile { name: "unimernet_tokenizer_config.json", size_mb: 1 },
];

/// 模型组文件清单（按类别查表）。
pub fn files_for(kind: StructureModelKind, high_accuracy_formula: bool) -> &'static [StructureModelFile] {
    match kind {
        StructureModelKind::Layout => LAYOUT_FILES,
        StructureModelKind::Table => TABLE_FILES,
        StructureModelKind::Formula => {
            if high_accuracy_formula { UNIMERNET_FILES } else { FORMULA_FILES }
        }
    }
}

/// 单类模型下载状态。
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StructureDownloadStatus {
    pub kind: StructureModelKind,
    /// idle | downloading | done | failed
    pub state: String,
    pub current_file: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub error: Option<String>,
}

/// 结构模型下载器（AppState 持有；三类模型各自独立状态机，可并行/独立下载）。
pub struct StructureModelDownloader {
    statuses: Arc<Mutex<std::collections::HashMap<StructureModelKind, StructureDownloadStatus>>>,
    running: Arc<Mutex<std::collections::HashSet<StructureModelKind>>>,
    threads: Arc<Mutex<std::collections::HashMap<StructureModelKind, JoinHandle<()>>>>,
}

impl Default for StructureModelDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for StructureModelDownloader {
    fn clone(&self) -> Self {
        Self {
            statuses: self.statuses.clone(),
            running: self.running.clone(),
            threads: self.threads.clone(),
        }
    }
}

impl StructureModelDownloader {
    pub fn new() -> Self {
        Self {
            statuses: Arc::new(Mutex::new(std::collections::HashMap::new())),
            running: Arc::new(Mutex::new(std::collections::HashSet::new())),
            threads: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    /// 启动某类模型下载（该类别已在下载中则拒绝；成功返回下载文件数）。
    ///
    /// @param dir - 装配目标目录（models/structure，由 lib.rs 提供）
    /// @param high_accuracy_formula - 公式档位（true=UniMERNet 高精度档）
    pub fn start(
        &self,
        kind: StructureModelKind,
        dir: std::path::PathBuf,
        high_accuracy_formula: bool,
        app: tauri::AppHandle,
    ) -> Result<usize> {
        {
            let mut running = self.running.lock().expect("structure dl running lock");
            if running.contains(&kind) {
                return Err(AppError::Io(format!("{:?} 模型下载已在进行中", kind)));
            }
            running.insert(kind);
        }
        let files = files_for(kind, high_accuracy_formula);
        {
            let mut statuses = self.statuses.lock().expect("structure dl status lock");
            statuses.insert(
                kind,
                StructureDownloadStatus {
                    kind,
                    state: "downloading".into(),
                    current_file: None,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    error: None,
                },
            );
        }
        let statuses = self.statuses.clone();
        let running_set = self.running.clone();
        let handle = std::thread::Builder::new()
            .name("entropy-structure-download".into())
            .spawn(move || {
                download_group(kind, files, dir, app, statuses, running_set);
            })
            .map_err(|e| AppError::Io(format!("启动结构模型下载线程失败: {}", e)))?;
        self.threads.lock().expect("structure dl threads lock").insert(kind, handle);
        Ok(files.len())
    }

    /// 某类模型状态（无记录 → idle；设置面板查询用，暂由测试覆盖，登记豁免）。
    #[allow(dead_code)]
    pub fn status(&self, kind: StructureModelKind) -> StructureDownloadStatus {
        self.statuses
            .lock()
            .expect("structure dl status lock")
            .get(&kind)
            .cloned()
            .unwrap_or(StructureDownloadStatus {
                kind,
                state: "idle".into(),
                current_file: None,
                downloaded_bytes: 0,
                total_bytes: 0,
                error: None,
            })
    }

    /// 全部三类状态（前端设置面板）。
    pub fn all_statuses(&self) -> Vec<StructureDownloadStatus> {
        let guard = self.statuses.lock().expect("structure dl status lock");
        [
            StructureModelKind::Layout,
            StructureModelKind::Table,
            StructureModelKind::Formula,
        ]
        .iter()
        .map(|k| {
            guard
                .get(k)
                .cloned()
                .unwrap_or(StructureDownloadStatus {
                    kind: *k,
                    state: "idle".into(),
                    current_file: None,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    error: None,
                })
        })
        .collect()
    }
}

/// 下载一组模型文件（.part 原子写 + 进度事件；任一失败记录 error 停止）。
fn download_group(
    kind: StructureModelKind,
    files: &[StructureModelFile],
    dir: std::path::PathBuf,
    app: tauri::AppHandle,
    statuses: Arc<Mutex<std::collections::HashMap<StructureModelKind, StructureDownloadStatus>>>,
    running: Arc<Mutex<std::collections::HashSet<StructureModelKind>>>,
) {
    let _ = std::fs::create_dir_all(&dir);
    let mut failed: Option<String> = None;
    for file in files {
        let target = dir.join(file.name);
        if target.exists() && target.metadata().map(|m| m.len() > 0).unwrap_or(false) {
            continue; // 已就绪跳过（断点续传语义：已落盘文件不重下）
        }
        let url = format!("{}{}", MODELSCOPE_URL, file.name);
        let part = dir.join(format!("{}.part", file.name));
        {
            let mut st = statuses.lock().expect("structure dl status lock");
            if let Some(s) = st.get_mut(&kind) {
                s.current_file = Some(file.name.to_string());
                s.downloaded_bytes = 0;
                s.total_bytes = file.size_mb * 1024 * 1024;
            }
        }
        match download_one(&url, &part, file.name, &app, &kind, &statuses) {
            Ok(()) => {
                if let Err(e) = std::fs::rename(&part, &target) {
                    failed = Some(format!("{} 落盘失败: {}", file.name, e));
                    break;
                }
            }
            Err(e) => {
                let _ = std::fs::remove_file(&part);
                failed = Some(format!("{} 下载失败: {}", file.name, e));
                break;
            }
        }
    }
    {
        let mut st = statuses.lock().expect("structure dl status lock");
        if let Some(s) = st.get_mut(&kind) {
            match failed {
                Some(e) => {
                    s.state = "failed".into();
                    s.error = Some(e.clone());
                    let _ = app.emit("structure-model:download-failed", (kind, e));
                }
                None => {
                    s.state = "done".into();
                    s.current_file = None;
                    let _ = app.emit("structure-model:download-done", kind);
                }
            }
        }
    }
    running.lock().expect("structure dl running lock").remove(&kind);
}

/// 下载单个文件（流式，每 1MB 推送进度；30 分钟超时防挂起）。
fn download_one(
    url: &str,
    part: &std::path::Path,
    file: &str,
    app: &tauri::AppHandle,
    kind: &StructureModelKind,
    statuses: &Arc<Mutex<std::collections::HashMap<StructureModelKind, StructureDownloadStatus>>>,
) -> std::result::Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(30 * 60))
        .build();
    let resp = agent.get(url).call().map_err(|e| format!("请求失败: {}", e))?;
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
                "structure-model:download-progress",
                crate::model_downloader::DownloadProgress {
                    file: file.to_string(),
                    downloaded_bytes: downloaded,
                    total_bytes: 0,
                },
            );
            if let Ok(mut st) = statuses.lock() {
                if let Some(s) = st.get_mut(kind) {
                    s.downloaded_bytes = downloaded;
                }
            }
        }
    }
    Ok(())
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "structure_models_tests.rs"]
mod tests;
