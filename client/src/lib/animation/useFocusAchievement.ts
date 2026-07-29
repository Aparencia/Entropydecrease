/**
 * @file 专注成就系统 Hook
 * @description 追踪用户连续专注时长，满 10 分钟触发极光背景效果和通知
 * @ai-context 依赖 usePomodoroStore 的 isRunning/phase，与 useAmbientStore 联动
 *
 * 检测逻辑：
 * - 番茄钟 work 阶段 isRunning === true 开始计时
 * - isRunning === false 或 phase !== 'work' 时停止并重置
 * - 连续运行满 10 分钟时触发成就
 * - 触发后标记已触发，避免重复（本轮专注内）
 */
import { useEffect, useRef } from 'react';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';
import { useShallow } from 'zustand/react/shallow';
import { useAmbientStore } from './useAmbientState';
import { triggerInkRipple } from './InkRipple';

/** 成就触发阈值（秒）：10 分钟 */
const ACHIEVEMENT_THRESHOLD_SECONDS = 10 * 60;

/** 极光效果持续时间（ms） */
const AURORA_DURATION_MS = 30_000;

/** 专注间隔（秒）：每隔多久检查一次 */
const TICK_INTERVAL_SECONDS = 1;

export function useFocusAchievement() {
  const { isRunning, phase } = usePomodoroStore(
    useShallow((s) => ({
      isRunning: s.isRunning,
      phase: s.phase,
    })),
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredThisSessionRef = useRef(false);

  useEffect(() => {
    const isWorkRunning = isRunning && phase === 'work';

    if (isWorkRunning) {
      // 开始计时
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          const store = useAmbientStore.getState();
          const next = store.continuousFocusSeconds + TICK_INTERVAL_SECONDS;
          store.setContinuousFocusSeconds(next);

          // 达到阈值且本轮未触发过
          if (next >= ACHIEVEMENT_THRESHOLD_SECONDS && !triggeredThisSessionRef.current) {
            triggeredThisSessionRef.current = true;

            // 触发成就
            store.triggerFocusAchievement({
              triggeredAt: Date.now(),
              duration: next,
              message: '心流涌现 — 连续专注 10 分钟，深海为你绽放极光',
            });

            // 激活极光背景
            store.setAuroraActive(true);

            // 触发水墨涟漪（屏幕中心）
            triggerInkRipple(window.innerWidth / 2, window.innerHeight / 2);

            // 显示浏览器通知
            if (Notification.permission === 'granted') {
              new Notification('专注成就达成', {
                body: '连续专注 10 分钟，心流涌现！深海为你绽放极光',
                icon: '/favicon.svg',
              });
            }

            // 极光效果 30 秒后自动关闭
            setTimeout(() => {
              useAmbientStore.getState().setAuroraActive(false);
            }, AURORA_DURATION_MS);
          }

          // 更新专注强度（渐进增强）
          const intensity = Math.min(1, next / ACHIEVEMENT_THRESHOLD_SECONDS);
          store.setFocusIntensity(intensity);
        }, TICK_INTERVAL_SECONDS * 1000);
      }
    } else {
      // 停止计时并重置
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      triggeredThisSessionRef.current = false;
      useAmbientStore.getState().setContinuousFocusSeconds(0);
      useAmbientStore.getState().setFocusIntensity(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, phase]);
}
