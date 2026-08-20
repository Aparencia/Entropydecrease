//! Tauri commands（系统层）：编排引擎池 / 拼接 / 笔记各业务模块。
//!
//! @ai-context: 本层只做参数提取、调用业务模块、错误映射，严禁编写业务计算逻辑（AGENTS.md §6）。
//! @ai-context: 阻塞操作（ASR/OCR 推理经引擎池、DB 读写）统一走 spawn_blocking，避免卡住 UI 事件循环。
//! @ai-context: 错误统一映射为 String 返回前端（Tauri command 要求错误可序列化）。
//! @ai-context: 入参校验（TD-005 修复口径）：旧 command 补齐——title 归一化、id>0、
//!              关键词/正文截断、列表数量有界，与 commands_session 同口径。

use tauri::State;

use crate::concat;
use crate::db::Db;
use crate::engine::EnginePool;
#[cfg(target_os = "windows")]
use crate::live_session::LiveSessionManager;
use crate::model_downloader::ModelDownloader;
use crate::streaming_asr::StreamingAsrModels;
use crate::types::{NewNote, Note, NoteDraft, OcrBlock, TranscriptSegment};
use crate::video_profile::ProfileMemory;
use crate::windows::{self, CaptureWindow};

/// 标题最大长度（防超长字符串污染 UI 与索引；与 commands_session 同口径）。
pub(crate) const TITLE_MAX_CHARS: usize = 100;
/// 笔记正文最大长度（防超大 payload 拖垮 IPC/DB）。
const CONTENT_MAX_CHARS: usize = 200_000;
/// 搜索关键词最大长度。
const KEYWORD_MAX_CHARS: usize = 100;
/// 一键流水线最大图片数。
const MAX_IMAGES: usize = 20;
/// 拼接输入段/块数量上限（防恶意超大列表拖垮拼接）。
const MAX_INPUT_ITEMS: usize = 5000;

/// 校验并归一化标题：空串回退默认名，超长截断（TD-005 统一口径，commands_session 复用）。
pub(crate) fn normalize_title(raw: String, fallback: &str) -> String {
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(TITLE_MAX_CHARS).collect()
    }
}

/// 截断字符串到上限字符数（防御性编程）。
fn truncate_chars(s: String, max: usize) -> String {
    s.chars().take(max).collect()
}

