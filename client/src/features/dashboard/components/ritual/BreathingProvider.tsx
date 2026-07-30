/**
 * BreathingProvider — 呼吸容器（单一 RAF 源 + 相位广播 + CSS 变量律动）
 * Breathing container (single RAF source + phase broadcast + CSS rhythm)
 *
 * @ai-context: RIT-01 呼吸即容器（决策 2）——全仪式期间唯一的 RAF 循环在
 * 此运行；相位文字/圈数状态仅在"相位切换"时 setState（16s 仅 4 次），
 * 振幅类视觉全部通过写 CSS 变量 `--breath-scale`（root 元素）驱动，
 * 消费方用 `scale: var(--breath-scale)` 订阅，零额外重渲染（RIT-23）。
 * @ai-context: RIT-16/降级——prefers-reduced-motion 或低帧探针命中时停止
 * RAF、输出静态相位、`--breath-scale` 固定为 1；相位切换回调 onPhaseChange
 * 供音效对齐（RIT-14）。Single RAF for the whole ritual; text state updates
 * only on phase change; amplitude driven via a CSS variable.
 */
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { BreathingPhase, BreathingState } from '../../types';
import { calculateBreathingPhase } from '../../utils/breathing';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BreathingContext } from './breathingContext';

/** 低帧探针阈值：连续采样低于此 fps 触发降级 */
const LOW_FPS = 30;

interface Props {
  children: ReactNode;
  /** 相位切换回调（供音效对齐 RIT-14） */
  onPhaseChange?: (phase: BreathingPhase) => void;
  /** 每完成一整圈回调（供 RIT-17 一圈点亮 / 计数） */
  onCycleComplete?: (cycleCount: number) => void;
}

export function BreathingProvider({ children, onPhaseChange, onCycleComplete }: Props) {
  const reducedMotion = useReducedMotion();
  const [breathing, setBreathing] = useState<BreathingState>(() => calculateBreathingPhase(0));
  const [completedCycles, setCompletedCycles] = useState(0);
  const [lowFps, setLowFps] = useState(false);
  const degraded = reducedMotion || lowFps;

  const rafRef = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // 回调装入 ref，避免作为 effect 依赖导致 RAF 重启
  const onPhaseRef = useRef(onPhaseChange);
  const onCycleRef = useRef(onCycleComplete);
  onPhaseRef.current = onPhaseChange;
  onCycleRef.current = onCycleComplete;

  /** 相位 → 振幅：吸气 1.0→1.06、屏息保持、呼气回落、屏息保持 */
  const scaleFor = useCallback((phase: BreathingPhase, progress: number): number => {
    switch (phase) {
      case 'inhale': return 1 + 0.06 * progress;
      case 'hold1': return 1.06;
      case 'exhale': return 1.06 - 0.06 * progress;
      default: return 1; // hold2
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (degraded) {
      root?.style.setProperty('--breath-scale', '1');
      return;
    }

    const start = performance.now();
    let lastPhase: BreathingPhase = breathing.phase;
    let lastCycle = 0;
    // fps 探针：前 ~0.5s 采样，低于阈值则降级
    let frames = 0;
    const probeUntil = start + 500;

    const tick = (now: number) => {
      const elapsed = now - start;
      const next = calculateBreathingPhase(elapsed);

      // 振幅：每帧写 CSS 变量（不触发 React 重渲染）
      root?.style.setProperty('--breath-scale', scaleFor(next.phase, next.phaseProgress).toFixed(4));

      // 相位切换：更新文字状态 + 触发音效回调
      if (next.phase !== lastPhase) {
        lastPhase = next.phase;
        setBreathing(next);
        onPhaseRef.current?.(next.phase);
      }
      // 整圈完成
      if (next.cycleCount !== lastCycle) {
        lastCycle = next.cycleCount;
        setCompletedCycles(next.cycleCount);
        onCycleRef.current?.(next.cycleCount);
      }

      // fps 探针
      if (now < probeUntil) {
        frames++;
      } else if (frames > 0) {
        const fps = frames / ((now - start) / 1000);
        if (fps < LOW_FPS) { setLowFps(true); return; }
        frames = -1; // 标记探针结束
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [degraded, scaleFor]);

  return (
    <BreathingContext.Provider value={{ breathing, completedCycles, degraded }}>
      <div ref={rootRef} style={{ '--breath-scale': 1 } as React.CSSProperties}>
        {children}
      </div>
    </BreathingContext.Provider>
  );
}
