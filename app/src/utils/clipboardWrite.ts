/**
 * clipboardWrite — 剪贴板文本写入工具（REQ-317 选区菜单「复制」动作）。
 *
 * @ai-context: 供 SelectionActionMenu 复制就地执行（正文选区右键菜单的菜单内
 *              复制）；**非应用内统一剪贴板通道**——事实口径：各复制入口各有
 *              其路径（浏览器/系统 Ctrl+C 主路径、BrowserChrome 行菜单直用
 *              execCommand 等），本模块只管菜单复制与其 execCommand 兜底。
 * @ai-context: WebView2 剪贴板 API 在安全上下文中可用，但权限拒绝/降级宿主
 *              需兜底——execCommand("copy") 经隐藏 textarea 路径。返回布尔
 *              成败，调用方按需展示反馈；Ctrl+C 键盘主路径始终不受影响。
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
    // Why 兜底前记录宿主选区：ta.select() 会把文档选区替换为兜底 textarea——
    // 复制成功回执后若不清除会**毁掉用户选区**（阅读态正文高亮选区/编辑态
    // CM 锚定都经文档 Selection 表达）；removeChild 后按原 Range 原样恢复，
    // 与 Ctrl+C 主路径“不动用户选区”的既有语义对齐（审查 P3-1）。
    const savedRanges = (() => {
      const sel = typeof document.getSelection === "function" ? document.getSelection() : null;
      if (!sel || sel.rangeCount === 0) return null;
      const ranges: Range[] = [];
      for (let i = 0; i < sel.rangeCount; i += 1) ranges.push(sel.getRangeAt(i).cloneRange());
      return ranges;
    })();
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
      if (savedRanges && savedRanges.length > 0) {
        const sel = document.getSelection();
        if (sel) {
          sel.removeAllRanges();
          for (const r of savedRanges) sel.addRange(r);
        }
      }
    }
    return ok;
  } catch {
    return false;
  }
}
