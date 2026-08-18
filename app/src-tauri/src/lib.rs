//! 熵减桌面应用入口（Tauri 装配层）。
//!
//! @ai-context: 本文件只做模块声明与应用装配（插件注册 / 状态初始化 / command 注册），
//!              不含业务逻辑；业务自底向上分布：types → concat/db → asr/ocr → engine → commands。
//! @ai-context: AppState 在 setup 时初始化：SQLite 数据库 + 常驻引擎池（后台加载 ASR/OCR 模型）。

mod asr;
mod asr_health;
mod analysis;
mod audio_preprocess;
mod capture;
mod chapter_detect;
mod commands;
// 实时会话链路依赖 Windows 捕获 API（WASAPI/DXGI/COM），非 Windows 平台不编译（TD-027 修复）
#[cfg(target_os = "windows")]
mod commands_live;
mod commands_analysis;
mod commands_device;
mod commands_diag;
mod commands_import;
mod commands_session;
mod commands_streaming;
mod commands_vocab;
mod commands_video;
mod concat;
mod db;
mod db_sessions;
mod db_sessions_rows;
mod device_config;
// GPU 适配器探测依赖 DXGI（Windows）；决策纯逻辑在 device_config（全平台）
#[cfg(target_os = "windows")]
mod device_probe;
mod engine;
mod error;
mod ffmpeg;
mod frame_features;
mod fusion;
mod glossary;
mod health_check;
mod highlight_detect;
mod import;
mod import_frame;
mod layout_analyzer;
mod layout_cache;
#[cfg(target_os = "windows")]
mod live_session;
#[cfg(target_os = "windows")]
mod live_session_frame;
mod load_monitor;
mod model_downloader;
mod ocr;
mod ocr_cache;
mod playback_region;
mod region_tracker;
mod streaming_asr;
mod subtitle;
mod subtitle_detect;
mod subtitle_ocr;
mod speaker_change;
mod types;
mod verbal_normalize;
mod video_profile;
mod video_profile_data;
mod vocab;
mod windows;

// 临时诊断模块（定位实时链路无 OCR 根因；诊断后删除）
#[cfg(all(test, target_os = "windows"))]
#[path = "live_pipeline_diag.rs"]
mod live_pipeline_diag;

use std::path::Path;

use tauri::{Emitter, Manager, WindowEvent};

use crate::asr::AsrModels;
use crate::device_config::{decide, OcrDeviceConfig, OcrDeviceStatus};
use crate::engine::EnginePool;
#[cfg(target_os = "windows")]
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

