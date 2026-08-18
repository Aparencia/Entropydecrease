//! 熵减桌面应用入口（Tauri 装配层）。
//!
//! @ai-context: 本文件只做模块声明与应用装配（插件注册 / 状态初始化 / command 注册），
//!              不含业务逻辑；业务自底向上分布：types → concat/db → asr/ocr → engine → commands。
//! @ai-context: AppState 在 setup 时初始化：SQLite 数据库 + 常驻引擎池（后台加载 ASR/OCR 模型）。

mod asr;
mod capture;
mod commands;
mod commands_live;
mod commands_session;
mod commands_streaming;
mod concat;
mod db;
mod db_sessions;
mod db_sessions_rows;
mod engine;
mod error;
mod fusion;
mod live_session;
mod live_session_frame;
mod model_downloader;
mod ocr;
mod streaming_asr;
mod subtitle_ocr;
mod types;
mod windows;

use std::path::Path;

use tauri::Manager;

use crate::asr::AsrModels;
use crate::engine::EnginePool;
use crate::live_session::LiveSessionManager;
use crate::model_downloader::ModelDownloader;
use crate::ocr::{OcrModels, OcrParams};
use crate::streaming_asr::StreamingAsrModels;
use commands::AppState;
use db::Db;

/// 由模型根目录构造 ASR 模型路径（约定布局，禁止硬编码绝对路径）。
///
/// @ai-context: 正式版将随安装包捆绑模型（bundle.resources）并在首启复制到该目录，
///              路径约定保持不变即可无缝切换。
fn asr_models(model_dir: &Path) -> AsrModels {
    AsrModels {
        model: model_dir.join("asr/sensevoice/model.int8.onnx").to_string_lossy().into_owned(),
        tokens: model_dir.join("asr/sensevoice/tokens.txt").to_string_lossy().into_owned(),
    }
}

/// 构造流式 ASR 模型路径（ADR-003：models/streaming-zipformer/ 四件套）。
///
/// @ai-context: 2026-08 升级为 2025-06-30 新版中文 zipformer（fp16）——替代 2023-02-20
///              旧双语包（性能与准确性显著提升，用户决策）；文件名与官方仓库
///              csukuangfj/sherpa-onnx-streaming-zipformer-zh-fp16-2025-06-30 一致。
fn streaming_asr_models(model_dir: &Path) -> StreamingAsrModels {
    let dir = model_dir.join("streaming-zipformer");
    StreamingAsrModels {
        encoder: dir.join("encoder.fp16.onnx").to_string_lossy().into_owned(),
        decoder: dir.join("decoder.fp16.onnx").to_string_lossy().into_owned(),
        joiner: dir.join("joiner.fp16.onnx").to_string_lossy().into_owned(),
        tokens: dir.join("tokens.txt").to_string_lossy().into_owned(),
    }
}

/// 构造 OCR 模型标识（oar-ocr 注册名，首次使用从 ModelScope 国内源自动下载缓存）。
fn ocr_models() -> OcrModels {
    OcrModels {
        det: "pp-ocrv6_tiny_det.onnx".to_string(),
        rec: "pp-ocrv6_tiny_rec.onnx".to_string(),
        dict: "ppocrv6_tiny_dict.txt".to_string(),
    }
}

/// 同步随安装包捆绑的模型到数据目录（模型集成方式①）。
///
/// @ai-context: bundle.resources 把 models/ 打进安装包，首启解压到数据目录供引擎加载；
///              开发环境无 resources 目录或 models 为空时自动跳过（走按需下载路径）。
///              已存在的目标文件不覆盖（避免回退用户已更新的新版模型）。
fn sync_bundled_models(app: &tauri::AppHandle, model_dir: &Path) {
    let Ok(resource_dir) = app.path().resource_dir() else { return };
    let bundled_root = resource_dir.join("models");
    if !bundled_root.is_dir() {
        return;
    }
    if let Err(e) = copy_dir_skip_existing(&bundled_root, model_dir) {
        eprintln!("同步捆绑模型失败: {}", e);
    }
}

/// 递归复制目录，跳过已存在的文件。
fn copy_dir_skip_existing(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_skip_existing(&from, &to)?;
        } else if !to.exists() {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("创建数据目录失败: {}", e))?;

            // 模型根目录（ASR 模型由下载/捆绑放入；OCR 模型经 ModelScope 自动缓存）
            let model_dir = data_dir.join("models");
            std::fs::create_dir_all(&model_dir)
                .map_err(|e| format!("创建模型目录失败: {}", e))?;

            // 同步随安装包捆绑的模型（方式①；开发环境缺 resources 时自动跳过）
            sync_bundled_models(app.handle(), &model_dir);

            // SQLite 数据库（本地优先，数据不出本机）
            let db_path = data_dir.join("entropy.db");
            let db = Db::open(&db_path.to_string_lossy())
                .map_err(|e| format!("初始化数据库失败: {}", e))?;

            // 崩溃恢复：上次异常退出残留的 recording 会话标记为 failed（ADR-004）
            let _ = db.mark_interrupted_sessions();

            // 常驻引擎池（后台线程加载模型，不阻塞启动）
            let engines = EnginePool::start(asr_models(&model_dir), ocr_models(), OcrParams::default())
                .map_err(|e| format!("启动引擎池失败: {}", e))?;

            let streaming_models = streaming_asr_models(&model_dir);
            app.manage(AppState {
                db,
                engines,
                streaming_models,
                live_session: LiveSessionManager::new(),
                model_downloader: ModelDownloader::new(),
                app: app.handle().clone(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_windows,
            commands::transcribe_audio,
            commands::recognize_image,
            commands::build_draft,
            commands::save_draft_as_note,
            commands::process_to_note,
            commands::create_note,
            commands::list_notes,
            commands::get_note,
            commands::update_note,
            commands::delete_note,
            commands::search_notes,
            // 会话管理（REQ-010，ADR-004）
            commands_session::create_session,
            commands_session::finish_session,
            commands_session::list_sessions,
            commands_session::get_session_detail,
            commands_session::delete_session,
            commands_session::add_session_segment,
            commands_session::add_session_ocr_block,
            commands_session::session_to_note,
            // 流式 ASR 模型状态（REQ-009，ADR-003）
            commands_streaming::asr_streaming_model_status,
            // 模型自动下载（ADR-003 模型分发）
            commands_streaming::download_streaming_model,
            commands_streaming::model_download_status,
            // 实时会话（M7：REQ-007~012 编排）
            commands_live::start_live_session,
            commands_live::stop_live_session,
            commands_live::live_session_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
