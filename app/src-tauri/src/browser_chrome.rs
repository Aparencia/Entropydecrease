//! browser_chrome — WebView2 浏览器痕迹去除（v0.16.1 用户决定①）。
//!
//! @ai-context: 桌面应用右键默认弹出 WebView2 原生菜单（复制/粘贴/检查元素），
//!              用户观感是"这是浏览器"且暴露调试入口——v0.16.1 起全局禁用：
//!              经 wry Windows 扩展 with_webview → ICoreWebView2Controller →
//!              CoreWebView2() → Settings() 的 AreDefaultContextMenusEnabled(false)
//!              （W3C 标准的 contextmenu preventDefault 在 WebView2 下不保证抑制
//!              原生菜单，host 侧设置才是可靠通道；前端另有 preventDefault 兜底）。
//!              文本输入（textarea/input）的右键粘贴/复制由前端自绘小菜单补齐
//!              （BrowserChrome 组件），本模块只管"原生菜单消失"。
//!              失败策略：仅日志、不阻断（降级=回到原生菜单，前端叠加自绘菜单）。

/// 禁用单个窗口内 WebView2 的原生右键菜单（失败仅日志——降级不阻断启动）。
///
/// 调用点：主窗（lib.rs setup）与浮窗/框选窗（建窗后）。关闭窗口前后幂等。
#[cfg(target_os = "windows")]
pub fn disable_default_context_menu(win: &tauri::WebviewWindow) -> tauri::Result<()> {
    win.with_webview(|wv| {
        let controller = wv.controller();
        // SAFETY: controller 由 wry 持有、与当前 webview 生命周期一致——仅在闭包内使用。
        unsafe {
            // Settings 在 ICoreWebView2 上（controller.CoreWebView2() 取 webview）
            if let Ok(webview) = controller.CoreWebView2() {
                if let Ok(settings) = webview.Settings() {
                    if let Err(e) = settings.SetAreDefaultContextMenusEnabled(false) {
                        eprintln!("[browser-chrome] SetAreDefaultContextMenusEnabled(false) 失败: {e}");
                    }
                } else {
                    eprintln!("[browser-chrome] 获取 WebView2 settings 失败");
                }
            } else {
                eprintln!("[browser-chrome] 获取 ICoreWebView2 失败");
            }
        }
    })
}

/// 非 Windows 平台无 WebView2 原生菜单概念——空实现（保调用点代码统一）。
#[cfg(not(target_os = "windows"))]
pub fn disable_default_context_menu(_win: &tauri::WebviewWindow) -> tauri::Result<()> {
    Ok(())
}
