/**
 * useAnchorReminder — T2 记忆锚点定时提醒
 *
 * @ai-context: work 阶段运行中每 12 分钟调用 AI 锚点生成（content=当前目标），
 * 取最重要锚点的一句话要点供浮层展示；AI 失败静默跳过，绝不打扰专注。
 */
import { useEffect, useRef, useState } from 'react';
import { useAIAnchorPoint } from '@/lib/ai/hooks/useAIAnchorPoint';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';

/** 提醒间隔：12 分钟 */
const INTERVAL_MS = 12 * 60 * 1000;
/** 检查粒度：30 秒一次轮询（兼容暂停后恢复） */
const TICK_MS = 30 * 1000;
/** 浮层自动消失时间：15 秒 */
export const ANCHOR_DISPLAY_MS = 15 * 1000;

/**
 * 记忆锚点提醒 hook
 * @returns 当前展示的锚点一句话（null 表示不展示）
 */
export function useAnchorReminder(): string | null {
  const { phase, isRunning, isPaused, currentGoal } = usePomodoroStore(useShallow(s => ({
    phase: s.phase, isRunning: s.isRunning, isPaused: s.isPaused, currentGoal: s.currentGoal,
  })));
  const active = phase === 'work' && isRunning && !isPaused;

  const { generateAnchorPoints } = useAIAnchorPoint();
  const [anchorText, setAnchorText] = useState<string | null>(null);
  const lastFiredRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!active || !currentGoal) return undefined;
    // 新会话启动时重置计时，确保首次提醒在 12 分钟后
    if (lastFiredRef.current === 0) lastFiredRef.current = Date.now();

    const timer = setInterval(() => {
      if (busyRef.current) return;
      const now = Date.now();
      if (now - lastFiredRef.current < INTERVAL_MS) return;
      lastFiredRef.current = now;
      busyRef.current = true;
      generateAnchorPoints('pomodoro-focus', currentGoal)
        .then((result) => {
          const top = result?.anchorPoints
            ?.slice()
            .sort((a, b) => b.importance - a.importance)[0];
          if (top) setAnchorText(top.explanation || top.concept);
        })
        .catch(() => { /* AI 失败静默跳过 */ })
        .finally(() => { busyRef.current = false; });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [active, currentGoal, generateAnchorPoints]);

  // 会话停止时清空，浮层展示 15 秒后自动消失
  useEffect(() => {
    if (!active) { setAnchorText(null); return undefined; }
    if (!anchorText) return undefined;
    const t = setTimeout(() => setAnchorText(null), ANCHOR_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [anchorText, active]);

  return anchorText;
}
