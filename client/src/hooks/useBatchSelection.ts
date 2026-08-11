/**
 * 批量选择状态 hook（萤火海沟批量整理模式的通用化）
 *
 * @ai-context: 统一 batchMode + selectedIds 状态机，供笔记列表 / 闪卡列表等
 * 需要批量操作的模块复用。退出批量模式时自动清空选中；toggle 支持
 * shiftKey 语义由调用方自行决定（默认单选切换）。
 * @ai-context: Shared batch-selection state machine, extracted from the
 * Inspiration batch mode; auto-clears selection when batch mode is exited.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseBatchSelectionOptions<T extends { id: string }> {
  /** 参与全选的候选列表（全选基于当前可见/过滤结果） */
  items: T[];
  /** 进入批量模式时是否自动全选 */
  selectAllOnEnter?: boolean;
}

export function useBatchSelection<T extends { id: string }>({
  items,
  selectAllOnEnter = false,
}: UseBatchSelectionOptions<T>) {
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 跟踪最近一次 items 引用，用于交叉校验
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // 退出批量模式时清空选中（与萤火海沟行为一致）
  useEffect(() => {
    if (!batchMode) setSelectedIds(new Set());
  }, [batchMode]);

  // 进入批量模式时可选全选（依赖 items 完整，确保全选基于最新列表）
  useEffect(() => {
    if (batchMode && selectAllOnEnter) {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [batchMode, selectAllOnEnter, items]);

  // items 变化时清除已不在列表中的选中项（防筛选变化后选中已隐藏项）
  useEffect(() => {
    if (!batchMode) return;
    const validIds = new Set(items.map((i) => i.id));
    setSelectedIds((prev) => {
      let changed = false;
      for (const id of prev) {
        if (!validIds.has(id)) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      const next = new Set(prev);
      for (const id of prev) {
        if (!validIds.has(id)) next.delete(id);
      }
      return next;
    });
  }, [items, batchMode]);

  const toggle = useCallback((id: string) => {
    // 只允许选中当前 items 中的项（防筛选变化后选中已隐藏项）
    if (!itemsRef.current.some((i) => i.id === id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [items]);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const enter = useCallback(() => setBatchMode(true), []);
  const exit = useCallback(() => setBatchMode(false), []);

  const count = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    batchMode,
    setBatchMode,
    selectedIds,
    toggle,
    selectAll,
    clear,
    enter,
    exit,
    count,
  };
}
