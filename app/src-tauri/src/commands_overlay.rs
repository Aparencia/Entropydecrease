//! 系统级覆盖层截图命令（v0.12.0 M3，ADR-022 关联——交互债；v0.12.3 死锁修复）。
//!
//! @ai-context: 替代应用内 letterbox 框选（4K 屏在 1200px 窗口内缩到 73%，
//!              文字细节丢失 + 三步操作）：Tauri 独立全屏透明窗口 1:1 原始像素
//!              显示当前帧 → 拖拽框选 → 确认 → 后端裁剪 PNG base64 回传主窗口
//!              （overlay:captured）→ 主窗口 save_photo_capture；Esc → 取消。
//! @ai-context: 覆盖层窗口不持久（截完即销毁）；跨窗口通信走 IPC event 直传，
//!              不走 DB/文件（YAGNI）；当前 letterbox 路径保留为降级
//!              （覆盖层窗口创建失败时主窗口回退应用内框选）。
//! @ai-context: 截图临时文件（data_dir/overlay-tmp/snapshot.jpg）经 asset 协议
//!              供覆盖层窗口显示；主窗口裁剪与 OCR 均不依赖前端 canvas（前端
//!              无 taint 问题——crop 收敛到后端 image crate）。
//! @ai-context: **建窗/关窗命令必须 async**（wry#583，与 capture-float 同因）——
//!              Windows 上同步 command 在主线程 WebView2 IPC 回调内执行
//!              WebviewWindowBuilder::build() 会死锁（完成回调依赖主线程派发）。

use base64::Engine;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::commands::AppState;

/// 框选矩形（图像像素坐标——覆盖层 1:1 显示，鼠标坐标即图像坐标）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// 覆盖层确认载荷（回传主窗口：裁剪 PNG base64——与 save_photo_capture 输入同源）。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayCapturedPayload {
    pub image_b64: String,
}

/// 覆盖层窗口标签。
pub const CAPTURE_OVERLAY_LABEL: &str = "capture-overlay";

/// 打开覆盖层截图：截屏 → 存临时文件 → 创建全屏透明覆盖层窗口（幂等）。
///
/// @ai-context: async（wry#583）——建窗不能在主线程/WebView2 IPC 回调内同步执行
///              （死锁，与 capture-float 同因）；截屏重活也移到线程池，不再卡主线程。
#[tauri::command]
pub async fn open_capture_overlay(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    // 1) 全屏快照（与 capture_screen_snapshot 同源——gdi_capture；一次性调用无状态）
    let frame = crate::capture::gdi_capture::gdi_capture(None, now_ms)
        .map_err(|e| format!("截屏失败: {}", e))?;
    let rgb = crate::image_store::bgra_to_rgb_public(&frame.bgraw, frame.width, frame.height)
        .ok_or_else(|| "截屏数据无效".to_string())?;
    // 2) 存 JPEG 临时文件（覆盖层窗口经 asset 协议显示；主窗口裁剪同源）
    let dir = state.data_dir.join("overlay-tmp");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建覆盖层临时目录失败: {}", e))?;
    let path = dir.join("snapshot.jpg");
    rgb.save(&path).map_err(|e| format!("保存覆盖层截图失败: {}", e))?;
    *state
        .overlay_image_path
        .lock()
        .map_err(|e| format!("覆盖层截图路径锁中毒: {}", e))? = Some(path);
    // 3) 创建覆盖层窗口（已存在则复用——幂等）
    if app.get_webview_window(CAPTURE_OVERLAY_LABEL).is_none() {
        let overlay = WebviewWindowBuilder::new(&app, CAPTURE_OVERLAY_LABEL, WebviewUrl::App("index.html?overlay=1".into()))
            .title("熵减截图")
            .decorations(false)
            .transparent(true)
            .fullscreen(true)
            .skip_taskbar(true)
            .always_on_top(true)
            .build()
            .map_err(|e| format!("创建覆盖层窗口失败: {}", e))?;
        // v0.16.1：框选窗同样禁用 WebView2 原生右键菜单（浏览器痕迹去除——失败仅日志）
        if let Err(e) = crate::browser_chrome::disable_default_context_menu(&overlay) {
            eprintln!("[browser-chrome] 框选窗禁用默认右键菜单失败: {e}");
        }
    }
    Ok(())
}

/// 覆盖层窗口取待选截图路径（convertFileSrc 显示用）。
#[tauri::command]
pub fn overlay_get_image(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let p = state
        .overlay_image_path
        .lock()
        .map_err(|e| format!("覆盖层截图路径锁中毒: {}", e))?;
    Ok(p.clone().map(|x| x.to_string_lossy().to_string()))
}

/// 覆盖层确认框选 → 后端裁剪 PNG base64 → overlay:captured 回传主窗口 → 关窗。
///
/// @ai-context: 裁剪在 Rust 侧完成（前端 canvas 可能被 asset 协议 taint——
///              裁剪收敛到 image crate，回传 base64 与旧 letterbox 路径同语义）。
/// @ai-context: async——由覆盖层窗口自身的 WebView2 IPC 回调发起，裁剪重活和
///              关窗均避免在主线程回调内同步执行（wry#583 同类风险）。
#[tauri::command]
pub async fn overlay_submit_capture(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    rect: OverlayRect,
) -> Result<(), String> {
    let path = {
        state
            .overlay_image_path
            .lock()
            .map_err(|e| format!("覆盖层截图路径锁中毒: {}", e))?
            .clone()
    }
    .ok_or_else(|| "无待选截图（先打开覆盖层）".to_string())?;
    let img = image::open(&path).map_err(|e| format!("读取覆盖层截图失败: {}", e))?;
    let (iw, ih) = (img.width(), img.height());
    let (x, y) = (rect.x.min(iw.saturating_sub(1)), rect.y.min(ih.saturating_sub(1)));
    let (w, h) = (rect.w.max(1).min(iw - x), rect.h.max(1).min(ih - y));
    let crop = image::imageops::crop_imm(&img, x, y, w, h).to_image();
    let mut buf = std::io::Cursor::new(Vec::new());
    let encoder = image::codecs::png::PngEncoder::new(&mut buf);
    crop.write_with_encoder(encoder)
        .map_err(|e| format!("裁剪 PNG 编码失败: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    let _ = app.emit("overlay:captured", OverlayCapturedPayload { image_b64: b64 });
    close_overlay(&app);
    Ok(())
}

/// 覆盖层取消（Esc）→ overlay:cancelled 通知主窗口 → 关窗，无副作用。
///
/// @ai-context: async——由覆盖层窗口自身 IPC 回调发起，关窗不在主线程回调内同步执行。
#[tauri::command]
pub async fn overlay_cancel(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("overlay:cancelled", ());
    close_overlay(&app);
    Ok(())
}

/// 关闭覆盖层窗口（不存在视为已关闭——幂等）。
///
/// @ai-context: 可能从 overlay 自身 IPC 回调链调用（submit/cancel）；
///              调用方已 async 化，此处仅销毁不阻塞（close 经 dispatcher 消息）。
fn close_overlay(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(CAPTURE_OVERLAY_LABEL) {
        let _ = window.close();
    }
}
