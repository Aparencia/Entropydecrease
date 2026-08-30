//! 笔记图片命令（v0.10.1）——显示解析 + 本地导入；v0.15 扩展剪贴板/外链落盘。
//!
//! @ai-context: 笔记 Markdown 内嵌"data_dir 相对引用"（session-images/{sid}/...、
//!              notes-images/{nid}/...、产物裸 full/thumbs/...）。WebView 无法
//!              直接读本地文件，resolve 在服务端校验后返回可 convert 的绝对路径；
//!              本地图片导入必须复制进 data_dir（assetProtocol scope=$APPDATA/**）。
//! @ai-context: v0.15 图片落盘三入口（REQ：用户插入的图片必须留副本）——① 文件
//!              选择（历史行为，扩展名白名单）；② 剪贴板 base64（import_note_image_b64，
//!              字节嗅探定格式）；③ 外链 URL（import_note_image_url，ureq 下载限流）。
//!              三者共用 save_image_bytes（大小上限 + 唯一命名 + 落盘），删除笔记时
//!              顺带清理 notes-images/{nid}/ 防孤立残留。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use tauri::State;

use crate::commands::AppState;
use crate::types::Note;

/// 导入扩展名白名单（小写）。
const IMAGE_EXT_WHITELIST: &[&str] = &["png", "jpg", "jpeg", "webp", "gif"];
/// 导入大小上限（10MB——关键帧/截图场景足够）。
const IMAGE_MAX_BYTES: u64 = 10 * 1024 * 1024;
/// 外链下载超时（秒）。
const URL_FETCH_TIMEOUT_SECS: u64 = 10;
/// 外链下载跟随重定向上限。
const URL_FETCH_MAX_REDIRECTS: u32 = 3;

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

/// 剪贴板图片导入笔记（v0.15：base64 IPC——同 capture_fragment 先例）。
///
/// @ai-context: 编辑态粘贴图片入口：前端把 ClipboardEvent 的 image blob 转 base64
///              上送，本命令字节嗅探定格式（不信任 MIME——浏览器可能给错 type），
///              解码验证 + 大小上限后落盘。失败即 Err——前端提示不落脏内容。
#[tauri::command]
pub async fn import_note_image_b64(
    state: State<'_, AppState>,
    note_id: i64,
    image_b64: String,
) -> Result<String, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    if state.db.get_note(note_id).map_err(|e| e.to_string())?.is_none() {
        return Err("笔记不存在".to_string());
    }
    // 解码前尺寸防线：base64 膨胀率 4/3（+填充余量）——纯文本长度超上限直接拒绝，
    // 防恶意/畸形超大输入先完整解码再检查的内存峰值（解码缓冲区翻倍）
    if image_b64.len() as u64 > IMAGE_MAX_BYTES / 3 * 4 + 64 {
        return Err(format!("图片数据超过大小上限（{} 字节）", IMAGE_MAX_BYTES));
    }
    let bytes = BASE64
        .decode(image_b64.trim())
        .map_err(|_| "图片数据解码失败（非法 base64）".to_string())?;
    import_image_bytes(&bytes, &state.data_dir, note_id, IMAGE_MAX_BYTES)
}

/// 外链图片下载导入笔记（v0.15：🌐 链接图自动复制——防源站删除导致资源丢失）。
///
/// @ai-context: 下载经 ureq（TLS 全栈已有依赖），超时 + 限流 10MB + 跟随重定向；
///              内容类型双保险（Content-Type 前缀 image/ 或字节嗅探命中白名单）。
///              失败返回 Err——前端降级插入原 URL 并提示（能力降级不失效）。
#[tauri::command]
pub async fn import_note_image_url(
    state: State<'_, AppState>,
    note_id: i64,
    url: String,
) -> Result<String, String> {
    if note_id <= 0 {
        return Err("无效的笔记 id".to_string());
    }
    if state.db.get_note(note_id).map_err(|e| e.to_string())?.is_none() {
        return Err("笔记不存在".to_string());
    }
    let bytes = download_image_limited(&url, IMAGE_MAX_BYTES)?;
    import_image_bytes(&bytes, &state.data_dir, note_id, IMAGE_MAX_BYTES)
}

/// 下载并限流读取图片字节（纯逻辑：非 http/https 直接拒绝——可单测）。
///
/// @ai-context: ureq 2 的 read_to_string 无长度上限（恶意站点可无限流），
///              经 into_reader().take(max+1) 截断读取——超限即 Err 不落盘。
fn download_image_limited(url: &str, max_bytes: u64) -> Result<Vec<u8>, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("仅支持 http/https 链接".to_string());
    }
    let resp = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(URL_FETCH_TIMEOUT_SECS))
        .redirects(URL_FETCH_MAX_REDIRECTS)
        .build()
        .get(url)
        .call()
        .map_err(|e| format!("图片下载失败: {e}"))?;
    if !resp.content_type().starts_with("image/") {
        return Err(format!("目标不是图片资源（Content-Type: {}）", resp.content_type()));
    }
    let mut reader = resp.into_reader();
    let mut buf = Vec::with_capacity(64 * 1024);
    reader
        .by_ref()
        .take(max_bytes + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("图片读取失败: {e}"))?;
    if buf.len() as u64 > max_bytes {
        return Err(format!("图片超过大小上限（{} 字节）", max_bytes));
    }
    Ok(buf)
}

/// 复制图片进笔记图片目录并返回相对引用（文件入口；扩展名白名单——v0.10.1 契约）。
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
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    write_image_bytes(data_dir, note_id, &bytes, &ext, max_bytes)
}

/// 字节入口（剪贴板/外链共用）：字节嗅探定格式 + 校验 + 落盘。
///
/// @ai-context: 与文件入口不同——机器来源的数据不信任扩展名/MIME，用
///              image::guess_format 嗅探魔数（不完整解码，快且拒垃圾数据）。
fn import_image_bytes(
    bytes: &[u8],
    data_dir: &Path,
    note_id: i64,
    max_bytes: u64,
) -> Result<String, String> {
    let ext = match image::guess_format(bytes) {
        Ok(fmt) => match fmt {
            image::ImageFormat::Png => "png",
            image::ImageFormat::Jpeg => "jpg",
            image::ImageFormat::Gif => "gif",
            image::ImageFormat::WebP => "webp",
            _ => return Err("不支持的图片格式（支持 png/jpg/jpeg/webp/gif）".to_string()),
        },
        Err(_) => return Err("图片数据损坏或不是图片（嗅探失败）".to_string()),
    };
    write_image_bytes(data_dir, note_id, bytes, ext, max_bytes)
}

/// 落盘核心（纯逻辑，可单测）：大小上限 → 建目录 → 唯一命名 → 写文件。
fn write_image_bytes(
    data_dir: &Path,
    note_id: i64,
    bytes: &[u8],
    ext: &str,
    max_bytes: u64,
) -> Result<String, String> {
    if bytes.len() as u64 > max_bytes {
        return Err(format!("图片超过大小上限（{} 字节）", max_bytes));
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
    std::fs::write(dir.join(&name), bytes).map_err(|e| e.to_string())?;
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
