/**
 * 萤火海沟 — 灵感沉淀提醒 Hook
 * @ai-context 从 useInspirationStore 获取 items，计算 pending 数量，
 * 管理提醒条显示/隐藏状态。
 * 副作用：读取 localStorage 持久化 dismissedCount；调用 batchSort 触发 AI 分拣。
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { readWithLegacyMigration } from '@/lib/utils/legacyLocalStorage';
import { useInspirationStore } from '../store/inspirationStore';
import { useShallow } from 'zustand/react/shallow';
import { useBatchSort } from './useBatchSort';
import { countPendingInspirations, shouldShowReminder } from '../lib/sortPendingCalc';

const DISMISSED_KEY = 'ed.lastDismissedPendingCount';
const LEGACY_DISMISSED_KEY = 'keban.lastDismissedPendingCount'; // 旧键，2027-01 前兼容

function readLastDismissedCount(): number {
  try {
    const raw = readWithLegacyMigration(DISMISSED_KEY, LEGACY_DISMISSED_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function useSortPendingReminder() {
  const { items } = useInspirationStore(useShallow(s => ({ items: s.items })));
  const { batchSort } = useBatchSort();

  const pendingCount = useMemo(
    () => countPendingInspirations(items),
    [items],
  );

  const [lastDismissedCount, setLastDismissedCount] = useState(readLastDismissedCount);

  const showReminder = useMemo(
    () => shouldShowReminder(pendingCount, lastDismissedCount),
    [pendingCount, lastDismissedCount],
  );

  /**
   * 重新读取 localStorage（跨 tab 场景）
   * @ai-context 当用户在同一浏览器多个 tab 操作时保持 dismissed 状态同步
   */
  useEffect(() => {
    const handleStorage = () => {
      setLastDismissedCount(readLastDismissedCount());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  /** 关闭提醒条：将当前 pendingCount 持久化到 localStorage */
  const dismissReminder = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, String(pendingCount));
    setLastDismissedCount(pendingCount);
  }, [pendingCount]);

  /** 一键整理全部 pending 条目 @ai-context 触发批量分拣，完成后提醒条自然消失 */
  const handleSortAll = useCallback(async () => {
    const pendingItems = items.filter(
      (item) => item.sortStatus === undefined || item.sortStatus === 'pending',
    );
    if (pendingItems.length > 0) {
      await batchSort(pendingItems);
    }
    // 分拣完成后更新 dismissedCount，避免再次弹出
    localStorage.setItem(DISMISSED_KEY, String(pendingCount));
    setLastDismissedCount(pendingCount);
  }, [items, batchSort, pendingCount]);

  return { pendingCount, showReminder, dismissReminder, handleSortAll };
}
