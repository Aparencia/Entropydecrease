//! 图文会话 Tauri commands（v0.11.7，ADR-020）。
//!
//! @ai-context: 第三采集动线编排：start（创建 kind=photo 会话 + 互斥 + 图片库
//!              store 常驻）→ capture_screen_snapshot（全屏快照 base64，前端
//!              框选）→ save_photo_capture（截图落库 + OCR）→ finish/discard。
//! @ai-context: 本层只做参数校验、互斥、调用业务模块、错误映射（AGENTS.md §6）。
//! @ai-context: 互斥槽双字段——photo_session（会话 id）与 photo_store（长驻
//!              SessionImageStore，跨截图保持双指纹去重 FIFO 与预算计数）。

use base64::Engine;
use serde::Serialize;
use tauri::State;

use crate::commands::AppState;
use crate::image_store::SessionImageStore;
use crate::types::NewSession;

/// 全屏快照（前端遮罩显示用；JPEG 压缩省传输量——框选裁剪后走 PNG 无损回传）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSnapshot {
    /// JPEG base64（前端拼 data URL 前缀）
    pub base64: String,
    /// 图像物理像素宽（DPI 换算基准）
    pub width: u32,
    /// 图像物理像素高
    pub height: u32,
}

/// 互斥检查（纯函数，可单测）：实时捕获活跃或图文采集已占用 → Err。
/// @ai-context: 抽纯函数便于单测（命令层仅转发——AGENTS.md §6）；
///              互斥理由：图文与实时共享屏幕内容动线，避免状态混乱。
pub fn check_photo_mutex(live_active: bool, occupied: Option<i64>) -> Result<(), String> {
    if live_active {
        return Err("实时捕获进行中，请先停止再开始图文采集".to_string());
    }
    if occupied.is_some() {
        return Err("已有进行中的图文采集，请先完成或放弃".to_string());
    }
    Ok(())
}

/// 当前 Unix 毫秒（截图文件名时间戳；唯一且随真实时间推进）。
fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 开始图文采集：创建 kind=photo 会话（recording）并占用互斥槽。
///
/// @ai-context: 默认标题「图文会话」——前端生成带时间的标题传入
///              （JS Date 格式化，Rust 侧免引本地时间依赖）。
#[tauri::command]
pub fn start_photo_session(state: State<'_, AppState>, title: Option<String>) -> Result<i64, String> {
    #[cfg(target_os = "windows")]
    let live_active = state.live_session.active_session_id().is_some();
    #[cfg(not(target_os = "windows"))]
    let live_active = false;
    let mut guard = state.photo_session.lock().map_err(|_| "图文采集状态锁中毒".to_string())?;
    check_photo_mutex(live_active, *guard)?;
    let title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "图文会话".to_string());
    let session = state
        .db
        .create_session(&NewSession {
            title: title.chars().take(100).collect(),
            source_window: None,
            profile: None,
            kind: Some("photo".to_string()),
        })
        .map_err(|e| e.to_string())?;
    *guard = Some(session.id);
    // 长驻图片库 store（跨截图保持去重 FIFO 与预算计数——实时链路同模式）
    let dir = state.data_dir.join("session-images").join(session.id.to_string());
    let store = SessionImageStore::new(dir).map_err(|e| e.to_string())?;
    *state.photo_store.lock().map_err(|_| "图文图片库锁中毒".to_string())? = Some(store);
    Ok(session.id)
}