/// 应用共享状态：数据库 + 常驻引擎池 + 流式模型路径 + 实时会话管理器 + 模型下载器。
///
/// @ai-context: Db 为 Arc 包裹（Clone 廉价）；EnginePool 内部仅 channel sender（Clone 廉价），
///              二者都可安全移入 spawn_blocking 闭包；streaming_models 仅路径（只读）；
///              app 供实时会话事件推送（Tauri Emitter）；live_session/model_downloader 为内部可变状态。
#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub engines: EnginePool,
    /// 流式 ASR 模型路径（ADR-003：models/streaming-zipformer/ 四件套）
    pub streaming_models: StreamingAsrModels,
    /// 实时会话管理器（M7 编排；Windows-only，TD-027 修复）
    #[cfg(target_os = "windows")]
    pub live_session: LiveSessionManager,
    /// 流式模型自动下载器（ADR-003 模型分发）
    pub model_downloader: ModelDownloader,
    /// 应用句柄（事件推送 live:* / model:*）
    pub app: tauri::AppHandle,
    /// OCR 设备配置文件路径（ADR-009：模式/校准持久化，应用数据目录）
    pub ocr_device_config_path: std::path::PathBuf,
    /// OCR 模型标识（ADR-009 校准"重新检测"用；与引擎池启动同源）
    pub ocr_models: crate::ocr::OcrModels,
    /// OCR 检测参数（ADR-009 校准"重新检测"用；与引擎池启动同源）
    pub ocr_params: crate::ocr::OcrParams,
    /// M5/REQ-040：共享词表（热词注入 ASR、替换词纠错 OCR）
    pub vocab: std::sync::Arc<std::sync::Mutex<crate::vocab::VocabStore>>,
    /// M5：词表 JSON 路径（应用数据目录）
    pub vocab_path: std::path::PathBuf,
    /// ADR-009（TD-044 同批修复）：OCR 设备配置内存态单点（校准/set_mode 锁内
    /// read-modify-write，消除 TOCTOU 文件竞争）；持久化见 ocr_device_config_path
    pub ocr_device_config: std::sync::Arc<std::sync::Mutex<crate::device_config::OcrDeviceConfig>>,
    /// 模型根目录（健康巡检补全 sensevoice 模型完整性检查用）
    pub model_dir: std::path::PathBuf,
    /// v0.5.0 M1（REQ-043）：档案记忆偏好 JSON 路径（应用数据目录）
    pub profile_memory_path: std::path::PathBuf,
    /// v0.5.0 M1（REQ-043）：档案记忆内存态单点（锁内 read-modify-write，
    /// 与词表同模式防 TOCTOU 文件竞争；持久化见 profile_memory_path）
    pub profile_memory: std::sync::Arc<std::sync::Mutex<ProfileMemory>>,
    /// v0.5.0 M6（REQ-051）：应用数据目录（会话图片存储基目录）
    pub data_dir: std::path::PathBuf,
    /// v0.5.0 M8（REQ-055）：补缝式 AI 护栏状态（每日配额 + 同图 hash 缓存；
    /// 云端 V1.0 实装后生效，骨架就位）
    pub ai_guardrails: std::sync::Arc<std::sync::Mutex<crate::ai_guardrails::AiGuardrails>>,
    /// v0.5.0 模型版（REQ-047/049/050）：结构模型下载器（版面/表格/公式按需下载）
    pub structure_downloader: crate::structure_models::StructureModelDownloader,
    /// TD-2026-08-20-D 清偿（G1）：说话人模型下载器（wespeaker 应用内一键下载）
    pub speaker_downloader: crate::speaker_download::SpeakerModelDownloader,
    /// v0.5.0 模型版（REQ-050）：结构档位配置路径（公式 PP-FormulaNet/UniMERNet；
    /// 审查 H3 修复：装配路径按档位解析）
    pub structure_tier_path: std::path::PathBuf,
    /// v0.6.0 M1（REQ-083）：UI 垃圾黑名单（内置默认 + ui_junk.json 校准合并；
    /// 字幕源头过滤 + note_filter 出口兜底同表）
    pub ui_junk: crate::ui_junk::UiJunkList,
    /// v0.6.0 M1（REQ-060）：口语符号映射表（内置默认 + symbol_map.json 校准合并；
    /// 产物层书面化管线消费）
    pub symbol_normalize: crate::symbol_normalize::SymbolNormalizeConfig,
    /// v0.7.5（REQ-173）：笔记净化阈值配置（内置默认 + purify_config.json 校准合并；
    /// 120字/60s/0.5/0.6 等集中常量，现场调参无需改码）
    pub purify: crate::purify_config::PurifyConfig,
    /// v0.7.5（REQ-168）：OCR 错字纠错表（内置种子 + ocr_correction.json 校准合并；
    /// 画面词与讲述词互证，无映射不猜）
    pub ocr_corrections: crate::ocr_correction::OcrCorrectionTable,
    /// v0.7.0 M1（REQ-104/132）：剪贴板信号存储（内存态；课中复制=高置信信号，
    /// 只存前 30 字符预览——隐私红线：原始剪贴板内容不持久化）
    pub clipboard: std::sync::Arc<crate::clipboard_signal::ClipboardSignalStore>,
    /// v0.7.0 M1（REQ-104/132）：剪贴板监听线程句柄（start 启动 / stop 置位停止；
    /// 与实时会话一一对应，同一时刻最多一个）
    pub clipboard_monitor:
        std::sync::Arc<std::sync::Mutex<Option<crate::clipboard_signal::ClipboardMonitorHandle>>>,
    /// v0.7.0 M2（REQ-115）：VAD 阈值共享槽（会话线程发布当前阈值，诊断面板可查）
    pub vad_slot: std::sync::Arc<crate::vad_threshold_slot::VadThresholdSlot>,
    /// v0.8.0 M1（REQ-138/140）：AI 全局设置（enabled/authorized/端点/模型/阈值；
    /// 锁内 read-modify-write，持久化见 ai_settings_path——密钥不在此，
    /// 走 ai_credentials 凭据库，明文红线）
    pub ai_settings: std::sync::Arc<std::sync::Mutex<crate::ai_settings::AiSettings>>,
    /// v0.8.0 M1（REQ-138）：AI 设置文件路径（应用数据目录 ai_settings.json）
    pub ai_settings_path: std::path::PathBuf,
    /// v0.8.0 M1（REQ-138）：AI 密钥凭据存储（Windows DPAPI 加密文件；
    /// 密钥不落 SQLite/明文文件——安全红线）
    pub ai_credentials: std::sync::Arc<dyn crate::ai_credentials::CredentialStore>,
    /// v0.8.0 M2（REQ-145）：AI 异步任务注册表（任务 id → 状态/结果；
    /// 容量守卫防无界增长——见 commands_ai_refine::trim_tasks）
    pub ai_tasks: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<u64, crate::commands_ai_refine::AiTaskEntry>>>,
    /// v0.8.0 M2（REQ-145）：任务 id 序列（原子递增——并发安全）
    pub ai_task_seq: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

