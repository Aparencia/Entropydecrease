/**
 * 剪贴板写入工具 — 三级降级链
 * Clipboard write utility with a 3-level fallback chain
 *
 * Electron 中 navigator.clipboard.writeText 不可靠：窗口短暂失焦（如点击
 * 触发焦点迁移、DevTools 抢占焦点）时抛 "Document is not focused"，
 * file:// 受限上下文下兼容性也差——内测反馈的 MCP 复制按钮失败即此根因。
 * 故 Electron 优先走主进程 clipboard 模块（IPC），浏览器用原生 Clipboard API，
 * 最后回退 execCommand 老方案，三级全部失败才返回 false。
 *
 * @ai-context: 通用工具函数，供 MCP 设置复制按钮、笔记/AI 摘要复制等场景复用。
 */

/**
 * 复制文本到剪贴板
 * @param text - 待复制文本
 * @returns 是否复制成功
 */
export async function copyText(text: string): Promise<boolean> {
  // 第 1 级：Electron 主进程 clipboard 模块（最可靠，不受窗口焦点状态影响）
  if (window.electronAPI?.invoke) {
    try {
      const res = (await window.electronAPI.invoke('clipboard:write-text', text)) as
        | { success?: boolean }
        | undefined;
      if (res?.success) return true;
    } catch { /* 落入下一级 */ }
  }

  // 第 2 级：Web Clipboard API（https/localhost 等安全上下文）
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 落入下一级 */ }

  // 第 3 级：传统 execCommand 方案（临时 textarea 选中后复制）
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
