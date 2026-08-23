//! 采集浮窗窗口命令（v0.12.0 M6，采集体验债；v0.12.3 死锁修复 + 交互/架构升级）。
//!
//! @ai-context: 采集中全屏看视频时，主导航/会话面板被遮挡——悬浮小窗
//!              （alwaysOnTop）常显状态/转写/控制，主面板与浮窗共用
//!              useLiveSessionEvents hook。浮窗为独立 Tauri 子窗口：
//!              alwaysOnTop/decorations:false/transparent/skipTaskbar/360×240，
//!              加载 index.html?float=1（App.tsx 按 URL query 渲染 CaptureFloatPanel）。
//! @ai-context: **必须 async 命令**（wry#583）：Windows 上同步 command 在 WebView2
//!              IPC 回调（主线程）内执行 WebviewWindowBuilder::build() 会死锁——
//!              CreateCoreWebView2ControllerWithOptions 完成回调需要主线程派发，
//!              而主线程正阻塞在回调内等待它（循环等待）。症状：新窗空白 +
//!              全应用不可点击（ASR 引擎线程独立不受影响）。async 命令在 tokio
//!              线程池执行，建窗经事件循环代理投递到主线程正常事件处理（与启动
//!              建窗同环境）。参见 tauri 2.11.5 webview_window.rs 的官方警告。
//! @ai-context: v0.12.3 架构升级：浮窗**常驻**（setup 预创建隐藏窗口——
//!              P2-10 秒开 + 零点击期建窗风险），打开/关闭改为 show/hide；
//!              预创建失败幂等回落为打开时懒创建。UI 状态（locked/topmost）
//!              Rust 侧单一来源（set_ignore_cursor_events 无 getter，必须自存），
//!              变更时 emit float:state 事件同步主窗按钮语义
//!              （浮窗化 ⇄ 收起 ⇄ 解锁点击穿透）。

use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::commands::AppState;

/// 浮窗标签（唯一标识；capabilities 中 capture-float 窗口需包含）。
pub const CAPTURE_FLOAT_LABEL: &str = "capture-float";
/// 浮窗状态事件名（主窗监听：按钮语义随 open/locked 切换）。
pub const FLOAT_STATE_EVENT: &str = "float:state";

/// 浮窗 UI 状态（Rust 侧单一来源；set_ignore_cursor_events 无 getter 必须自存）。
#[derive(Debug, Clone, Copy, Default)]
pub struct FloatUi {
    /// 点击穿透（锁定后浮窗不可点，主窗按钮/快捷键解锁）
    pub locked: bool,
    /// 是否置顶
    pub topmost: bool,
}

/// 对外状态视图（camelCase 契约——前端按钮语义数据源）。
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatUiView {
    pub open: bool,
    pub locked: bool,
    pub topmost: bool,
}

fn view(app: &tauri::AppHandle, ui: &FloatUi) -> FloatUiView {
    FloatUiView {
        open: app.get_webview_window(CAPTURE_FLOAT_LABEL).is_some(),
        locked: ui.locked,
        topmost: ui.topmost,
    }
}

fn emit_float_state(app: &tauri::AppHandle, ui: &FloatUi) {
    let _ = app.emit(FLOAT_STATE_EVENT, view(app, ui));
}

/// setup 预创建隐藏浮窗（P2-10：常驻秒开；失败回落为打开时懒创建——不阻断启动）。
///
/// @ai-context: setup 阶段主线程无 WebView2 回调嵌套，建窗安全（同主窗启动路径）；
///              隐藏窗口聚焦 false 不抢焦点；默认置顶（与用户偏好 topmost 合并
///              由 open_capture_float 应用）。
pub fn precreate_float(app: &tauri::AppHandle) {
    if app.get_webview_window(CAPTURE_FLOAT_LABEL).is_some() {
        return;
    }
    if let Err(e) = build_float_window(app, false) {
        eprintln!("[capture-float] 预创建失败（回落为打开时懒创建）: {}", e);
    }
}

