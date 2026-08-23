//! 视频文件导入 Tauri commands（REQ-015，ADR-008）。
//!
//! @ai-context: 本层只做参数校验、调用导入管线、错误映射（AGENTS.md §6）；
//!              长任务（ffmpeg 提取 + 分窗 ASR + 关键帧 OCR）走 spawn_blocking，
//!              进度经 import:progress 事件推送前端（不阻塞 UI 事件循环）。

use tauri::{Emitter, Manager, State};

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
    // REQ-117（v0.7.0 M2）：UI 垃圾黑名单（导入画面要点源头过滤——双入口同口径）
    let ui_junk = state.ui_junk.clone();
    // v0.12.0 M5 补完成：关键帧纯图归档根目录（应用数据目录）
    let data_dir = state.data_dir.clone();
    // 审查 P2 修复（TD-036）：ffmpeg 探测注入生产捆绑路径（resource_dir/ffmpeg，
    // 安装包随 bundle.resources 携带；开发期捆绑目录 = crate 下 ffmpeg/）。
    // 解析顺序仍为：ENTROPY_FFMPEG_DIR → 注入目录 → PATH（ffmpeg.rs）。
    let mut resolver_dirs = vec![std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ffmpeg")];
    if let Ok(res) = app.path().resource_dir() {
        resolver_dirs.push(res.join("ffmpeg"));
    }
    let resolver = FfmpegResolver::with_dirs(resolver_dirs);
    tauri::async_runtime::spawn_blocking(move || {
        run_video_import(&db, &engines, &resolver, &trimmed, &ui_junk, &data_dir, |p: &ImportProgress| {
            let _ = app.emit("import:progress", p);
        })
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
    .map_err(|e| e.to_string())
}
