//! 采集浮窗窗口命令（v0.12.0 M6，采集体验债；v0.12.3 死锁修复 + 交互/架构升级；
//! v0.12.6 显隐链路修复 + 全局快捷键）。
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
//!              变更时 emit float:state 事件同步主窗按钮语义。
//! @ai-context: v0.12.6 显隐链路修复（ADR-025）：① 预创建误传 visible=true——
//!              浮窗启动即显示抢焦点（用户报告"自动启动"），修复为隐藏预创建；
//!              ② 浮窗出现 → **主窗隐藏**（用户要求"出现后主页面隐藏"），
//!              收起/停止 → 主窗回显（绝不把用户留在无可见窗口）；
//!              ③ 锁定（点击穿透）后浮窗自身不可点、主窗又已隐藏——解锁唯一
//!              路径为**全局快捷键 Ctrl+Shift+F**（tray 级无解的分区点击穿透，
//!              tauri 2.11 无 set_cursor_hit_test），注册窗口期=浮窗打开期。

use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::commands::AppState;

/// 浮窗标签（唯一标识；capabilities 中 capture-float 窗口需包含）。
pub const CAPTURE_FLOAT_LABEL: &str = "capture-float";
/// 主窗标签（tauri.conf.json 未显式命名——tauri 默认 "main"）。
pub const MAIN_WINDOW_LABEL: &str = "main";
/// 浮窗状态事件名（主窗监听：按钮语义随 open/locked 切换）。
pub const FLOAT_STATE_EVENT: &str = "float:state";
/// 浮窗全局快捷键（进程级——锁定态浮窗/隐藏主窗下仍可用；ADR-025）。
pub const FLOAT_SHORTCUT: &str = "Ctrl+Shift+F";

/// 浮窗 UI 状态（Rust 侧单一来源；set_ignore_cursor_events 无 getter 必须自存）。
#[derive(Debug, Clone, Copy, Default)]
pub struct FloatUi {
    /// 是否**显示**（open 语义）。预创建常驻后窗口对象恒存在，
    /// 不能用 get_webview_window 存在性判定 open——否则按钮语义恒为
    /// "收起"且永远无法重新打开（审查 P0，v0.12.3 审查即修）。
    pub open: bool,
    /// 点击穿透（锁定后浮窗不可点，全局快捷键解锁）
    pub locked: bool,
    /// 是否置顶
    pub topmost: bool,
}

/// 对外状态视图（camelCase 契约——前端按钮语义数据源；纯函数构造可单测）。
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatUiView {
    pub open: bool,
    pub locked: bool,
    pub topmost: bool,
}

fn view(ui: &FloatUi) -> FloatUiView {
    FloatUiView {
        open: ui.open,
        locked: ui.locked,
        topmost: ui.topmost,
    }
}

fn emit_float_state(app: &tauri::AppHandle, ui: &FloatUi) {
    let _ = app.emit(FLOAT_STATE_EVENT, view(ui));
}

/// 三态切换纯状态机（可单测）：关→开 / 开未锁→收起（回主窗） / 开已锁→解锁。
enum FloatAction {
    Open,
    Close,
    Unlock,
}

fn next_action(ui: &FloatUi) -> FloatAction {
    if !ui.open {
        FloatAction::Open
    } else if ui.locked {
        FloatAction::Unlock
    } else {
        FloatAction::Close
    }
}

/// setup 预创建隐藏浮窗（P2-10：常驻秒开；失败回落为打开时懒创建——不阻断启动）。
///
/// @ai-context: setup 阶段主线程无 WebView2 回调嵌套，建窗安全（同主窗启动路径）；
///              隐藏窗口聚焦 false 不抢焦点（v0.12.6 修复：原实现误传
///              precreated=false → visible(true) 启动即显示，用户报告"自动启动"）。
pub fn precreate_float(app: &tauri::AppHandle) {
    if app.get_webview_window(CAPTURE_FLOAT_LABEL).is_some() {
        return;
    }
    if let Err(e) = build_float_window(app, true) {
        eprintln!("[capture-float] 预创建失败（回落为打开时懒创建）: {}", e);
    }
}

/// 构建浮窗窗口（precreated=true → 隐藏未聚焦——预创建路径；false → 可见带焦点——懒创建打开路径）。
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

