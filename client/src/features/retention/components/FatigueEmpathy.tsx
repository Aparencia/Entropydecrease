/**
 * FatigueEmpathy — 疲劳共情（宪法 P2 · 觉察而非管控）
 * FatigueEmpathy — gentle surfacing suggestion (awareness, not control)
 *
 * @ai-context: 监听番茄相位迁移：连续完成 2 个工作会话而未经历真实休息
 * （跳过休息不重置计数）时，弹一次可忽略的共情建议；真实休息即恢复。
 * 无阻断、无负向语言、toast 天然可关闭。
 *
 * @ai-context: Watches pomodoro phase transitions; suggests surfacing after
 * consecutive work sessions without a real break. Fully dismissible.
 */
import { useEffect, useRef } from 'react';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';
import { useToast } from '@/components/ui/Toast';
import { shouldSuggestSurfacing, wasRealBreak, SURFACE_SUGGESTION_TEXT } from '../lib/fatigue';

export function FatigueEmpathy() {
  const { toast } = useToast();
  const workCount = useRef(0);
  const breakEnteredAt = useRef<number | null>(null);

  useEffect(() => {
    let prevPhase = usePomodoroStore.getState().phase;
    // 订阅相位迁移而非每帧状态，避免高频回调
    const unsub = usePomodoroStore.subscribe((s) => {
      if (s.phase === prevPhase) return;
      const from = prevPhase;
      prevPhase = s.phase;

      // 工作→休息：累计一次连续深潜，记录休息入口时刻
      if (from === 'work' && (s.phase === 'short_break' || s.phase === 'long_break')) {
        workCount.current += 1;
        breakEnteredAt.current = Date.now();
        if (shouldSuggestSurfacing(workCount.current)) {
          toast({ type: 'info', message: SURFACE_SUGGESTION_TEXT });
          workCount.current = 0; // 建议后重新计数，避免唠叨
        }
        return;
      }
      // 休息→工作：停留时长达标=真休息（重置）；跳过/提前返回不重置
      if ((from === 'short_break' || from === 'long_break') && s.phase === 'work') {
        const planned = from === 'short_break' ? s.settings.shortBreakDuration : s.settings.longBreakDuration;
        const elapsed = breakEnteredAt.current ? Date.now() - breakEnteredAt.current : 0;
        if (wasRealBreak(elapsed, planned)) workCount.current = 0;
        breakEnteredAt.current = null;
      }
    });
    return unsub;
  }, [toast]);

  return null;
}
