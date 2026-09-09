/**
 * clipboardWrite — 应用内统一剪贴板写入（REQ-317 选区菜单复制动作）。
 *
 * @ai-context: WebView2 剪贴板 API 在安全上下文中可用，但权限拒绝/降级宿主
 *              需兜底——execCommand("copy") 经隐藏 textarea 路径（BrowserChrome/
 *              行菜单既有模式）。返回布尔成败，调用方按需展示反馈；
 *              Ctrl+C 键盘主路径始终不受影响。
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限拒绝/不可用 → 落兜底路径（不吞掉反馈权）
    }
  }
  try {
    if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // 视觉隐藏但保持可选中（opacity/position 方案，避免 display:none 不可选）
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
    return ok;
  } catch {
    return false;
  }
}
