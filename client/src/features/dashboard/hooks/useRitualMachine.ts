/**
 * useRitualMachine — 启动仪式状态机 Hook / Ritual flow state machine
 *
 * @ai-context: 显式状态机管理仪式步骤流转（RIT-22 决策 1）。接受注入的
 * "编排计划"（步骤数组），为 Beta.1 自适应编排（ritualPlanner）预留接口；
 * A1 默认计划为 review→goal→breathing，planVariant='standard'。
 * 本 Hook 无副作用（不访问存储/网络），时长计量基于挂载时刻。
 * @ai-context: Explicit state machine for ritual step flow. Accepts an
 * injected plan (step array) so Beta.1 adaptive planning can plug in.
 * No side effects; duration is measured from mount time.
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import type { RitualStep } from '../types';

/** A1 默认编排：三步标准流程 */
export const DEFAULT_RITUAL_PLAN: RitualStep[] = ['review', 'goal', 'breathing'];

/** A1 固定编排变体标识（Beta.1 由 ritualPlanner 输出） */
export const DEFAULT_PLAN_VARIANT = 'standard';

export interface RitualMachine {
  /** 编排计划（步骤数组） */
  steps: RitualStep[];
  /** 当前步骤索引 */
  stepIndex: number;
  /** 当前步骤标识 */
  currentStep: RitualStep;
  /** 是否为最后一步 */
  isLast: boolean;
  /** 推进到下一步（最后一步时不越界，由调用方触发完成） */
  next: () => void;
  /** 回退到上一步（第一步时不越界） */
  prev: () => void;
  /** 自挂载起经过的毫秒数（完成时用于 ritualDurationMs） */
  getElapsedMs: () => number;
  /** 编排变体埋点标识 */
  planVariant: string;
}

export function useRitualMachine(
  plan: RitualStep[] = DEFAULT_RITUAL_PLAN,
  planVariant: string = DEFAULT_PLAN_VARIANT,
): RitualMachine {
  // 空计划兜底为默认计划，保证 currentStep 恒有效
  const steps = useMemo(() => (plan.length > 0 ? plan : DEFAULT_RITUAL_PLAN), [plan]);
  const [stepIndex, setStepIndex] = useState(0);
  const startedAtRef = useRef<number>(Date.now());

  const next = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const getElapsedMs = useCallback(() => Date.now() - startedAtRef.current, []);

  return {
    steps,
    stepIndex,
    currentStep: steps[stepIndex],
    isLast: stepIndex === steps.length - 1,
    next,
    prev,
    getElapsedMs,
    planVariant,
  };
}
