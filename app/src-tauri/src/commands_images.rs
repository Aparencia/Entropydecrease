//! 会话图片配套 Tauri commands（REQ-051 / v0.5.0 M6）。
//!
//! @ai-context: 本层只做参数校验、调用存储层（image_store）、错误映射（AGENTS.md §6）。
//! @ai-context: 三层图结构：关键图（产物内嵌，M7 消费）/ 参考图集（画廊）/
//!              缩略图走廊（时间轴导航）；图片只存本地会话目录（数据不出本机）。
//! @ai-context: 路径安全：所有路径限定会话目录（images/<session_id>/），
//!              拒绝路径穿越（../ 等）——Tauri IPC 文件系统访问边界。

use tauri::State;

use crate::commands::AppState;
use crate::image_store::SessionImageStore;

/// 会话图片目录（相对应用数据目录）。
///
/// @ai-context: data_dir/session-images/<session_id>/——与 DB 会话表独立
///              （图片为二进制大文件，不入 SQLite；删除会话时由命令级联清理）。
fn session_image_dir(state: &AppState, session_id: i64) -> std::path::PathBuf {
    state.data_dir.join("session-images").join(session_id.to_string())
}

/// 用户显式截图（REQ-051 M6：最高权重信号，快捷键 Ctrl+Shift+S 触发）。
///
/// @ai-context: 从实时会话的最新帧缓存取当前帧 → 存图（full+thumb）；
///              用户自己觉得重要的时刻 → 关键图投票最高权重（D1 回路输入）。
/// @ai-context: 无活动会话/无帧 → Err（前端提示）。
#[tauri::command]
pub fn save_user_screenshot(state: State<'_, AppState>) -> Result<String, String> {
    let frame = state
        .live_session
        .latest_frame()
        .ok_or_else(|| "当前无活动会话或未捕获到画面".to_string())?;
    let session_id = state
        .live_session
        .active_session_id()
        .ok_or_else(|| "无活动会话".to_string())?;
    let mut store = SessionImageStore::new(session_image_dir(&state, session_id))
        .map_err(|e| e.to_string())?;
    store
        .save_frame(frame.timestamp_ms, &frame.bgraw, frame.width, frame.height)
        .map_err(|e| format!("保存截图失败: {}", e))
}

/// 会话图片目录完整路径（前端 convertFileSrc 读取图集用）。
///
/// @ai-context: 返回 data_dir/session-images/<id>（相对路径由前端拼接 rel）；
///              只暴露会话图片目录（数据不出本机的展示通道）。
#[tauri::command]
pub fn session_images_base_url(state: State<'_, AppState>, session_id: i64) -> Result<String, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    Ok(session_image_dir(&state, session_id).to_string_lossy().into_owned())
}

/// 列出会话图片（参考图集/缩略图走廊数据源；按时间戳升序）。
#[tauri::command]
pub fn list_session_images(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Vec<String>, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let dir = session_image_dir(&state, session_id);
    if !dir.join("full").is_dir() {
        return Ok(Vec::new()); // 会话无图片（未启用/未到保存时机）
    }
    let store = SessionImageStore::new(dir).map_err(|e| e.to_string())?;
    Ok(store.list_images())
}

/// 删除会话图片（用户删改图集——D1 回路：删改反哺筛选阈值参数，V1.0 校准）。
#[tauri::command]
pub fn delete_session_image(
    state: State<'_, AppState>,
    session_id: i64,
    relative_path: String,
) -> Result<bool, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    // 路径安全：仅允许 full/xxx.webp 或 thumb/xxx.webp，拒绝路径穿越
    let rel = relative_path.trim().to_string();
    let safe = (rel.starts_with("full/") || rel.starts_with("thumb/"))
        && rel.ends_with(".webp")
        && !rel.contains("..")
        && !rel.contains('\\');
    if !safe {
        return Err("非法的图片路径".to_string());
    }
    let base = session_image_dir(&state, session_id);
    let path = base.join(&rel);
    // 双保险：确认解析后仍在会话目录内（防符号链接/嵌套穿越）
    let canonical_base = std::fs::canonicalize(&base).unwrap_or(base.clone());
    let canonical_path = std::fs::canonicalize(&path).unwrap_or(path.clone());
    if !canonical_path.starts_with(&canonical_base) {
        return Err("路径越界拒绝".to_string());
    }
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("删除图片失败: {}", e)),
    }
}

/// 删除会话的全部图片目录（删除会话时级联调用）。
#[tauri::command]
pub fn delete_session_images_all(state: State<'_, AppState>, session_id: i64) -> Result<(), String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let dir = session_image_dir(&state, session_id);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("清理会话图片失败: {}", e))?;
    }
    Ok(())
}
