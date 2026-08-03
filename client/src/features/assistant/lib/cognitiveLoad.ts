/**
 * 认知负荷估算模型（纯函数）
 * Cognitive load estimation model (pure functions)
 *
 * @ai-context: A5 认知负荷监控的核心模型——对瞬时负荷分做 EMA 平滑，
 * 并用迟滞阈值（进入高/退出高不同）防止分数在阈值附近抖动反复触发。
 * 纯函数实现：状态由调用方持有并传回，便于单元测试。
 * @ai-context: Core model for A5 cognitive load monitoring — EMA-smooths the
 * instant load score and applies hysteresis (different enter/exit thresholds)
 * to prevent flapping near the threshold. Pure functions: state is owned and
 * passed back by the caller, making unit tests trivial.
 */
import { LOAD_EMA_ALPHA, LOAD_HIGH_THRESHOLD, LOAD_RECOVER_THRESHOLD } from '../constants';

/** 负荷估算器状态（调用方持有） */
export interface LoadEstimatorState {
  /** EMA 平滑后的负荷值（0-100） */
  smoothed: number;
  /** 当前是否处于"高负荷"态（迟滞锁存） */
  overloaded: boolean;
}

/** 创建初始状态 */
export function createLoadEstimator(): LoadEstimatorState {
  return { smoothed: 0, overloaded: false };
}

/**
 * EMA 更新：smoothed' = alpha * instant + (1 - alpha) * smoothed。
 * 首个样本（smoothed=0 且无历史）直接采用瞬时值，避免冷启动长期低估。
 */
export function updateLoadSmoothed(state: LoadEstimatorState, instant: number, hasHistory: boolean): number {
  const clamped = Math.min(100, Math.max(0, instant));
  if (!hasHistory) return clamped;
  return Math.round(LOAD_EMA_ALPHA * clamped + (1 - LOAD_EMA_ALPHA) * state.smoothed);
}

/**
 * 迟滞判定 + 状态推进（纯函数，返回新状态与是否"新进入高负荷"）。
 * - 未过载且越过 LOAD_HIGH_THRESHOLD → 进入过载，justEntered=true（应触发提醒）
 * - 已过载且降至 LOAD_RECOVER_THRESHOLD 以下 → 退出过载
 * - 已过载且仍高 → 不重复触发（justEntered=false）
 */
export function advanceLoadState(
  state: LoadEstimatorState,
  smoothed: number,
): { state: LoadEstimatorState; justEntered: boolean } {
  if (!state.overloaded) {
    if (smoothed >= LOAD_HIGH_THRESHOLD) {
      return { state: { smoothed, overloaded: true }, justEntered: true };
    }
    return { state: { smoothed, overloaded: false }, justEntered: false };
  }
  // 已处于过载：降至恢复阈值以下才解锁
  if (smoothed <= LOAD_RECOVER_THRESHOLD) {
    return { state: { smoothed, overloaded: false }, justEntered: false };
  }
  return { state: { smoothed, overloaded: true }, justEntered: false };
}
