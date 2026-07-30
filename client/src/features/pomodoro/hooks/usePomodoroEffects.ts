/**
 * 番茄钟副作用 hook
 * @ai-context 监听 usePomodoroStore 的 lastAction 信号，触发音效、通知、成就检测、会话记录
 *
 * 与 usePomodoroStore 配合使用：
 * - Store 仅负责纯状态变更（计时器 tick、阶段切换、设置更新）
 * - 本 hook 负责所有副作用（音效播放、浏览器通知、成就检测、会话持久化）
 *
 * 使用方式：在番茄钟页面顶层组件中调用一次即可
 * <code>usePomodoroEffects()</code>
 */

import { useEffect, useRef } from 'react';
import { usePomodoroActionSignal } from '../store/usePomodoroStore';
import { recordSession, playCompletionSound, sendNotification } from '../store/usePomodoroPersistence';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { triggerInkRipple } from '@/lib/animation/InkRipple';
import type { PomodoroAction } from '../store/usePomodoroStore';

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
      Notification.requestPermission().catch(() => {});
    }
    // 仅在 mount 时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 监听动作信号 ─────────────────────────────────────────
  useEffect(() => {
    // 仅在计数器变化时触发（避免其他状态变化引起重复触发）
    if (signal.lastActionCounter === prevCounterRef.current) return;
    prevCounterRef.current = signal.lastActionCounter;

    const action: PomodoroAction | null = signal.lastAction;
    if (!action) return;

    switch (action) {
      case 'start':
        soundPlayer.play('pomodoro_start');
        break;

      case 'pause':
        soundPlayer.play('pomodoro_pause');
        break;

      case 'exit_immersive':
        soundPlayer.play('pomodoro_pause');
        break;

      case 'tick_5min_warning':
        // store 已确保 mode !== 'class' 时才发出此信号
        soundPlayer.play('pomodoro_5min_warning');
        break;

      case 'tick_final':
        // store 已确保 mode !== 'class' 时才发出此信号
        soundPlayer.play('pomodoro_tick_final');
        break;

      case 'phase_complete':
        handlePhaseComplete(signal);
        break;
    }
  }, [signal.lastActionCounter, signal.lastAction, signal]);
}

// ─────────────────────────────────────────────────────────────
// 内部：phase_complete 副作用处理
// ─────────────────────────────────────────────────────────────

interface PhaseCompletePayload {
  lastCompletedPhase: 'work' | 'short_break' | 'long_break' | null;
  isCycleComplete: boolean;
  lastSessionActualDuration: number | null;
  mode: 'class' | 'self_study';
  settings: {
    soundEnabled: boolean;
    notificationEnabled: boolean;
    workDuration: number;
    classDuration: number;
  };
  currentGoal: string | null;
}

function handlePhaseComplete(payload: PhaseCompletePayload): void {
  const {
    lastCompletedPhase,
    isCycleComplete,
    lastSessionActualDuration,
    mode,
    settings,
    currentGoal,
  } = payload;

  if (!lastCompletedPhase) return;

  // ── 水墨涟漪反馈：每次阶段完成时触发 ────────────────
  triggerInkRipple(window.innerWidth / 2, window.innerHeight / 2);

  // ── 记录会话（仅 work 阶段） ─────────────────────────────
  if (lastCompletedPhase === 'work') {
    const workMinutes = mode === 'class' ? settings.classDuration : settings.workDuration;
    const actualDuration = lastSessionActualDuration ?? workMinutes * 60;

    recordSession({
      mode,
      duration: workMinutes * 60,
      actualDuration,
      completedAt: new Date(),
      interrupted: false,
      goal: currentGoal ?? undefined,
    })
      .then(() => {
        // 触发成就检查（动态 import 避免循环依赖）
        import('@/lib/achievements/evaluator')
          .then(({ checkAchievements }) => {
            checkAchievements({ type: 'pomodoro_completed' })
              .then((unlocked) => {
                unlocked.forEach((a) => {
                  window.dispatchEvent(
                    new CustomEvent('achievement-unlocked', { detail: a }),
                  );
                });
              })
              .catch(() => {});
          })
          .catch(() => {});
      })
      .catch(() => {});
  }

  // ── 播放音效（上课模式静默） ──────────────────────────────
  if (mode !== 'class') {
    if (settings.soundEnabled) {
      playCompletionSound();
    }
    if (lastCompletedPhase === 'work') {
      soundPlayer.play('pomodoro_work_complete');
    } else {
      soundPlayer.play('pomodoro_break_end');
      if (isCycleComplete) {
        soundPlayer.play('pomodoro_complete');
      }
    }
  }

  // ── 发送浏览器通知 ────────────────────────────────────────
  if (settings.notificationEnabled) {
    if (lastCompletedPhase === 'work') {
      sendNotification('又添了一段暖意', '继续深潜吧 ☕').catch(() => {});
    } else {
      sendNotification('休息结束！', '开始下一个番茄 🍅').catch(() => {});
    }
  }
}