/// 枚举可捕获的窗口/进程（课堂助手目标窗口选择，含推荐评分）。
///
/// @ai-context: 枚举为系统调用（数百窗口 + 逐个查进程名），走 spawn_blocking 避免卡 UI。
#[tauri::command]
pub async fn list_windows() -> Result<Vec<CaptureWindow>, String> {
    tauri::async_runtime::spawn_blocking(windows::list_capture_windows)
        .await
        .map_err(|e| format!("任务调度失败: {}", e))
}

/// 本地 ASR：转写一个 WAV 文件（REQ-001）。
#[tauri::command]
pub async fn transcribe_audio(state: State<'_, AppState>, path: String) -> Result<TranscriptSegment, String> {
    if path.trim().is_empty() {
        return Err("音频路径为空".to_string());
    }
    let engines = state.engines.clone();
    tauri::async_runtime::spawn_blocking(move || engines.transcribe(&path))
        .await
        .map_err(|e| format!("任务调度失败: {}", e))?
        .map_err(|e| e.to_string())
}

/// 本地 OCR：识别一张图片（REQ-002）。
#[tauri::command]
pub async fn recognize_image(state: State<'_, AppState>, path: String) -> Result<Vec<OcrBlock>, String> {
    if path.trim().is_empty() {
        return Err("图片路径为空".to_string());
    }
    let engines = state.engines.clone();
    tauri::async_runtime::spawn_blocking(move || engines.recognize(&path))
        .await
        .map_err(|e| format!("任务调度失败: {}", e))?
        .map_err(|e| e.to_string())
}

/// 本地拼接：转写段 + OCR 块 → 笔记初稿（REQ-003，纯本地无 LLM）。
#[tauri::command]
pub async fn build_draft(
    title: String,
    segments: Vec<TranscriptSegment>,
    ocr_blocks: Vec<OcrBlock>,
) -> Result<NoteDraft, String> {
    if segments.len() > MAX_INPUT_ITEMS || ocr_blocks.len() > MAX_INPUT_ITEMS {
        return Err(format!("拼接输入数量超限（上限 {}）", MAX_INPUT_ITEMS));
    }
    let title = normalize_title(title, "未命名笔记");
    tauri::async_runtime::spawn_blocking(move || concat::build_note_draft(&title, &segments, &ocr_blocks))
        .await
        .map_err(|e| format!("任务调度失败: {}", e))
}

/// 课堂助手 → 笔记联动：把拼接初稿一键存为笔记（REQ-005）。
#[tauri::command]
pub async fn save_draft_as_note(state: State<'_, AppState>, draft: NoteDraft) -> Result<Note, String> {
    let new = NewNote {
        title: normalize_title(draft.title, "未命名笔记"),
        content: truncate_chars(draft.markdown, CONTENT_MAX_CHARS),
        source: "classroom".to_string(),
        session_id: None,
        rule_version: None,
        purify_stats: None,
    };
    state.db.create_note(&new).map_err(|e| e.to_string())
}

