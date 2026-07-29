/**
 * 调度策略工厂
 *
 * 根据用户设置（localStorage）返回对应的调度策略实例。
 * 默认使用 FSRS，用户可在设置页面切换回 SM-2。
 *
 * @ai-context: 本文件是调度模块唯一的副作用边界（localStorage 读写），sm2/fsrs/scheduler 均为纯函数。kb-* 键名已有存量用户数据，改名需迁移逻辑。
 */

import { SM2Strategy, FSRSStrategy, type SchedulingStrategy } from './scheduler';

/** localStorage key：当前选择的调度算法 */
export const SCHEDULER_ALGORITHM_KEY = 'kb-scheduler-algorithm';

/** localStorage key：每日新卡上限 */
export const MAX_NEW_CARDS_KEY = 'kb-max-new-cards-per-day';

/** localStorage key：每日复习上限 */
export const MAX_REVIEWS_KEY = 'kb-max-reviews-per-day';

/** 默认每日新卡上限 */
export const DEFAULT_MAX_NEW_CARDS = 20;

/** 默认每日复习上限 */
export const DEFAULT_MAX_REVIEWS = 100

// 缓存策略实例，避免每次调用都 new
let cachedStrategy: SchedulingStrategy | null = null;
let cachedAlgorithm: string | null = null;

/**
 * 获取当前激活的调度策略实例
 *
 * 读取 localStorage 中的算法选择配置，返回对应策略。
 * 未配置时默认返回 FSRS。
 */
export function getScheduler(): SchedulingStrategy {
  const algorithm = localStorage.getItem(SCHEDULER_ALGORITHM_KEY) ?? 'fsrs';

  // 缓存命中直接返回
  if (cachedStrategy && cachedAlgorithm === algorithm) {
    return cachedStrategy;
  }

  cachedAlgorithm = algorithm;
  cachedStrategy = algorithm === 'sm2' ? new SM2Strategy() : new FSRSStrategy();
  return cachedStrategy;
}

/**
 * 设置调度算法并清除缓存
 */
export function setSchedulerAlgorithm(algorithm: 'sm2' | 'fsrs'): void {
  localStorage.setItem(SCHEDULER_ALGORITHM_KEY, algorithm);
  cachedStrategy = null;
  cachedAlgorithm = null;
}

/**
 * 获取当前选择的算法名称
 */
export function getCurrentAlgorithm(): 'sm2' | 'fsrs' {
  const stored = localStorage.getItem(SCHEDULER_ALGORITHM_KEY);
  return stored === 'sm2' ? 'sm2' : 'fsrs';
}

/**
 * 获取每日新卡上限
 */
export function getMaxNewCardsPerDay(): number {
  const stored = localStorage.getItem(MAX_NEW_CARDS_KEY);
  if (stored) {
    const val = parseInt(stored, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return DEFAULT_MAX_NEW_CARDS;
}

/**
 * 设置每日新卡上限
 */
export function setMaxNewCardsPerDay(value: number): void {
  localStorage.setItem(MAX_NEW_CARDS_KEY, String(Math.max(1, value)));
}

/**
 * 获取每日复习上限
 */
export function getMaxReviewsPerDay(): number {
  const stored = localStorage.getItem(MAX_REVIEWS_KEY);
  if (stored) {
    const val = parseInt(stored, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return DEFAULT_MAX_REVIEWS;
}

/**
 * 设置每日复习上限
 */
export function setMaxReviewsPerDay(value: number): void {
  localStorage.setItem(MAX_REVIEWS_KEY, String(Math.max(1, value)));
}
