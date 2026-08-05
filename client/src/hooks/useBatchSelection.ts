/**
 * 批量选择状态 hook（萤火海沟批量整理模式的通用化）
 *
 * @ai-context: 统一 batchMode + selectedIds 状态机，供笔记列表 / 闪卡列表等
 * 需要批量操作的模块复用。退出批量模式时自动清空选中；toggle 支持
 * shiftKey 语义由调用方自行决定（默认单选切换）。
 * @ai-context: Shared batch-selection state machine, extracted from the
 * Inspiration batch mode; auto-clears selection when batch mode is exited.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

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

  // 退出批量模式时清空选中（与萤火海沟行为一致）
  useEffect(() => {
    if (!batchMode) setSelectedIds(new Set());
  }, [batchMode]);

  // 进入批量模式时可选全选
  useEffect(() => {
    if (batchMode && selectAllOnEnter) {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchMode, selectAllOnEnter]);

  const toggle = useCallback((id: string) => {
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
