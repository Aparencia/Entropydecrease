//! 熵减桌面应用入口（Tauri 装配层）。
//!
//! @ai-context: 本文件只做模块声明与应用装配（插件注册 / 状态初始化 / command 注册），
//!              不含业务逻辑；业务自底向上分布：types → concat/db → asr/ocr → engine → commands。
//! @ai-context: AppState 在 setup 时初始化：SQLite 数据库 + 常驻引擎池（后台加载 ASR/OCR 模型）。

mod ai_guardrails;
mod ai_judge;
mod ai_mock;
mod ai_protocol;
mod ai_text_filter;
mod asr;
mod asr_clean;
mod asr_dedupe;
mod asr_health;
mod asr_merge;
mod asr_rescore;
mod analysis;
mod artifact;
mod artifact_templates;
mod audio_event_filter;
// pub：bin/cer_bench.rs（REQ-101 CER 微基准工具）引用 AudioPreprocessor
// （审查 H1 修复：私有模块使 bin 无法编译，完整 cargo test 失败）
pub mod audio_preprocess;
// v0.7.0 M1（REQ-101）：音频预处理链持久化配置（CER 微基准定默认后的用户开关）
mod audio_preproc_config;
// v0.7.0 M2（REQ-126）：分应用音频路由探针（WASAPI 会话级 API 面 spike）
mod audio_route_probe;
mod audio_store;
// v0.7.0 M1（REQ-107，TRUST-1）：数据备份/恢复（SQLite+图+音频 zip 打包/解压）
mod backup;
mod capture;
// v0.7.0 M1（REQ-101）：CER 计算（预处理链默认值定标的微基准依据）
// pub：bin/cer_bench.rs 引用（审查 H1 修复，同 audio_preprocess）
pub mod cer;
mod chapter_detect;
// v0.7.0 M1（REQ-104/132）：剪贴板信号（文本信号 + 图片直贴；内存态，arboard 轮询）
mod clipboard_signal;
mod commands;
// 实时会话链路依赖 Windows 捕获 API（WASAPI/DXGI/COM），非 Windows 平台不编译（TD-027 修复）
#[cfg(target_os = "windows")]
mod commands_live;
mod commands_ai;
mod commands_analysis;
mod commands_artifacts;
mod commands_audio;
// v0.7.0 M1（REQ-107，TRUST-1）：备份/恢复 command（数据目录 zip 打包/解压）
mod commands_backup;
mod commands_device;
mod commands_diag;
mod commands_images;
mod commands_import;
mod commands_refine;
mod commands_refine_inner;
mod commands_session;
mod commands_streaming;
mod commands_vocab;
mod commands_video;
mod concat;
mod db;
mod db_artifacts;
// v0.7.0 M1.5（REQ-108）：会话信号事件数据层（统一信号事件表读写）
mod db_session_events;
mod db_sessions;
// v0.7.0 M3（REQ-133）：图内文字检索（OCR 块视图）
mod db_ocr_search;
mod db_sessions_rows;
mod device_config;
// v0.6.0 M2（REQ-063）：DTW 时序对齐（spike 机制先行，真机校准待 M4 落盘）
mod dtw_align;
// GPU 适配器探测依赖 DXGI（Windows）；决策纯逻辑在 device_config（全平台）
#[cfg(target_os = "windows")]
mod device_probe;
mod engine;
mod error;
mod ffmpeg;
// v0.7.0 M2（REQ-123）：跟练档案步骤边界检测（口令/练习段/示范跟练交替三信号）
mod follow_along_detect;
mod formula_reconstruct;
mod frame_cluster;
mod frame_features;
// v0.7.0 M2（REQ-128）：前台时间线（前台切换事件落库 + 实践段标记）
mod foreground_timeline;
mod fusion;
mod glossary;
mod health_check;
mod highlight_detect;
mod idle_governor;
// v0.7.0 M3（REQ-088）：关键图图注生成（本地规则，影子层）
mod image_caption;
// v0.7.0 M3（REQ-134）：图片内容裁剪/去白边（纯函数）
mod image_crop;
mod image_store;
// v0.7.0 M1.5（REQ-110）：图像流存储层（时间轴帧序列——图像优先档）
mod image_stream_store;
mod import;
// v0.7.0 M2（REQ-127）：抢话/打断检测（代理信号版——不依赖讲者识别）
mod interruption_detect;
mod import_frame;
// v0.7.0 M2（REQ-113）：导入音轨转写（import.rs 拆出——重叠窗合并转写）
mod import_transcribe;
mod layout_analyzer;
mod layout_cache;
#[cfg(target_os = "windows")]
mod live_session;
// v0.7.0 M0 X-O5：live_session.rs 798 行超限硬拆——音频主循环/定稿落库/融合线程
#[cfg(target_os = "windows")]
mod live_session_loop;
#[cfg(target_os = "windows")]
mod live_session_persist;
#[cfg(target_os = "windows")]
mod live_session_fusion;
// ADR-011 拆分：帧处理（网格差异触发/字幕 OCR/面板抑制）独立模块
#[cfg(target_os = "windows")]
mod live_frame_process;
#[cfg(target_os = "windows")]
mod live_session_frame;
// P3：引擎预热（预备线程——选窗口阶段后台加载，start 交接）
#[cfg(target_os = "windows")]
mod live_session_prepare;
#[cfg(target_os = "windows")]
mod live_keyframes;
mod load_monitor;
// v0.7.0 M1（REQ-106，TRUST-4）：诊断日志脱敏（OCR 文本/会话标题等敏感内容过滤）
mod log_redact;
mod model_downloader;
// v0.7.0 M3（REQ-131）：模型版本管理与磁盘占用（可查可回退）
mod model_registry;
mod note_filter;
mod note_filter_ai;
mod note_filter_discourse;
mod novelty;
mod ocr;
mod ocr_correction;
// v0.7.0 M2（REQ-120）：OCR 错误模式校准表（混淆画像 → 替换词候选）
mod ocr_confusion;
mod ocr_cache;
mod outline;
mod playback_region;
// v0.7.0 M2（REQ-125）：播放器行为信号（暂停检测 + M17 倍速缩放采样）
mod player_behavior;
mod practice_detect;
mod quality_report;
mod purify_config;
mod refine;
mod region_ocr;
mod region_tracker;
mod streaming_asr;
mod structure_engine;
mod structure_models;
mod structure_tier;
// v0.7.6（REQ-177/178）：笔记结构渲染层——章节标题 + 词汇表块（纯函数）
mod structure_note;
mod stutter_fold;
mod subtitle;
mod subtitle_detect;
mod subtitle_ocr;
mod speaker_change;
// v0.7.2（REQ-152）：视频系列（合集）检测——标题序列号提取/平台后缀剥离（纯逻辑）
mod series_detect;
// v0.7.2（REQ-151）：会话信息聚合——采集信息面板数据源（平台/时长/合集/字幕）
mod screen_merge;
mod screens;
mod screen_tracker;
mod session_info;
// v0.7.2（REQ-153）：说话人 embedding 引擎（弱化版讲者分离离线分析）
mod speaker_engine;
mod commands_speaker;
// v0.7.0 M1.5（REQ-108）：统一信号事件域（类型/分级/容量守卫；数据层在 db_session_events）
mod session_events;
mod symbol_normalize;
mod table_reconstruct;
mod types;
mod ui_junk;
mod vad_adaptive;
// v0.7.0 M2（REQ-115）：VAD 阈值共享槽（会话线程发布、诊断面板读取）
mod vad_threshold_slot;
mod verbal_normalize;
mod video_profile;
mod video_profile_data;
mod vocab;
mod watermark_filter;
// v0.7.0 窗口过滤增强：站点首页判定/可捕获性纯逻辑（2026-08 用户需求）
mod window_filter;
mod windows;

