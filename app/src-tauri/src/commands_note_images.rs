//! 笔记图片命令（v0.10.1）——显示解析 + 本地导入。
//!
//! @ai-context: 笔记 Markdown 内嵌"data_dir 相对引用"（session-images/{sid}/...、
//!              notes-images/{nid}/...、产物裸 full/thumbs/...）。WebView 无法
//!              直接读本地文件，resolve 在服务端校验后返回可 convert 的绝对路径；
//!              本地图片导入必须复制进 data_dir（assetProtocol scope=$APPDATA/**）。

use std::path::{Path, PathBuf};

use tauri::State;

use crate::commands::AppState;
use crate::types::Note;

/// 导入扩展名白名单（小写）。
const IMAGE_EXT_WHITELIST: &[&str] = &["png", "jpg", "jpeg", "webp", "gif"];
/// 导入大小上限（10MB——关键帧/截图场景足够）。
const IMAGE_MAX_BYTES: u64 = 10 * 1024 * 1024;

/// 解析笔记图片引用 → 可 convert 的本地绝对路径（纯函数，可单测）。
///
/// @ai-context: 三规则（v0.10.1 设计）：
///   1. `session-images/{sid}/...` → data_dir/session-images/{sid}/...（sid 必须==笔记来源会话）
///   2. `notes-images/{nid}/...` → data_dir/notes-images/{nid}/...（nid 必须==笔记 id）
///   3. 裸 `full/...`/`thumbs/...` → 按笔记来源会话目录解析（产物转笔记格式）
///
///   拒绝 `..` 穿越；http(s)/data:/其他 → None（前端直出，不经本地文件系统）。
fn resolve_note_image_path(data_dir: &Path, note: &Note, note_id: i64, src: &str) -> Option<PathBuf> {
    // 穿越防护：任何路径段为 `..` 一律拒绝（含反斜杠形式的 Windows 写法）
    if src.split(['/', '\\']).any(|seg| seg == "..") {
        return None;
    }
    if let Some(rest) = src.strip_prefix("session-images/") {
        let sid = rest.split('/').next()?.parse::<i64>().ok()?;
        if note.session_id != Some(sid) {
            return None; // 越权：笔记只能引用自己来源会话的图
        }
        return Some(data_dir.join(src));
    }
    if let Some(rest) = src.strip_prefix("notes-images/") {
        let nid = rest.split('/').next()?.parse::<i64>().ok()?;
        if nid != note_id {
            return None; // 越权：笔记只能引用自己的图
        }
        return Some(data_dir.join(src));
    }
    if src.starts_with("full/") || src.starts_with("thumbs/") {
        let sid = note.session_id?;
        return Some(data_dir.join("session-images").join(sid.to_string()).join(src));
    }
    None
}

/// 笔记图片引用 → 本地绝对路径（前端 convertFileSrc 消费）。
#[tauri::command]
pub async fn resolve_note_image(
    state: State<'_, AppState>,
    note_id: i64,
    src: String,
) -> Result<Option<String>, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    let note = state
        .db
        .get_note(note_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "笔记不存在".to_string())?;
    Ok(resolve_note_image_path(&state.data_dir, &note, note_id, &src)
        .map(|p| p.to_string_lossy().into_owned()))
}

/// 本地图片导入笔记（v0.10.1：复制进 notes-images/{nid}/ 并返回相对引用）。
///
/// @ai-context: 硬约束——assetProtocol scope 仅放行 $APPDATA/**，用户自选路径
///              （桌面/下载）不在 scope 内，必须复制进 data_dir 才能被 WebView
///              读取；复制同时保证备份一致性（REQ-107 备份走 data_dir）。
#[tauri::command]
pub async fn import_note_image(
    state: State<'_, AppState>,
    note_id: i64,
    source_path: String,
) -> Result<String, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    if state.db.get_note(note_id).map_err(|e| e.to_string())?.is_none() {
        return Err("笔记不存在".to_string());
    }
    import_image_file(&source_path, &state.data_dir, note_id, IMAGE_MAX_BYTES)
}

/// 复制图片进笔记图片目录并返回相对引用（纯逻辑，命令层复用——可单测）。
fn import_image_file(
    source_path: &str,
    data_dir: &Path,
    note_id: i64,
    max_bytes: u64,
) -> Result<String, String> {
    let src = Path::new(source_path);
    if !src.is_file() {
        return Err("源文件不存在".to_string());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXT_WHITELIST.contains(&ext.as_str()) {
        return Err(format!("不支持的图片格式: {}（支持 png/jpg/jpeg/webp/gif）", ext));
    }
    let len = std::fs::metadata(src).map_err(|e| e.to_string())?.len();
    if len > max_bytes {
        return Err(format!("图片超过大小上限（{} 字节）", len));
    }
    let dir = data_dir.join("notes-images").join(note_id.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = crate::db_sessions_rows::unix_seconds();
    let mut name = format!("{}.{}", ts, ext);
    let mut seq = 0u64;
    while dir.join(&name).exists() {
        seq += 1;
        name = format!("{}_{}.{}", ts, seq, ext);
    }
    std::fs::copy(src, dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(format!("notes-images/{}/{}", note_id, name))
}

/// 应用数据根目录（前端拼接 data_dir 相对引用用——NotePreviewView 配图行）。
#[tauri::command]
pub fn app_data_dir(state: State<'_, AppState>) -> String {
    state.data_dir.to_string_lossy().into_owned()
}

#[cfg(test)]
#[path = "commands_note_images_tests.rs"]
mod tests;
