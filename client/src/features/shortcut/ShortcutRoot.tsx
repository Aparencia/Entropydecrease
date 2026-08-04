/**
 * 全局快捷键根组件 — 订阅主进程触发事件并接线各 handler
 * Shortcut root — subscribes to main-process triggers and wires handlers
 *
 * @ai-context: 在 App.tsx 挂载一次（ToastProvider 内）。capture-clipboard
 * 在此接线：剪贴板文本经 inboxRepository 入库（含去重），toast 反馈结果；
 * 失败静默降级（剪贴板为空/非 Electron 环境直接忽略）。组件卸载时
 * 注销订阅与 handler，避免重复监听。
 * @ai-context: Mounted once inside ToastProvider. Wires capture-clipboard to
 * the inbox repository with dedupe and toast feedback; degrades silently on
 * empty clipboard or missing IPC. Cleans up subscription on unmount.
 */
import { useEffect } from 'react';
import { useToast } from '@/components/ui';
import { registerShortcutHandler, unregisterShortcutHandler, dispatchShortcut } from './shortcutDispatcher';
import { captureClipboardText } from '@/features/inbox/lib/inboxRepository';

export function ShortcutRoot() {
  const { toast } = useToast();

  useEffect(() => {
    const api = window.electronAPI;

    registerShortcutHandler('capture-clipboard', async (payload) => {
      const text = payload.text?.trim();
      if (!text) {
        toast({ type: 'info', message: '剪贴板为空，未收藏任何内容' });
        return;
      }
      const result = await captureClipboardText(text);
      if (!result) {
        toast({ type: 'error', message: '收藏失败，请重试' });
        return;
      }
      toast({
        type: result.duplicated ? 'info' : 'success',
        message: result.duplicated ? '该内容 24h 内已收藏过' : '已收藏到收件箱',
      });
    });

    const unsubscribe = api?.onShortcutTriggered(dispatchShortcut);
    return () => {
      unsubscribe?.();
      unregisterShortcutHandler('capture-clipboard');
    };
  }, [toast]);

  return null;
}
