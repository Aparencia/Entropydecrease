/**
 * 萤火海沟 — 灵感沉淀提醒纯函数
 * @ai-context 计算未处理灵感数量、阈值判定，驱动 SortPendingBanner 的显示逻辑。
 * 纯逻辑模块，无副作用。
 */

import type { InspirationItem } from '../store/inspirationStore';

/**
 * 计算未处理灵感数量。
 * @ai-context sortStatus 为 undefined 或 'pending' 均视为未处理，
 * 因为旧数据在 sortStatus 字段引入前已入库，不含此字段。
 */
export function countPendingInspirations(items: InspirationItem[]): number {
  return items.filter(
    (item) => item.sortStatus === undefined || item.sortStatus === 'pending',
  ).length;
}

/**
 * 阈值判定：每达到 10 的整数倍触发提醒。
 * @ai-context lastDismissedCount 记录用户上次关闭时的 pending 数量，
 * 避免重复弹出。仅当 pendingCount 越过下一个 10 的倍数时弹出。
 */
export function shouldShowReminder(
  pendingCount: number,
  lastDismissedCount: number,
): boolean {
  if (pendingCount < 10) return false;
  return getNextThreshold(lastDismissedCount) <= pendingCount;
}

/**
 * 计算下一个触发阈值。
 * @ai-context 基于 lastDismissedCount 向上取整到 10 的下一个倍数
 */
export function getNextThreshold(lastDismissedCount: number): number {
  // 上次关闭时是 15 → 下一个阈值是 20
  const nextMultiple = Math.floor(lastDismissedCount / 10 + 1) * 10;
  return nextMultiple;
}
