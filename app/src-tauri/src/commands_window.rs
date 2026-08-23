//! 采集浮窗窗口命令（v0.12.0 M6，采集体验债）。
//!
//! @ai-context: 采集中全屏看视频时，主导航/会话面板被遮挡——悬浮小窗
//!              （alwaysOnTop）常显状态/转写/控制，主面板与浮窗共用
//!              useLiveSessionEvents hook。浮窗为独立 Tauri 子窗口：
//!              alwaysOnTop/decorations:false/transparent/skipTaskbar/360×240，
//!              加载 index.html?float=1（App.tsx 按 URL query 渲染 CaptureFloatPanel，
//!              不渲染主导航壳）。
//! @ai-context: 窗口不持久——停止采集后由 ClassroomPage 调 close_capture_float 销毁；
//!              幂等：重复打开时若已存在则直接返回（不叠窗）。

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// 浮窗标签（唯一标识；capabilities/default.json windows 列表需包含）。
pub const CAPTURE_FLOAT_LABEL: &str = "capture-float";

/// 打开采集浮窗（幂等——已存在直接返回，不重复创建）。
///
/// @ai-context: ?float=1 让 App.tsx 渲染 CaptureFloatPanel；窗口不加载数据库/
///              采集引擎（纯前端消费 live:* 事件），创建失败返回错误由调用方
///              引导（浮窗是增强，失败不阻断采集主链路）。
#[tauri::command]
pub fn open_capture_float(app: tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window(CAPTURE_FLOAT_LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, CAPTURE_FLOAT_LABEL, WebviewUrl::App("index.html?float=1".into()))
        .title("采集浮窗")
        .inner_size(360.0, 240.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| format!("创建采集浮窗失败: {}", e))?;
    Ok(())
}

/// 关闭采集浮窗（窗口不存在视为已关闭——幂等）。
///
/// @ai-context: 停止采集后由 ClassroomPage / CaptureFloatPanel 回主窗调用销毁；
///              幂等：不存在则无副作用（不报错）。
#[tauri::command]
pub fn close_capture_float(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        window.close().map_err(|e| format!("关闭采集浮窗失败: {}", e))?;
    }
    Ok(())
}
