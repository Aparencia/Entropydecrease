//! Tauri commands（系统层）：编排引擎池 / 拼接 / 笔记各业务模块。
//!
//! @ai-context: 本层只做参数提取、调用业务模块、错误映射，严禁编写业务计算逻辑（AGENTS.md §6）。
//! @ai-context: 阻塞操作（ASR/OCR 推理经引擎池、DB 读写）统一走 spawn_blocking，避免卡住 UI 事件循环。
//! @ai-context: 错误统一映射为 String 返回前端（Tauri command 要求错误可序列化）。

use tauri::State;

use crate::concat;
use crate::db::Db;
use crate::engine::EnginePool;
use crate::live_session::LiveSessionManager;
use crate::model_downloader::ModelDownloader;
use crate::streaming_asr::StreamingAsrModels;
use crate::types::{NewNote, Note, NoteDraft, OcrBlock, TranscriptSegment};
use crate::windows::{self, CaptureWindow};

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
    /// 实时会话管理器（M7 编排）
    pub live_session: LiveSessionManager,
    /// 流式模型自动下载器（ADR-003 模型分发）
    pub model_downloader: ModelDownloader,
    /// 应用句柄（事件推送 live:* / model:*）
    pub app: tauri::AppHandle,
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
    let engines = state.engines.clone();
    tauri::async_runtime::spawn_blocking(move || engines.transcribe(&path))
        .await
        .map_err(|e| format!("任务调度失败: {}", e))?
        .map_err(|e| e.to_string())
}

/// 本地 OCR：识别一张图片（REQ-002）。
#[tauri::command]
pub async fn recognize_image(state: State<'_, AppState>, path: String) -> Result<Vec<OcrBlock>, String> {
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
    tauri::async_runtime::spawn_blocking(move || concat::build_note_draft(&title, &segments, &ocr_blocks))
        .await
        .map_err(|e| format!("任务调度失败: {}", e))
}

/// 课堂助手 → 笔记联动：把拼接初稿一键存为笔记（REQ-005）。
#[tauri::command]
pub async fn save_draft_as_note(state: State<'_, AppState>, draft: NoteDraft) -> Result<Note, String> {
    let new = NewNote {
        title: draft.title.clone(),
        content: draft.markdown.clone(),
        source: "classroom".to_string(),
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
    let engines = state.engines.clone();
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // 1) 转写（可选音频）
        let mut segments = Vec::new();
        if let Some(path) = audio_path {
            segments.push(engines.transcribe(&path).map_err(|e| e.to_string())?);
        }
        // 2) 多图 OCR（单图失败跳过，不阻断流水线）
        let mut ocr_blocks = Vec::new();
        for path in image_paths {
            if let Ok(blocks) = engines.recognize(&path) {
                ocr_blocks.extend(blocks);
            }
        }
        // 3) 本地拼接成初稿
        let draft = concat::build_note_draft(&title, &segments, &ocr_blocks);
        // 4) 落库为笔记（来源 classroom）
        db.create_note(&NewNote {
            title: draft.title.clone(),
            content: draft.markdown.clone(),
            source: "classroom".to_string(),
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

/// 手动新建笔记（REQ-004）。
#[tauri::command]
pub async fn create_note(state: State<'_, AppState>, new: NewNote) -> Result<Note, String> {
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
    state.db.get_note(id).map_err(|e| e.to_string())
}

/// 更新笔记（REQ-004）。
#[tauri::command]
pub async fn update_note(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    content: String,
) -> Result<bool, String> {
    state.db.update_note(id, &title, &content).map_err(|e| e.to_string())
}

/// 删除笔记（REQ-004）。
#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.db.delete_note(id).map_err(|e| e.to_string())
}

/// 搜索笔记（REQ-004）。
#[tauri::command]
pub async fn search_notes(state: State<'_, AppState>, keyword: String) -> Result<Vec<Note>, String> {
    state.db.search_notes(&keyword).map_err(|e| e.to_string())
}
