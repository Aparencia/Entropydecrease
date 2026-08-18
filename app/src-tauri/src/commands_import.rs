//! 视频文件导入 Tauri commands（REQ-015，ADR-008）。
//!
//! @ai-context: 本层只做参数校验、调用导入管线、错误映射（AGENTS.md §6）；
//!              长任务（ffmpeg 提取 + 分窗 ASR + 关键帧 OCR）走 spawn_blocking，
//!              进度经 import:progress 事件推送前端（不阻塞 UI 事件循环）。

use tauri::{Emitter, State};

use crate::commands::AppState;
use crate::ffmpeg::FfmpegResolver;
use crate::import::{run_video_import, ImportProgress};

/// 视频文件扩展名白名单（防任意路径/非媒体文件进入提取管线）。
const VIDEO_EXTENSIONS: [&str; 9] = ["mp4", "mkv", "mov", "avi", "wmv", "flv", "webm", "ts", "m4v"];

/// 视频文件导入：文件 → 会话（字幕优先/ASR fallback + 关键帧 OCR）。
///
/// @param path - 视频文件绝对路径（dialog 选择，非用户自由输入）
/// @returns 新建会话 id
#[tauri::command]
pub async fn import_video(state: State<'_, AppState>, path: String) -> Result<i64, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("视频路径为空".to_string());
    }
    let ext = std::path::Path::new(&trimmed)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("不支持的文件类型: .{}（支持: {}）", ext, VIDEO_EXTENSIONS.join("/")));
    }

    let db = state.db.clone();
    let engines = state.engines.clone();
    let app = state.app.clone();
    let resolver = FfmpegResolver::dev();
    tauri::async_runtime::spawn_blocking(move || {
        run_video_import(&db, &engines, &resolver, &trimmed, |p: &ImportProgress| {
            let _ = app.emit("import:progress", p);
        })
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
    .map_err(|e| e.to_string())
}