/// 显示 + 还原 + 聚焦主窗（回主窗/收起浮窗后的兜底——绝不把用户留在无可见窗口）。
///
/// @ai-context: v0.12.6：浮窗打开后主窗隐藏；所有"离开浮窗"路径（收起/停止采集/
///              回主窗）必须回显主窗，否则用户面对空桌面。
fn show_main_core(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// 全局快捷键注册（浮窗打开期间有效——进程级热键冲突面最小化）。
fn register_float_shortcut(app: &tauri::AppHandle) {
    if let Err(e) = app.global_shortcut().register(FLOAT_SHORTCUT) {
        eprintln!("[capture-float] 全局快捷键注册失败（不影响浮窗使用）: {}", e);
    }
}

/// 全局快捷键注销（幂等——未注册/重复调用均无副作用）。
fn unregister_float_shortcut(app: &tauri::AppHandle) {
    let _ = app.global_shortcut().unregister(FLOAT_SHORTCUT);
}

/// 浮窗打开核心：显示浮窗 + 主窗隐藏（用户要求：浮窗出现后主页面隐藏）。
fn float_open_core(app: &tauri::AppHandle) -> Result<(), String> {
    // State 绑定到局部变量——app.state() 临时值在语句末释放会导致锁守卫借用失效
    let state = app.state::<AppState>();
    let topmost = state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?
        .topmost;
    let window = match app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        Some(w) => w,
        None => build_float_window(app, false)?,
    };
    window.show().map_err(|e| format!("显示采集浮窗失败: {}", e))?;
    window
        .set_always_on_top(topmost)
        .map_err(|e| format!("设置浮窗置顶失败: {}", e))?;
    // 浮窗出现 → 主页面隐藏（顺序：先显示浮窗再隐藏主窗，避免无窗口空窗）
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main.hide();
    }
    let _ = window.set_focus();
    {
        let mut ui = state
            .float_ui
            .lock()
            .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
        ui.open = true;
        emit_float_state(app, &ui);
    }
    // 锁定态浮窗不可点且主窗已隐藏——全局快捷键是唯一解锁/切换入口（ADR-025）
    register_float_shortcut(app);
    Ok(())
}

/// 浮窗收起核心：隐藏浮窗 + 主窗回显（绝不留在无可见窗口）。
fn float_close_core(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        window.hide().map_err(|e| format!("隐藏采集浮窗失败: {}", e))?;
    }
    {
        let state = app.state::<AppState>();
        let mut ui = state
            .float_ui
            .lock()
            .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
        ui.open = false;
        emit_float_state(app, &ui);
    }
    unregister_float_shortcut(app);
    show_main_core(app);
    Ok(())
}

/// 锁定/解锁核心（锁定=点击穿透——浮窗只读不拦截鼠标，看视频零遮挡）。
fn float_set_locked_core(app: &tauri::AppHandle, locked: bool) -> Result<FloatUiView, String> {
    if let Some(window) = app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        window
            .set_ignore_cursor_events(locked)
            .map_err(|e| format!("设置点击穿透失败: {}", e))?;
        if !locked {
            let _ = window.set_focus();
        }
    }
    let state = app.state::<AppState>();
    let mut ui = state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    ui.locked = locked;
    let v = view(&ui);
    emit_float_state(app, &ui);
    Ok(v)
}

/// 浮窗三态切换核心（全局快捷键 + 主窗按钮共用——单一语义，防双通道漂移）。
///
/// @ai-context: 主窗快捷键原为窗口级 keydown + 按钮各写三态分支；全局快捷键
///              注册后主窗键与全局键会同时触发（双翻转净零）——语义收拢到
///              本函数，前端仅剩按钮标签由 float:state 事件驱动。
pub(crate) fn float_toggle_core(app: &tauri::AppHandle) -> Result<FloatUiView, String> {
    let state = app.state::<AppState>();
    let ui = *state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    match next_action(&ui) {
        FloatAction::Open => float_open_core(app)?,
        FloatAction::Close => float_close_core(app)?,
        FloatAction::Unlock => {
            float_set_locked_core(app, false)?;
        }
    }
    let after = state.float_ui.lock().map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    Ok(view(&after))
}

/// 打开采集浮窗（幂等——已存在则前置显示并聚焦）。
///
/// @ai-context: ?float=1 让 App.tsx 渲染 CaptureFloatPanel；窗口不加载数据库/
///              采集引擎（纯前端消费 live:* 事件），创建失败返回错误由调用方
///              引导（浮窗是增强，失败不阻断采集主链路）。已存在时同步应用
///              stored topmost（precreated 窗口初态可能被用户关过置顶）。
/// @ai-context: async——见模块头注释（wry#583 主线程建窗死锁）。
#[tauri::command]
pub async fn open_capture_float(app: tauri::AppHandle) -> Result<(), String> {
    float_open_core(&app)
}

