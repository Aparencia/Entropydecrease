/**
 * 卡壳救援面板 hook（含 Ctrl+Shift+H 快捷键）
 * Stuck-rescue panel hook (incl. Ctrl+Shift+H shortcut)
 *
 * @ai-context: 从 NoteEditPage 拆出。救援面板开关 + useStuckTimer 卡壳计时；
 * 达到阈值时同步发射助手事件（T4 孵化效应：驱动学伴主动触发气泡），并广播
 * rescue:show-incubation 供全局监听。Ctrl+Shift+H 快捷键打开面板并启动计时。
 * @ai-context: Extracted from NoteEditPage. Rescue-panel toggle + useStuckTimer
 * stuck timer; on threshold it emits the assistant event (T4 incubation: drives
 * the learning companion bubble) and dispatches rescue:show-incubation for
 * global listeners. Ctrl+Shift+H opens the panel and starts the timer.
 */
import { useEffect, useState } from 'react';
import { useStuckTimer } from '@/hooks/useStuckTimer';
import { assistantEventBus } from '@/features/assistant/lib/eventBus';

/**
 * 返回救援面板开关与卡壳计时器（含快捷键监听）。
 * Returns rescue toggle and stuck timer (with shortcut listener).
 */
export function useNoteRescue() {
  // === 卡壳救援 ===
  const [rescueOpen, setRescueOpen] = useState(false);
  const stuckTimer = useStuckTimer({
    onThreshold: () => {
      window.dispatchEvent(new Event('rescue:show-incubation'));
      // @ai-context: T4 孵化效应——同步发射助手事件，驱动学伴主动触发气泡
      assistantEventBus.emit('stuck:incubation', {
        currentHour: new Date().getHours(),
        stuckSource: 'note',
      });
    },
  });

  // Ctrl+Shift+H 快捷键打开救援面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setRescueOpen(true);
        stuckTimer.start();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stuckTimer]);

  return { rescueOpen, setRescueOpen, stuckTimer };
}
