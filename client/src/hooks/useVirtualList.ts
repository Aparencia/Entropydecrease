/**
 * @ai-context: 轻量虚拟列表 Hook（无第三方依赖），大列表渲染性能优化。
 */
import type { RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface UseVirtualListOptions {
  /** 列表项总数 */
  count: number;
  /** 预估每项高度（px） */
  estimateSize?: number;
  /** 上下额外渲染条数 */
  overscan?: number;
  /** 滚动容器 ref（由调用方传入） */
  scrollRef: RefObject<HTMLElement | null>;
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

/**
 * 虚拟滚动列表 hook
 * 封装 @tanstack/react-virtual，支持动态行高
 */
export function useVirtualList({
  count,
  estimateSize = 48,
  overscan = 8,
  scrollRef,
  enabled = true,
}: UseVirtualListOptions) {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    enabled,
  });

  return {
    /** 当前可见行信息（含 index、start、size） */
    virtualRows: virtualizer.getVirtualItems(),
    /** 列表总高度（px） */
    totalSize: virtualizer.getTotalSize(),
    /** 滚动到指定索引 */
    scrollToIndex: (index: number, options?: Parameters<typeof virtualizer.scrollToIndex>[1]) =>
      virtualizer.scrollToIndex(index, options),
    /** 内部 virtualizer 实例（高级用法） */
    virtualizer,
  };
}