/// 把 ORT 运行时目录加入 DLL 搜索路径（ADR-009：CUDA 运行时含 cudart/cublas/cudnn
/// 等数十个 DLL，不复制进 target；AddDllDirectory 让 onnxruntime.dll 按需找到它们）。
///
/// @ai-context: 必须在引擎线程首次加载 onnxruntime.dll 之前调用（setup 最早期）；
///              失败仅告警——CPU-only 运行时无需额外 DLL，不阻断启动。
/// @ai-context: SetDefaultDllDirectories(DEFAULT_DIRS) 是 AddDllDirectory 生效的前提；
///              搜索序 = 应用目录（build.rs 已复制 onnxruntime.dll，压过 system32 旧版）
///              + 系统目录 + 本目录。
fn ensure_ort_runtime_search_dir() {
    let Ok(lib_dir) = std::env::var("ORT_LIB_LOCATION") else { return };
    let path = Path::new(&lib_dir);
    if !path.join("onnxruntime.dll").exists() {
        return;
    }
    unsafe {
        // 注意：本 crate 存在本地 `mod windows`（窗口枚举模块），
        // 外部 windows crate 必须以 ::windows:: 全路径引用（遮蔽问题）
        use ::windows::Win32::System::LibraryLoader::{
            AddDllDirectory, SetDefaultDllDirectories, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
        };
        let _ = SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        let wide = ::windows::core::HSTRING::from(path.to_string_lossy().as_ref());
        // AddDllDirectory 返回句柄（null=失败，windows 0.61 无 Result 包装）
        if AddDllDirectory(::windows::core::PCWSTR(wide.as_ptr())).is_null() {
            eprintln!(
                "[Setup] AddDllDirectory 失败: {}（CUDA 运行时 DLL 可能无法加载）",
                path.display()
            );
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ADR-009：引擎线程加载 ORT 之前注入运行时目录（CUDA 多 DLL 依赖）
            ensure_ort_runtime_search_dir();
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
            // 日志可观测：用户反馈会话"异常中断"时据此判断是否来自重启打断
            let interrupted = db.mark_interrupted_sessions()?;
            if interrupted > 0 {
                eprintln!("[Db] 启动恢复：{} 个中断会话标记为 failed", interrupted);
            }

            // 常驻引擎池（后台线程加载模型，不阻塞启动）
            // ADR-009（v0.4.0 M1）：OCR 推理后端启动期决策——
            // 三层检测：DXGI 硬件门槛（select_best）→ decide 折叠模式/校准 → ORT 原生回退（引擎内）
            let ocr_device_config_path = data_dir.join("ocr_device.json");
            // TD-044 同批修复：配置内存态单点（命令层锁内 read-modify-write，防 TOCTOU）
            let ocr_device_config = std::sync::Arc::new(std::sync::Mutex::new(
                OcrDeviceConfig::load(&ocr_device_config_path),
            ));
            #[cfg(target_os = "windows")]
            let adapters = crate::device_probe::probe_adapters();
            #[cfg(not(target_os = "windows"))]
            let adapters = Vec::new();
            let best_device = crate::device_probe::select_best(&adapters);
            let nvidia_count = crate::device_probe::nvidia_candidate_count(&adapters);
            let ocr_cfg_snapshot = ocr_device_config
                .lock()
                .map(|c| c.clone())
                .unwrap_or_default();
            let ocr_backend = decide(
                ocr_cfg_snapshot.mode,
                best_device,
                nvidia_count,
                ocr_cfg_snapshot.bench,
            );
            eprintln!(
                "[Engine] OCR 设备决策: 模式 {:?} → 后端 {:?}{}",
                ocr_cfg_snapshot.mode,
                ocr_backend,
                best_device
                    .map(|id| format!("（候选设备 index={}，NVIDIA 候选数 {}）", id, nvidia_count))
                    .unwrap_or_else(|| format!("（无候选，NVIDIA 候选数 {}）", nvidia_count))
            );
            let ocr_device_status = std::sync::Arc::new(std::sync::Mutex::new(OcrDeviceStatus::new(
                ocr_cfg_snapshot.mode,
                ocr_backend,
                ocr_cfg_snapshot.bench,
            )));
            let ocr_models = ocr_models();
            let ocr_params = OcrParams::default();
            // M5/REQ-040：共享词表（热词注入 ASR 流、替换词纠错 OCR；JSON 持久化）
            let vocab_path = data_dir.join("vocab.json");
            let vocab = std::sync::Arc::new(std::sync::Mutex::new(crate::vocab::VocabStore::load(
                &vocab_path,
            )));
            // v0.5.0 M1（REQ-043）：档案记忆偏好（混合检测的用户确认记忆；JSON 持久化）
            let profile_memory_path = data_dir.join("video_profile_memory.json");
            let profile_memory = std::sync::Arc::new(std::sync::Mutex::new(
                crate::video_profile::ProfileMemory::load(&profile_memory_path),
            ));
            let engines = EnginePool::start(
                asr_models(&model_dir),
                ocr_models.clone(),
                ocr_params.clone(),
                ocr_backend,
                ocr_device_status,
                Some(vocab.clone()),
            )
            .map_err(|e| format!("启动引擎池失败: {}", e))?;

            let streaming_models = streaming_asr_models(&model_dir);
            app.manage(AppState {
                db,
                engines,
                streaming_models,
                #[cfg(target_os = "windows")]
                live_session: LiveSessionManager::new(),
                model_downloader: ModelDownloader::new(),
                app: app.handle().clone(),
                ocr_device_config_path,
                ocr_device_config,
                ocr_models,
                ocr_params,
                vocab,
                vocab_path,
                model_dir,
                profile_memory_path,
                profile_memory,
            });
            Ok(())
        })
        // ADR-007：采集进行时拦截窗口关闭——prevent_close + 通知前端弹确认框；
        // 用户确认后前端先 stop_live_session 再 close（届时无活动会话，放行）
        .on_window_event(|window, event| {
            // 非 Windows 平台不编译实时链路，消除未使用变量警告
            #[cfg(not(target_os = "windows"))]
            let _ = (window, event);
            #[cfg(target_os = "windows")]
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.live_session.active_session_id().is_some() {
                    api.prevent_close();
                    let _ = window.emit("app:close-requested", ());
                }
            }
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
            // 实时会话（M7：REQ-007~012 编排；Windows-only）
            #[cfg(target_os = "windows")]
            commands_live::start_live_session,
            #[cfg(target_os = "windows")]
            commands_live::stop_live_session,
            #[cfg(target_os = "windows")]
            commands_live::live_session_status,
            // 视频文件导入（REQ-015，ADR-008：字幕优先 + ASR fallback + 关键帧 OCR）
            commands_import::import_video,
            // OCR 设备状态（REQ-036，ADR-009：GPU 卸载决策/回退可观测）
            commands_device::ocr_device_status,
            commands_device::ocr_device_set_mode,
            commands_device::ocr_device_recalibrate,
            // 词表管理（REQ-040，M5：热词/替换词闭环 + 课件预热）
            commands_vocab::vocab_get,
            commands_vocab::vocab_add_hotwords,
            commands_vocab::vocab_remove_hotword,
            commands_vocab::vocab_add_replacement,
            commands_vocab::vocab_remove_replacement,
            commands_vocab::vocab_extract_courseware,
            commands_vocab::vocab_suggest_from_ocr,
            // 视频类型档案（REQ-043，v0.5.0 M1：混合检测 + 记忆偏好 + 档案导出）
            commands_video::video_profiles,
            commands_video::detect_video_profile,
            commands_video::remember_video_profile,
            commands_video::video_profile_memory,
            commands_video::video_profile_by_kind,
            // 会话结构化分析（REQ-044/045/046，v0.5.0 M2：章节/重点/术语/讲者）
            commands_analysis::analyze_session_command,
            // 健康巡检与诊断（REQ-042，M7：F2/F3/G2）
            commands_diag::health_status,
            commands_diag::diag_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