/// 构建浮窗窗口（precreated=false 时可见并带焦点——懒创建打开路径）。
fn build_float_window(app: &tauri::AppHandle, precreated: bool) -> Result<WebviewWindow, String> {
    WebviewWindowBuilder::new(app, CAPTURE_FLOAT_LABEL, WebviewUrl::App("index.html?float=1".into()))
        .title("采集浮窗")
        .inner_size(360.0, 240.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(!precreated)
        .focused(!precreated)
        .build()
        .map_err(|e| format!("创建采集浮窗失败: {}", e))
}

/// 打开采集浮窗（幂等——已存在则前置显示并聚焦）。
///
/// @ai-context: ?float=1 让 App.tsx 渲染 CaptureFloatPanel；窗口不加载数据库/
///              采集引擎（纯前端消费 live:* 事件），创建失败返回错误由调用方
///              引导（浮窗是增强，失败不阻断采集主链路）。已存在时同步应用
///              stored topmost（precreated 窗口初态可能被用户关过置顶）。
/// @ai-context: async——见模块头注释（wry#583 主线程建窗死锁）。
#[tauri::command]
pub async fn open_capture_float(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ui = *state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    let window = match app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        Some(w) => w,
        None => build_float_window(&app, false)?,
    };
    window.show().map_err(|e| format!("显示采集浮窗失败: {}", e))?;
    window
        .set_always_on_top(ui.topmost)
        .map_err(|e| format!("设置浮窗置顶失败: {}", e))?;
    let _ = window.set_focus();
    emit_float_state(&app, &ui);
    Ok(())
}

/// 关闭采集浮窗（**隐藏**而非销毁——v0.12.3 常驻语义；重复调用幂等）。
///
/// @ai-context: 停止采集由 ClassroomPage / CaptureFloatPanel 调用；隐藏保留
///              webview 与事件订阅，重新打开秒显。窗口不存在视为已关闭。
/// @ai-context: async——浮窗自身按钮从浮窗的 WebView2 IPC 回调发起，
///              销毁/隐藏调用同样避免在主线程回调内同步执行（wry#583 风险类）。
#[tauri::command]
pub async fn close_capture_float(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        window.hide().map_err(|e| format!("隐藏采集浮窗失败: {}", e))?;
    }
    let ui = *state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    emit_float_state(&app, &ui);
    Ok(())
}

/// 设置浮窗点击穿透（锁定后浮窗只读显示、不拦截鼠标——看视频零遮挡）。
///
/// @ai-context: 解锁路径必须由主窗提供（锁定态浮窗自身不可点）：主窗按钮
///              Ctrl+Shift+F / 「解锁浮窗」调本命令 locked=false。返回最新状态
///              视图（前端按钮语义即时更新，事件通道兜底）。
#[tauri::command]
pub async fn float_set_locked(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    locked: bool,
) -> Result<FloatUiView, String> {
    if let Some(window) = app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        window
            .set_ignore_cursor_events(locked)
            .map_err(|e| format!("设置点击穿透失败: {}", e))?;
        if !locked {
            let _ = window.set_focus();
        }
    }
    let mut ui = state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    ui.locked = locked;
    let v = view(&app, &ui);
    emit_float_state(&app, &ui);
    Ok(v)
}

/// 设置浮窗置顶开关（不遮挡画面时可关掉，切换为普通窗口层级）。
#[tauri::command]
pub async fn float_set_topmost(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    topmost: bool,
) -> Result<FloatUiView, String> {
    if let Some(window) = app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        window
            .set_always_on_top(topmost)
            .map_err(|e| format!("设置置顶失败: {}", e))?;
    }
    let mut ui = state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    ui.topmost = topmost;
    let v = view(&app, &ui);
    emit_float_state(&app, &ui);
    Ok(v)
}

/// 浮窗当前状态（主窗挂载/快捷键语义同步；轻量读，无需 async）。
#[tauri::command]
pub fn float_state(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<FloatUiView, String> {
    let ui = *state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    Ok(view(&app, &ui))
}

/// 回主窗：显示 + 还原 + 聚焦主窗口（浮窗保留——回主窗不损失悬浮态）。
#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    main.show().map_err(|e| format!("显示主窗口失败: {}", e))?;
    let _ = main.unminimize();
    main.set_focus().map_err(|e| format!("聚焦主窗口失败: {}", e))?;
    Ok(())
}