/// 捕获全屏快照（虚拟屏合并区域，多显示器支持）→ JPEG base64。
/// @ai-context: 无需 AppState（gdi_capture 一次性调用，无持久状态）。
#[tauri::command]
pub fn capture_screen_snapshot() -> Result<ScreenSnapshot, String> {
    let frame = crate::capture::gdi_capture::gdi_capture(None, now_unix_ms())
        .map_err(|e| format!("截屏失败: {}", e))?;
    let rgb = crate::image_store::bgra_to_rgb_public(&frame.bgraw, frame.width, frame.height)
        .ok_or_else(|| "截屏数据无效".to_string())?;
    // JPEG q0.85（仅前端显示用；OCR 输入走裁剪后 PNG 无损回传）
    let mut out = std::io::Cursor::new(Vec::new());
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85);
    rgb.write_with_encoder(encoder).map_err(|e| format!("快照编码失败: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(out.into_inner());
    Ok(ScreenSnapshot { base64: b64, width: frame.width, height: frame.height })
}

/// 保存框选截图 + OCR（PNG base64 无损回传）。
///
/// @ai-context: 三校验——互斥槽归属（防越权提交其他会话）+ 会话状态
///              （recording 才可继续截图）+ kind=photo 限定。
/// @ai-context: store 锁内调用业务函数（OCR ≤20s 有界等待；图文采集为
///              用户串行动线，同刻仅一个截图保存，锁时长可接受）。
#[tauri::command]
pub fn save_photo_capture(
    state: State<'_, AppState>,
    session_id: i64,
    image_b64: String,
) -> Result<crate::photo_capture::PhotoCaptureResult, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    if image_b64.trim().is_empty() {
        return Err("图片数据为空".to_string());
    }
    {
        let guard = state.photo_session.lock().map_err(|_| "图文采集状态锁中毒".to_string())?;
        if *guard != Some(session_id) {
            return Err("该会话不是进行中的图文采集".to_string());
        }
    }
    let session = state
        .db
        .get_session(session_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("会话不存在: {}", session_id))?;
    if session.kind.as_deref() != Some("photo") {
        return Err("该会话不是图文会话".to_string());
    }
    if session.status != "recording" {
        return Err("会话已结束，无法继续截图".to_string());
    }
    let mut guard = state.photo_store.lock().map_err(|_| "图文图片库锁中毒".to_string())?;
    let store = guard.as_mut().ok_or_else(|| "无进行中的图文图片库（请先开始图文采集）".to_string())?;
    crate::photo_capture::save_photo_capture(store, &state.db, &state.engines, session_id, &image_b64, now_unix_ms())
}

/// 完成图文采集：零截图 → 删除会话（不留空壳）；否则 finish。
#[tauri::command]
pub fn finish_photo_session(state: State<'_, AppState>, session_id: i64) -> Result<String, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let mut guard = state.photo_session.lock().map_err(|_| "图文采集状态锁中毒".to_string())?;
    if *guard != Some(session_id) {
        return Err("该会话不是进行中的图文采集".to_string());
    }
    let dir = state.data_dir.join("session-images").join(session_id.to_string());
    let has_images = SessionImageStore::new(dir.clone())
        .map(|s| !s.list_images().is_empty())
        .unwrap_or(false);
    if has_images {
        state.db.finish_session(session_id).map_err(|e| e.to_string())?;
    } else {
        state.db.delete_session(session_id).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&dir);
    }
    *guard = None;
    *state.photo_store.lock().map_err(|_| "图文图片库锁中毒".to_string())? = None;
    Ok(if has_images {
        format!("图文会话 #{} 已保存", session_id)
    } else {
        "无截图，会话已删除（不留空壳）".to_string()
    })
}

/// 放弃图文采集：删除会话（外键级联子表 + 清理图片库目录）。
#[tauri::command]
pub fn discard_photo_session(state: State<'_, AppState>, session_id: i64) -> Result<(), String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    let mut guard = state.photo_session.lock().map_err(|_| "图文采集状态锁中毒".to_string())?;
    if *guard != Some(session_id) {
        return Err("该会话不是进行中的图文采集".to_string());
    }
    state.db.delete_session(session_id).map_err(|e| e.to_string())?;
    let dir = state.data_dir.join("session-images").join(session_id.to_string());
    let _ = std::fs::remove_dir_all(&dir);
    *guard = None;
    *state.photo_store.lock().map_err(|_| "图文图片库锁中毒".to_string())? = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutex_rejects_live_active() {
        let e = check_photo_mutex(true, None).unwrap_err();
        assert!(e.contains("实时捕获"));
    }

    #[test]
    fn mutex_rejects_occupied_photo() {
        let e = check_photo_mutex(false, Some(7)).unwrap_err();
        assert!(e.contains("已有进行中"));
    }

    #[test]
    fn mutex_allows_when_free() {
        assert!(check_photo_mutex(false, None).is_ok());
    }
}
