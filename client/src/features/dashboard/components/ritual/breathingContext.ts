/**
 * 呼吸上下文与常量 / Breathing context & constants
 *
 * @ai-context: 从 BreathingProvider 拆出 Context/Hook/常量，使 Provider 文件
 * 只导出组件（满足 react-refresh only-export-components）。消费方从此文件
 * 引入 useBreathing / CYCLE_MS。
 * @ai-context: Context/hook/constants split out so the Provider file only
 * exports a component (react-refresh friendly).
 */
import { createContext, useContext } from 'react';
import type { BreathingState } from '../../types';

/** 一圈总时长（毫秒），4-4-4-4 与 breathing.ts 对齐 */
export const CYCLE_MS = 16_000;

export interface BreathingContextValue {
  /** 当前呼吸相位状态（相位切换时更新） */
  breathing: BreathingState;
  /** 已完成整圈数 */
  completedCycles: number;
  /** 是否处于降级模式（reduced-motion 或低帧） */
  degraded: boolean;
}

export const BreathingContext = createContext<BreathingContextValue | null>(null);

/** 消费呼吸上下文（必须在 BreathingProvider 内） */
export function useBreathing(): BreathingContextValue {
  const ctx = useContext(BreathingContext);
  if (!ctx) throw new Error('useBreathing 必须在 BreathingProvider 内使用');
  return ctx;
}
