/**
 * 采集侧边栏 — 窗口选择器
 *
 * @ai-context: 从 CaptureSidebar 拆出。折叠式窗口列表，展示缩略图与
 * 智能评分结果（score≥100 显示星标，matched 显示匹配关键词，评分逻辑
 * 见主进程 windowScorer）。选中后自动收起。
 */
import { useState } from 'react';
import { Monitor, ChevronDown, ChevronRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WindowInfo } from '@/lib/capture';

export interface WindowSelectorProps {
  windows: WindowInfo[];
  selected: WindowInfo | null;
  onSelect: (win: WindowInfo) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function WindowSelector({ windows, selected, onSelect, onRefresh, loading }: WindowSelectorProps) {
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
                <div className="flex-1 min-w-0">
                  <span className="text-b3 leading-tight line-clamp-2 block">{win.title}</span>
                  {win.matched && (
                    <span className="text-[10px] text-brand-500 leading-tight">匹配：{win.matched}</span>
                  )}
                </div>
                {(win.score ?? 0) >= 100 && (
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
