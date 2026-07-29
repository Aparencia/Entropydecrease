/**
 * @ai-context: 通用组件：CaptureSegmentList。
 */
import { useRef, useEffect } from 'react';
import { Eye, Plus, ListPlus, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SegmentListProps } from './types';

// ================================================================
// 实时提取结果展示区
// ================================================================

export function CaptureSegmentList({
  segments, selectedIds, onToggleSelect, onInsertSelected, onInsertAll,
}: SegmentListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新片段到达时自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments.length]);

  const hasSelected = selectedIds.size > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 操作栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <span className="text-b3 font-medium text-text-tertiary">
          提取结果 ({segments.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onInsertSelected}
            disabled={!hasSelected}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-b3 font-medium',
              'transition-all duration-kb-fast',
              hasSelected
                ? 'bg-brand-50 text-brand-600 hover:bg-brand-100'
                : 'text-text-tertiary cursor-not-allowed',
            )}
          >
            <Plus className="w-3 h-3" strokeWidth={2} />
            插入选中
          </button>
          <button
            onClick={onInsertAll}
            disabled={segments.length === 0}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-b3 font-medium',
              'transition-all duration-kb-fast',
              segments.length > 0
                ? 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                : 'text-text-tertiary cursor-not-allowed',
            )}
          >
            <ListPlus className="w-3 h-3" strokeWidth={2} />
            全部插入
          </button>
        </div>
      </div>

      {/* 片段列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {segments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <Eye className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
            <p className="text-b3">采集开始后提取结果将在此显示</p>
          </div>
        )}

        {segments.map((seg) => {
          const isSelected = selectedIds.has(seg.id);
          const sourceLabel = seg.source === 'vision' ? '视觉' : seg.source === 'audio' ? '音频' : 'UI';
          const sourceColor = seg.source === 'vision'
            ? 'bg-accent-500/10 text-accent-600'
            : seg.source === 'audio'
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-amber-500/10 text-amber-600';

          return (
            <div
              key={seg.id}
              onClick={() => onToggleSelect(seg.id)}
              className={cn(
                'group p-2.5 rounded-kb-sm cursor-pointer transition-all duration-kb-fast',
                'border border-transparent',
                isSelected
                  ? 'bg-brand-50/50 border-brand-200/50'
                  : 'hover:bg-bg-tertiary/50',
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn('px-1.5 py-0.5 rounded-kb-xs text-[10px] font-medium', sourceColor)}>
                  {sourceLabel}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {new Date(seg.timestamp).toLocaleTimeString()}
                </span>
                {isSelected && (
                  <CheckCircle2 className="ml-auto w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
                )}
              </div>
              <p className="text-b3 text-text-secondary leading-relaxed line-clamp-3">
                {seg.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
