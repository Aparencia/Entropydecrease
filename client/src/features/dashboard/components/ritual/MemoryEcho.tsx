/**
 * MemoryEcho — 记忆回响时间线（最近学习足迹横滑卡片）
 * Memory echo: horizontally-scrollable recent learning trace cards
 *
 * @ai-context: RIT-04/B1.4——回顾步骤内展示最近 3 次学习足迹（数据优先记忆
 * 锚点，锚点未实现时由页面层回退最近笔记摘要，本组件不感知来源）。纯展示
 * 组件，无副作用；数据经 props 注入。横滑用 overflow-x-auto。
 * @ai-context: Pure presentational timeline; data injected via props,
 * source-agnostic. Horizontal scroll via overflow-x-auto.
 */
import { History } from 'lucide-react';
import type { MemoryEchoItem } from '../../types';

interface Props {
  items: MemoryEchoItem[];
}

export function MemoryEcho({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-text-tertiary">
        <History className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="text-xs">最近的学习足迹</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="list" aria-label="记忆回响时间线">
        {items.map((item, i) => (
          <div
            key={`${item.title}-${i}`}
            role="listitem"
            className="flex-shrink-0 w-40 rounded-kb-md border border-border/40 bg-bg-secondary/20 p-3 flex flex-col gap-1"
          >
            <span className="text-xs font-medium text-text-secondary truncate">{item.title}</span>
            {item.excerpt && (
              <span className="text-[11px] text-text-tertiary line-clamp-2 leading-snug">{item.excerpt}</span>
            )}
            <span className="text-[10px] text-text-tertiary/70 mt-auto">{item.dateLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
