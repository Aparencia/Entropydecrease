/**
 * 全局快捷键管理器 — 注册/触发分发/释放
 * Global shortcut manager — register, dispatch, dispose
 *
 * @ai-context: 遍历 SHORTCUT_DEFS 声明表注册 globalShortcut；触发时向主窗口
 * 推送 'shortcut:triggered' 事件（payload.id 为分发键，withClipboardText 的
 * 定义附带剪贴板文本）。注册失败仅告警不阻断启动；will-quit 前必须调用
 * unregisterShortcuts 释放（globalShortcut 不随进程自动回收）。渲染侧由
 * shortcutDispatcher 按 id 路由处理。
 * @ai-context: Registers every entry in SHORTCUT_DEFS; on trigger pushes
 * 'shortcut:triggered' to the main window (payload.id is the dispatch key).
 * Registration failures are non-fatal; always dispose before quit.
 */
import { globalShortcut, clipboard, type BrowserWindow } from 'electron';
import { SHORTCUT_DEFS } from './shortcutDefs.js';
import { logger } from './logger.js';

let registered = false;

/**
 * 注册全部全局快捷键（app ready 后、主窗口创建后调用一次）。
 * @param getMainWindow 主窗口获取器——窗口可能重建（macOS activate），
 * 每次触发时实时获取，避免持有失效引用
 */
export function registerShortcuts(getMainWindow: () => BrowserWindow | null): void {
  if (registered) return;

  let okCount = 0;
  for (const def of SHORTCUT_DEFS) {
    const ok = globalShortcut.register(def.accelerator, () => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      const payload: Record<string, unknown> = { id: def.id };
      // capture-clipboard：剪贴板读取在主进程完成——窗口失焦时同样可用
      if (def.withClipboardText) {
        payload.text = clipboard.readText();
      }
      win.webContents.send('shortcut:triggered', payload);
    });
    if (ok) {
      okCount += 1;
      logger.info(`[Shortcut] registered "${def.id}" (${def.accelerator})`);
    } else {
      logger.warn(`[Shortcut] failed to register "${def.id}" (${def.accelerator}) — accelerator may be taken`);
    }
  }
  registered = true;
  logger.info(`[Shortcut] ${okCount}/${SHORTCUT_DEFS.length} global shortcuts registered`);
}

/** 释放全部全局快捷键（window-all-closed / 退出路径调用，幂等） */
export function unregisterShortcuts(): void {
  if (!registered) return;
  globalShortcut.unregisterAll();
  registered = false;
  logger.info('[Shortcut] all global shortcuts unregistered');
}
