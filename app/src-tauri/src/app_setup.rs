//! Tauri setup 装配（line-limit-exemptions.md 登记计划落地：lib.rs >600 行硬拆）。
//!
//! @ai-context: 本模块承载 setup 的 AppState 初始化（数据目录/DB/引擎池/可校准
//!              配置/内存态存储）与装配期辅助函数（模型路径构造/捆绑同步/ORT
//!              运行时目录注入）——lib.rs 只保留声明与 command 注册，职责单一。
//! @ai-context: 无业务逻辑（业务自底向上分布：types → concat/db → asr/ocr →
//!              engine → commands）；全部装配失败均显式返回错误串，不静默。

use std::path::Path;

use tauri::Manager;

use crate::asr::AsrModels;
use crate::commands::AppState;
use crate::db::Db;
use crate::device_config::{decide, OcrDeviceConfig, OcrDeviceStatus};
use crate::engine::EnginePool;
#[cfg(target_os = "windows")]
use crate::live_session::LiveSessionManager;
use crate::model_downloader::ModelDownloader;
use crate::ocr::{OcrModels, OcrParams};
use crate::streaming_asr::StreamingAsrModels;

/// 装配 AppState（setup 调用）：数据目录/DB/引擎池/可校准配置/内存态存储。
///
/// @ai-context: 顺序敏感：① ORT 运行时目录注入（引擎线程加载 DLL 前）→
///              ② 数据/模型目录创建 → ③ 捆绑模型同步 → ④ DB 打开 + 崩溃恢复
///              → ⑤ OCR 设备决策（DXGI 探测/折叠模式）→ ⑥ 引擎池（后台加载）
///              → ⑦ 可校准配置与内存态存储 → ⑧ app.manage 注入。
pub fn setup_app_state(app: &mut tauri::App) -> Result<(), String> {
    // ADR-009：引擎线程加载 ORT 之前注入运行时目录（CUDA 多 DLL 依赖）
    ensure_ort_runtime_search_dir();
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;

    // 模型根目录（ASR 模型由下载/捆绑放入；OCR 模型经 ModelScope 自动缓存）
    let model_dir = data_dir.join("models");
    std::fs::create_dir_all(&model_dir).map_err(|e| format!("创建模型目录失败: {}", e))?;

    // 同步随安装包捆绑的模型（方式①；开发环境缺 resources 时自动跳过）
    sync_bundled_models(app.handle(), &model_dir);

    // SQLite 数据库（本地优先，数据不出本机）
    let db_path = data_dir.join("entropy.db");
    let db = Db::open(&db_path.to_string_lossy()).map_err(|e| format!("初始化数据库失败: {}", e))?;

    // 崩溃恢复：上次异常退出残留的 recording 会话标记为 failed（ADR-004）
    // 日志可观测：用户反馈会话"异常中断"时据此判断是否来自重启打断
    let interrupted = db.mark_interrupted_sessions().map_err(|e| e.to_string())?;
    if interrupted > 0 {
        eprintln!("[Db] 启动恢复：{} 个中断会话标记为 failed", interrupted);
    }

    // 常驻引擎池（后台线程加载模型，不阻塞启动）
    // ADR-009（v0.4.0 M1）：OCR 推理后端启动期决策——
    // 三层检测：DXGI 硬件门槛（select_best）→ decide 折叠模式/校准 → ORT 原生回退（引擎内）
    let ocr_device_config_path = data_dir.join("ocr_device.json");
    // TD-044 同批修复：配置内存态单点（命令层锁内 read-modify-write，防 TOCTOU）
    let ocr_device_config = std::sync::Arc::new(std::sync::Mutex::new(OcrDeviceConfig::load(
        &ocr_device_config_path,
    )));
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
    let ocr_backend = decide(ocr_cfg_snapshot.mode, best_device, nvidia_count, ocr_cfg_snapshot.bench);
    eprintln!(
        "[Engine] OCR 设备决策: 模式 {:?} → 后端 {:?}{}",
        ocr_cfg_snapshot.mode,
        ocr_backend,
        best_device
            .map(|id| format!("（候选设备 index={}，NVIDIA 候选数 {}）", id, nvidia_count))
            .unwrap_or_else(|| format!("（无候选，NVIDIA 候选数 {}）", nvidia_count))
    );
    let ocr_device_status =
        std::sync::Arc::new(std::sync::Mutex::new(OcrDeviceStatus::new(
            ocr_cfg_snapshot.mode,
            ocr_backend,
            ocr_cfg_snapshot.bench,
        )));
    let ocr_models = ocr_models();
    let ocr_params = OcrParams::default();
    // M5/REQ-040：共享词表（热词注入 ASR 流、替换词纠错 OCR；JSON 持久化）
    let vocab_path = data_dir.join("vocab.json");
    let vocab =
        std::sync::Arc::new(std::sync::Mutex::new(crate::vocab::VocabStore::load(&vocab_path)));
    // v0.5.0 M1（REQ-043）：档案记忆偏好（混合检测的用户确认记忆；JSON 持久化）
    let profile_memory_path = data_dir.join("video_profile_memory.json");
    let profile_memory = std::sync::Arc::new(std::sync::Mutex::new(
        crate::video_profile::ProfileMemory::load(&profile_memory_path),
    ));
    // v0.5.0 M8（REQ-055）：补缝式 AI 护栏骨架（配额/缓存/审计；云端 V1.0 生效）
    let ai_guardrails =
        std::sync::Arc::new(std::sync::Mutex::new(crate::ai_guardrails::AiGuardrails::default()));
    // v0.11.1：功能开关（feed_capture 默认关——v4 §11.3；JSON 持久化，
    // 缺失/损坏回退默认不阻断启动；同 ai_settings 模式）
    let feature_flags_path = data_dir.join("feature_flags.json");
    let feature_flags = std::sync::Arc::new(std::sync::Mutex::new(
        crate::feature_flags::FeatureFlags::load(&feature_flags_path),
    ));
    // v0.6.0 M1（REQ-083/060）：可校准配置——ui_junk.json 黑名单与
    // symbol_map.json 映射表（缺失走内置默认；损坏回退默认，不阻断启动）
    let ui_junk = crate::ui_junk::UiJunkList::load(&data_dir.join("ui_junk.json"));
    let symbol_normalize =
        crate::symbol_normalize::SymbolNormalizeConfig::load(&data_dir.join("symbol_map.json"));
    // v0.7.5（REQ-173/168）：净化阈值与 OCR 纠错表可校准配置——
    // purify_config.json / ocr_correction.json（同 ui_junk 先例：
    // 缺失走内置默认；损坏回退默认，不阻断启动）
    let purify = crate::purify_config::PurifyConfig::load(&data_dir.join("purify_config.json"));
    let ocr_corrections =
        crate::ocr_correction::OcrCorrectionTable::load(&data_dir.join("ocr_correction.json"));
    // v0.5.0 模型版（REQ-047/049/050）：结构模型下载器（按需下载，独立状态机）
    let structure_downloader = crate::structure_models::StructureModelDownloader::new();
    // TD-2026-08-20-D 清偿（G1）：说话人模型下载器（wespeaker 应用内一键下载）
    let speaker_downloader = crate::speaker_download::SpeakerModelDownloader::new();
    // v0.5.0 模型版（REQ-050）：结构档位配置（公式档位持久化，审查 H3 修复）
    let structure_tier_path = data_dir.join("structure_tier.json");
    // 结构模型装配目录（models/structure；下载器/引擎共用）
    let _ = std::fs::create_dir_all(model_dir.join("structure"));
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
    // v0.7.0 M1（REQ-104/132）：剪贴板信号内存态存储 + 监听句柄占位
    // （start_live_session 成功后启动监听线程，stop 时置位停止）
    let clipboard = std::sync::Arc::new(crate::clipboard_signal::ClipboardSignalStore::new());
    let clipboard_monitor = std::sync::Arc::new(std::sync::Mutex::new(
        None::<crate::clipboard_signal::ClipboardMonitorHandle>,
    ));
    // v0.7.0 M2（REQ-115）：VAD 阈值共享槽（会话线程发布、诊断面板读取）
    let vad_slot =
        std::sync::Arc::new(crate::vad_threshold_slot::VadThresholdSlot::default());
    // v0.8.0 M1（REQ-138/140）：AI 使能层装配——
    // ① 全局设置（enabled/authorized 默认关——授权红线；JSON 持久化，
    //    缺失/损坏回退内置默认不阻断启动）；② 密钥凭据存储（Windows DPAPI
    //    加密文件 ai_credentials.bin——明文红线，密钥不落 SQLite/明文）
    let ai_settings_path = data_dir.join("ai_settings.json");
    let ai_settings = std::sync::Arc::new(std::sync::Mutex::new(
        crate::ai_settings::AiSettings::load(&ai_settings_path),
    ));
    let ai_credentials = crate::ai_credentials::platform_store(&data_dir.join("ai_credentials.bin"));
    // v0.11.6 M1：AI Provider 装配——providers 为空即迁移（新用户亦生成
    // 无密钥预设 Provider，行为自洽）；密钥迁移同处完成（旧凭据条目 →
    // provider:legacy-deepseek 新条目，v0.12.0 M4 迁移目标改 DeepSeek）。
    // 锁序契约：启动单线程装配、锁序（providers→settings）与运行时调用点
    // （settings→providers）相反，禁止在命令层持 providers 锁读 settings。
    // save 决策：保存失败阻断启动是有意 fail-fast（数据目录不可写时后续
    // 持久化同样失败），勿改为静默吞错。
    let ai_providers_path = data_dir.join("ai_providers.json");
    let ai_providers = std::sync::Arc::new(std::sync::Mutex::new(
        crate::ai_provider::AiProviderStore::load(&ai_providers_path),
    ));
    {
        let mut store = ai_providers.lock().map_err(|e| e.to_string())?;
        if store.providers.is_empty() {
            let legacy = ai_settings.lock().map_err(|e| e.to_string())?.clone();
            let (providers, default_id) = crate::ai_provider::migrate_from_legacy(&legacy);
            store.providers = providers;
            store.default_provider_id = default_id;
            // 密钥迁移：旧凭据存在且新 scope 不存在 → 复制（旧条目保留供回退）
            if let Ok(Some(key)) = ai_credentials.load_key("default") {
                if ai_credentials.load_key("provider:legacy-deepseek").ok().flatten().is_none() {
                    let _ = ai_credentials.save_key("provider:legacy-deepseek", &key);
                }
            }
            store.save(&ai_providers_path)?;
        } else if crate::ai_provider::upgrade_existing_default_to_deepseek(&mut store) {
            // v0.12.0 M4：既有安装默认链升级（硅基旧链 → DeepSeek 默认；旧
            // Provider 保留不丢配置——真机取证：既有用户默认仍是 SiliconFlow）
            store.save(&ai_providers_path)?;
        }
    }
    // v0.8.0 M2（REQ-145）：AI 异步任务注册表 + id 序列（spawn_blocking 后台
    // 执行，前端轮询/事件双通道——禁止同步阻塞 30s+ 长会话精修）
    let ai_tasks = crate::commands_ai_refine::task_registry();
    let ai_task_seq = crate::commands_ai_refine::task_seq();
    // v0.8.0 F2（2026-08-21）：任务中心——启动恢复未采纳的成功结果
    // （重启不丢；注册表 + id 序列以恢复结果为基准，防 id 冲突覆盖）
    {
        // 保留策略先行（清理超限旧终态——防表膨胀）
        let _ = db.trim_ai_tasks();
        let restored = db
            .list_restorable_succeeded(100)
            .unwrap_or_else(|e| {
                eprintln!("[ai-tasks] 恢复失败（注册表空启动）: {}", e);
                Vec::new()
            });
        if let Ok(mut tasks) = ai_tasks.lock() {
            let mut max_id = 0u64;
            for rec in &restored {
                let result = rec
                    .result_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok());
                tasks.insert(
                    rec.task_id,
                    crate::commands_ai_refine::AiTaskEntry {
                        state: crate::ai_task::AiTaskState::Succeeded,
                        result,
                        // 目标 id（精修=ref_id 即会话 id；补充=笔记 id——去重粒度）
                        target_id: rec.ref_id,
                    },
                );
                max_id = max_id.max(rec.task_id);
            }
            // id 序列越过恢复的最大 id——新任务不复用旧 id（防覆盖已恢复结果）
            let _ = ai_task_seq.fetch_update(
                std::sync::atomic::Ordering::Relaxed,
                std::sync::atomic::Ordering::Relaxed,
                |cur| Some(cur.max(max_id + 1)),
            );
            eprintln!("[ai-tasks] 启动恢复 {} 条未采纳任务", restored.len());
        }
    }
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
        data_dir,
        ai_guardrails,
        feature_flags,
        feature_flags_path,
        structure_downloader,
        speaker_downloader,
        structure_tier_path,
        // v0.6.0 M1：可校准配置（UI 垃圾黑名单 / 口语符号映射表）
        ui_junk,
        symbol_normalize,
        // v0.7.5：净化阈值配置 / OCR 错字纠错表（purify_config.json /
        // ocr_correction.json 可校准）
        purify,
        ocr_corrections,
        // v0.7.0 M1（REQ-104/132）：剪贴板信号（内存态存储 + 监听句柄占位；
        // start_live_session 启动监听 / stop_live_session 置位停止）
        clipboard,
        clipboard_monitor,
        // v0.7.0 M2（REQ-115）：VAD 阈值共享槽
        vad_slot,
        // v0.8.0 M1（REQ-138/140）：AI 全局设置 + 密钥凭据存储
        ai_settings,
        ai_settings_path,
        ai_credentials,
        // v0.11.6 M1：AI Provider 存储 + 配置路径
        ai_providers,
        ai_providers_path,
        // v0.8.0 M2（REQ-145）：AI 异步任务注册表 + id 序列
        ai_tasks,
        ai_task_seq,
        // v0.16.0（REQ-225）：AI 对话流取消标志表（默认空——无进行中会话）
        chat_cancels: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        // v0.11.7（图文会话，ADR-020）：图文采集互斥槽（会话 id + 长驻图片库 store）
        photo_session: std::sync::Arc::new(std::sync::Mutex::new(None)),
        photo_store: std::sync::Arc::new(std::sync::Mutex::new(None)),
        // v0.12.0 M3：系统级覆盖层截图临时文件路径（open_capture_overlay 写入）
        overlay_image_path: std::sync::Arc::new(std::sync::Mutex::new(None)),
        // v0.12.3：浮窗 UI 状态（locked/topmost——Rust 侧单一来源，见 commands_window.rs）
        float_ui: std::sync::Arc::new(std::sync::Mutex::new(crate::commands_window::FloatUi::default())),
    });
    // v0.12.3（P2-10）：浮窗预创建常驻（隐藏）——打开秒显、点击期零建窗风险；
    // 失败幂等回落为打开时懒创建（open_capture_float 内部兜底）。
    crate::commands_window::precreate_float(app.handle());
    Ok(())
}

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