/// 一键流水线：音频转写 + 多图 OCR → 本地拼接 → 自动存为笔记。
///
/// @ai-context: 这是"课堂助手 → 笔记"的核心体验编排（高价值优化②）：用户一次提交素材，
///              引擎池完成提取，拼接纯函数组织内容，数据层落库——全程本地。
/// @ai-context: 单张图片 OCR 失败不阻断整体流水线（记录跳过），音频失败才整体失败。
/// @param title - 笔记标题
/// @param audio_path - 可选音频文件（WAV）
/// @param image_paths - 图片文件列表（可为空）
/// @returns 已保存的笔记
#[tauri::command]
pub async fn process_to_note(
    state: State<'_, AppState>,
    title: String,
    audio_path: Option<String>,
    image_paths: Vec<String>,
) -> Result<Note, String> {
    if image_paths.len() > MAX_IMAGES {
        return Err(format!("图片数量超限（上限 {}）", MAX_IMAGES));
    }
    if audio_path.as_ref().is_some_and(|p| p.trim().is_empty()) {
        return Err("音频路径为空".to_string());
    }
    let title = normalize_title(title, "未命名笔记");
    let engines = state.engines.clone();
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // 1) 转写（可选音频）
        let mut segments = Vec::new();
        if let Some(path) = audio_path {
            segments.push(engines.transcribe(&path).map_err(|e| e.to_string())?);
        }
        // 2) 多图 OCR（单图失败跳过不阻断，但记录警告——TD-001 修复：不再静默吞错）
        let mut ocr_blocks = Vec::new();
        let mut skipped: Vec<String> = Vec::new();
        for path in image_paths {
            match engines.recognize(&path) {
                Ok(blocks) => ocr_blocks.extend(blocks),
                Err(e) => skipped.push(format!("{}: {}", path, e)),
            }
        }
        // 3) 本地拼接成初稿（失败图片以警告段落追加，用户打开笔记即可感知）
        let mut draft = concat::build_note_draft(&title, &segments, &ocr_blocks);
        if !skipped.is_empty() {
            // REQ-106（TRUST-4）：失败图片路径可能含 CJK 用户目录/URL——日志出口统一脱敏
            eprintln!(
                "[process_to_note] {} 张图片 OCR 失败: {}",
                skipped.len(),
                crate::log_redact::redact_line(&skipped.join("; "))
            );
            draft.markdown.push_str(&format!(
                "\n\n> ⚠ {} 张图片识别失败已跳过：\n> {}",
                skipped.len(),
                skipped.join("\n> ")
            ));
        }
        // 4) 落库为笔记（来源 classroom）
        db.create_note(&NewNote {
            title: draft.title.clone(),
            content: draft.markdown.clone(),
            source: "classroom".to_string(),
            session_id: None,
            rule_version: None,
            purify_stats: None,
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

/// 手动新建笔记（REQ-004）。
#[tauri::command]
pub async fn create_note(state: State<'_, AppState>, new: NewNote) -> Result<Note, String> {
    let new = NewNote {
        title: normalize_title(new.title, "未命名笔记"),
        content: truncate_chars(new.content, CONTENT_MAX_CHARS),
        source: if new.source == "classroom" { "classroom" } else { "manual" }.to_string(),
        // 手动新建笔记无来源会话（session_id 仅由会话→笔记链路写入）
        session_id: None,
        // 手动笔记无净化规则版本/统计（None 诚实降级——REQ-171 口径）
        rule_version: None,
        purify_stats: None,
    };
    state.db.create_note(&new).map_err(|e| e.to_string())
}

/// 列出全部笔记（REQ-004）。
#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>) -> Result<Vec<Note>, String> {
    state.db.list_notes().map_err(|e| e.to_string())
}

/// 读取单条笔记（REQ-004）。
#[tauri::command]
pub async fn get_note(state: State<'_, AppState>, id: i64) -> Result<Option<Note>, String> {
    if id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state.db.get_note(id).map_err(|e| e.to_string())
}

/// 更新笔记（REQ-004；标题/正文截断防超大 payload——TD-005）。
#[tauri::command]
pub async fn update_note(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    content: String,
) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state
        .db
        .update_note(
            id,
            &truncate_chars(title, TITLE_MAX_CHARS),
            &truncate_chars(content, CONTENT_MAX_CHARS),
        )
        .map_err(|e| e.to_string())
}

/// 删除笔记（REQ-004）。
#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    if id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    state.db.delete_note(id).map_err(|e| e.to_string())
}

/// 搜索笔记（REQ-004；关键词截断——TD-005）。
#[tauri::command]
pub async fn search_notes(state: State<'_, AppState>, keyword: String) -> Result<Vec<Note>, String> {
    state
        .db
        .search_notes(&truncate_chars(keyword, KEYWORD_MAX_CHARS))
        .map_err(|e| e.to_string())
}
