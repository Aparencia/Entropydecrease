/**
 * @ai-context: 通用组件：SonarWindowSelector。
 */
import { useState } from 'react';
import { Monitor, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WindowSelectorProps } from './types';

// ================================================================
// 窗口选择器
// ================================================================

export function SonarWindowSelector({
  windows,
  selected,
  onSelect,
  onRefresh,
  loading,
}: WindowSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex items-center justify-between w-full px-3 py-2.5 text-b2',
          'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50',
          'transition-colors duration-kb-fast',
        )}
      >
        <div className="flex items-center gap-2">
          <Monitor className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          <span className="font-medium">
            {selected ? selected.title : '选择目标窗口'}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          <button
            onClick={onRefresh}
            disabled={loading}
            className={cn(
              'w-full text-b3 text-brand-600 hover:text-brand-700 py-1 text-left',
              loading && 'opacity-60 cursor-not-allowed',
            )}
          >
            {loading ? '加载中...' : '↻ 刷新窗口列表'}
          </button>

          {windows.length === 0 && !loading && (
            <p className="text-b3 text-text-tertiary py-2 text-center">
              未检测到可捕获窗口
            </p>
          )}

          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {windows.map((win) => (
              <button
                key={win.id}
                onClick={() => { onSelect(win); setExpanded(false); }}
                className={cn(
                  'flex items-start gap-2 p-kb-sm rounded-kb-sm text-left transition-colors',
                  selected?.id === win.id
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                    : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary',
                )}
              >
                {win.thumbnail && (
                  <img
                    src={win.thumbnail}
                    alt=""
                    className="w-16 h-9 rounded-kb-xs object-cover flex-shrink-0 border border-border/30"
                  />
                )}
                <span className="text-b3 leading-tight line-clamp-2">{win.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
