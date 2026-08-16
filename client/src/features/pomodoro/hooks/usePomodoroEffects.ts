/**
 * 番茄钟副作用 hook
 * @ai-context 监听 usePomodoroStore 的 lastAction 信号，触发视觉反馈（水墨涟漪）与通知权限请求
 *
 * 与 usePomodoroStore 配合使用：
 * - Store 负责状态变更及音效播放、会话持久化、浏览器通知（tick/skip/start 内联执行）
 * - 本 hook 仅负责 store 无法执行的 DOM 级副作用（涟漪动画、权限请求）
 *
 * 注意：不要在此重复播放音效或记录会话——store 已执行过，
 * 重复执行会导致会话统计翻倍（BUG：番茄会话重复记录）。
 *
 * 使用方式：在番茄钟页面顶层组件中调用一次即可
 * <code>usePomodoroEffects()</code>
 */

import { useEffect, useRef } from 'react';
import { usePomodoroActionSignal } from '../store/usePomodoroStore';
import { triggerInkRipple } from '@/lib/animation/InkRipple';

/**
 * 番茄钟副作用 hook
 * 挂载一次即可，自动监听 store 动作信号并触发对应副作用
 */
export function usePomodoroEffects(): void {
  const signal = usePomodoroActionSignal();
  const prevCounterRef = useRef<number>(signal.lastActionCounter);

  // ── 挂载时：通知权限请求 ─────────────────────────────────
  useEffect(() => {
    if (
      signal.settings.notificationEnabled &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch((err) => {
        console.debug('[usePomodoroEffects] request notification permission failed', err);
      });
    }
    // 仅在 mount 时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 监听动作信号 ─────────────────────────────────────────
  useEffect(() => {
    // 仅在计数器变化时触发（避免其他状态变化引起重复触发）
    if (signal.lastActionCounter === prevCounterRef.current) return;
    prevCounterRef.current = signal.lastActionCounter;

    // 音效/会话记录/浏览器通知均由 store 内联执行，此处仅处理视觉反馈
    if (signal.lastAction === 'phase_complete') {
      // 水墨涟漪反馈：每次阶段完成时触发
      triggerInkRipple(window.innerWidth / 2, window.innerHeight / 2);
    }
  }, [signal.lastActionCounter, signal.lastAction, signal]);
}
