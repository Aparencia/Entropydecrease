/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：VirtualList。
 */
import { useRef } from 'react';
import { useVirtualList } from '@/hooks/useVirtualList';

export interface VirtualListProps<T> {
  /** 数据项数组 */
  items: T[];
  /** 每项渲染函数 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 预估每项高度（px），默认 48 */
  estimateSize?: number;
  /** 上下额外渲染条数，默认 8 */
  overscan?: number;
  /** 滚动容器高度（CSS），默认 '100%' */
  height?: string;
  /** 容器 className */
  className?: string;
  /** key 提取器，默认使用 index */
  getKey?: (item: T, index: number) => string | number;
}

/**
 * 通用虚拟化列表容器组件
 * 内部使用 useVirtualList hook，仅渲染可视区域内的条目
 */
export function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 48,
  overscan = 8,
  height = '100%',
  className,
  getKey,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualRows, totalSize } = useVirtualList({
    count: items.length,
    estimateSize,
    overscan,
    scrollRef,
  });

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ height, overflow: 'auto', contain: 'strict' }}
    >
      <div style={{ height: totalSize, position: 'relative' }}>
        {virtualRows.map((virtualRow) => {
          const item = items[virtualRow.index];
          const key = getKey ? getKey(item, virtualRow.index) : virtualRow.index;
          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