/// 关闭采集浮窗（**隐藏**而非销毁——v0.12.3 常驻语义；重复调用幂等）。
///
/// @ai-context: 停止采集由 ClassroomPage / CaptureFloatPanel 调用；隐藏保留
///              webview 与事件订阅，重新打开秒显。窗口不存在视为已关闭。
///              v0.12.6：收起后主窗回显（主窗可能随浮窗打开被隐藏）。
/// @ai-context: async——浮窗自身按钮从浮窗的 WebView2 IPC 回调发起，
///              销毁/隐藏调用同样避免在主线程回调内同步执行（wry#583 风险类）。
#[tauri::command]
pub async fn close_capture_float(app: tauri::AppHandle) -> Result<(), String> {
    float_close_core(&app)
}

/// 浮窗三态切换（主窗按钮/快捷键共用；返回最新状态视图）。
#[tauri::command]
pub async fn float_toggle(app: tauri::AppHandle) -> Result<FloatUiView, String> {
    float_toggle_core(&app)
}

/// 设置浮窗点击穿透（锁定后浮窗只读显示、不拦截鼠标——看视频零遮挡）。
///
/// @ai-context: 解锁路径：浮窗打开期间全局快捷键 Ctrl+Shift+F（ADR-025——
///              锁定态浮窗自身不可点、主窗已隐藏，窗口级点击穿透无法分区）；
///              返回最新状态视图（前端按钮语义即时更新，事件通道兜底）。
#[tauri::command]
pub async fn float_set_locked(
    app: tauri::AppHandle,
    locked: bool,
) -> Result<FloatUiView, String> {
    float_set_locked_core(&app, locked)
}

/// 设置浮窗置顶开关（不遮挡画面时可关掉，切换为普通窗口层级）。
#[tauri::command]
pub async fn float_set_topmost(
    app: tauri::AppHandle,
    topmost: bool,
) -> Result<FloatUiView, String> {
    if let Some(window) = app.get_webview_window(CAPTURE_FLOAT_LABEL) {
        window
            .set_always_on_top(topmost)
            .map_err(|e| format!("设置置顶失败: {}", e))?;
    }
    let state = app.state::<AppState>();
    let mut ui = state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    ui.topmost = topmost;
    let v = view(&ui);
    emit_float_state(&app, &ui);
    Ok(v)
}

/// 浮窗当前状态（主窗挂载/快捷键语义同步；轻量读，无需 async）。
#[tauri::command]
pub fn float_state(state: State<'_, AppState>) -> Result<FloatUiView, String> {
    let ui = *state
        .float_ui
        .lock()
        .map_err(|e| format!("浮窗状态锁中毒: {}", e))?;
    Ok(view(&ui))
}

/// 回主窗：显示 + 还原 + 聚焦主窗口（浮窗保留——回主窗不损失悬浮态）。
#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    show_main_core(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 审查即修（v0.12.3）：open 必须是显式状态——常驻预创建后窗口对象恒存在，
    /// 不能用 get_webview_window 存在性判定（否则 open 恒 true，主窗按钮
    /// 永远显示"收起"且无法再次打开）。
    #[test]
    fn float_ui_view_open_is_explicit_state() {
        let ui = FloatUi { open: false, locked: true, topmost: false };
        let v = view(&ui);
        let json = serde_json::to_value(v).expect("序列化失败");
        assert_eq!(json["open"], false, "open 必须为显式状态（预创建存在≠显示）");
        assert_eq!(json["locked"], true);
        assert_eq!(json["topmost"], false);
        // camelCase 契约锚定（前端直接消费该 JSON 键）
        assert!(json.get("open").is_some() && json.get("locked").is_some() && json.get("topmost").is_some());
    }

    /// v0.12.6：三态切换状态机（关→开 / 开未锁→收起 / 开已锁→解锁）。
    #[test]
    fn float_next_action_machine() {
        assert!(matches!(next_action(&FloatUi { open: false, locked: false, topmost: true }), FloatAction::Open));
        assert!(matches!(next_action(&FloatUi { open: false, locked: true, topmost: true }), FloatAction::Open));
        assert!(matches!(next_action(&FloatUi { open: true, locked: false, topmost: true }), FloatAction::Close));
        assert!(matches!(next_action(&FloatUi { open: true, locked: true, topmost: false }), FloatAction::Unlock));
    }
}