// 临时诊断模块（定位实时链路无 OCR 根因；诊断后删除）
#[cfg(all(test, target_os = "windows"))]
#[path = "live_pipeline_diag.rs"]
mod live_pipeline_diag;

// v0.7.5（line-limit-exemptions 登记计划）：setup 装配块拆至 app_setup.rs——
// lib.rs 只保留声明与 command 注册（>600 行硬拆落地）
mod app_setup;

use tauri::{Emitter, Manager, WindowEvent};

use commands::AppState;

/// 构造标点恢复模型路径（ADR-012 F4-2：models/punctuation/；缺失 → None 降级）。
///
/// @ai-context: 与 download-punctuation.mjs 的目录约定一致；模型缺失时引擎
///              零开销降级（无标点，现状行为），不阻断 ASR。
/// @ai-context: crate 根级共享（commands_live.rs 实时会话装配引用——非 setup
///              专用，故留在 lib.rs 而非 app_setup.rs）。
fn punctuation_model(model_dir: &std::path::Path) -> Option<String> {
    let p = model_dir.join("punctuation/model.int8.onnx");
    p.exists().then(|| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // AppState 装配（数据目录/DB/引擎池/可校准配置——拆至 app_setup.rs，
            // line-limit-exemptions 登记计划：lib.rs >600 硬拆落地）
            crate::app_setup::setup_app_state(app).map_err(Into::into)
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
            // 批量转笔记（v0.7.1 会话体验：列表勾选批量转化）
            commands_session::batch_session_to_note,
            // 笔记预览（REQ-081，v0.6.0 M1：过滤后只读预览——单一管线双出口）
            commands_session::preview_session_note,
            // 会话体验（REQ-076/077/078/079，v0.6.0 M6：质量报告/大纲/课程分组/段搜索）
            commands_session::session_quality_report,
            commands_session::session_outline,
            commands_session::list_session_courses,
            commands_session::search_session_segments,
            // 图内文字检索（REQ-133，v0.7.0 M3：OCR 块视图——搜 PPT 上的词命中图）
            commands_session::search_ocr_blocks,
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
            // v0.7.2（REQ-151）：采集信息面板拉取兜底（live:session-info 事件
            // 可能早于面板挂载——挂载时 invoke 拉取 + 事件增量双通道）
            #[cfg(target_os = "windows")]
            commands_live::live_session_info,
            // 2026-08 A1：会话暂停/继续（硬暂停——完全停采，时间轴冻结）
            #[cfg(target_os = "windows")]
            commands_live::pause_live_session,
            #[cfg(target_os = "windows")]
            commands_live::resume_live_session,
            // P3：引擎预热（选窗口阶段后台加载，开始即录）/ 释放
            #[cfg(target_os = "windows")]
            commands_live::prepare_live_session,
            #[cfg(target_os = "windows")]
            commands_live::release_live_prepare,
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
            // 说话人分离（REQ-153，v0.7.2：弱化版讲者切换离线分析——幂等懒加载）
            commands_speaker::analyze_session_speakers,
            // 健康巡检与诊断（REQ-042，M7：F2/F3/G2）
            commands_diag::health_status,
            commands_diag::diag_snapshot,
            // REQ-115（v0.7.0 M2）：VAD 阈值诊断（口径对照可查）
            commands_diag::vad_threshold_diag,
            // 模型磁盘占用/版本（REQ-131，v0.7.0 M3）
            commands_diag::model_disk_overview,
            // 会话图片配套（REQ-051，v0.5.0 M6：图集/走廊/删除）
            commands_images::list_session_images,
            commands_images::delete_session_image,
            commands_images::delete_session_images_all,
            commands_images::save_user_screenshot,
            commands_images::session_images_base_url,
            // 会话音频落盘（REQ-068，v0.6.0 M4：状态/清理——M6 清理 UI 消费）
            commands_audio::session_audio_status,
            commands_audio::session_audio_cleanup,
            // 音频预处理链（REQ-101，v0.7.0 M1：CER 微基准定默认后的用户开关）
            commands_audio::audio_preproc_status,
            commands_audio::audio_preproc_set,
            // 数据备份/恢复（REQ-107，v0.7.0 M1：TRUST-1——备份/恢复入口）
            commands_backup::backup_create,
            commands_backup::backup_restore,
            // 会话产物（REQ-052/053，v0.5.0 M7：模板构建/读取/落笔记）
            commands_artifacts::build_session_artifact,
            commands_artifacts::get_session_artifact,
            commands_artifacts::artifact_to_note,
            // 补缝式 AI 前置（REQ-055，v0.5.0 M8：判定器/协议/mock/护栏骨架）
            commands_ai::scan_ai_candidates,
            commands_ai::ai_enhance_mock,
            commands_ai::ai_enhance_status,
            // 笔记 AI 复核（REQ-085，v0.6.0 M1：边界段三态判定——授权默认关）
            commands_ai::review_text_filter,
            commands_ai::text_filter_status,
            // 结构模型与课后精修（REQ-047/049/050 模型版：下载/状态/精修）
            commands_refine::structure_model_download,
            commands_refine::structure_model_status,
            commands_refine::structure_models_dir_cmd,
            commands_refine::structure_formula_tier,
            commands_refine::refine_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
