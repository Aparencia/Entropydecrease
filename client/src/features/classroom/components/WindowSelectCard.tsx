/**
 * WindowSelectCard — 目标窗口选择卡片
 * Target window selection card with a change-window popover.
 *
 * @ai-context: 左栏配置态组件。默认只展示"已选窗口"单卡片以压缩纵向空间，
 * 点击卡片弹出浮层列表（含刷新）供更换；未选中时整卡为虚线引导按钮。
 * 浮层通过 document mousedown 监听点击外部自动关闭。
 * @ai-context: 浮层内两级列表——"推荐窗口"（score>0，主进程 windowScorer
 * 命中网课/浏览器/播放器关键词）默认展示；score=0 的窗口收进"显示全部窗口"
 * 折叠区，兼作手动自选入口，保证任何可捕获窗口都能被选中。
 * @ai-context: Left-rail config-stage component. Popover shows a two-tier list:
 * recommended (score>0) by default, with a "show all" toggle exposing every
 * capturable window as the manual-pick fallback.
 */
import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { Monitor, RefreshCw, Star, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WindowInfo } from '@/lib/capture';

interface WindowSelectCardProps {
  windows: WindowInfo[];
  selected: WindowInfo | null;
  onSelect: (win: WindowInfo) => void;
  onRefresh: () => void;
  loading: boolean;
  disabled?: boolean;
}

/** 浮层内的单个窗口条目 */
function WindowRow({ win, isSelected, onClick }: { win: WindowInfo; isSelected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn(
        'flex items-center gap-2 p-2 rounded-kb-sm text-left transition-colors w-full',
        isSelected
          ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
          : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary',
      )}>
      {win.thumbnail && (
        <img src={win.thumbnail} alt="" className="w-14 h-8 rounded-kb-xs object-cover border border-border/30" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-b3 leading-tight line-clamp-1 block">{win.title}</span>
        {win.matched && (
          <span className="text-[10px] text-brand-500 leading-tight">匹配：{win.matched}</span>
        )}
      </div>
      {(win.score ?? 0) >= 100 && (
        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" strokeWidth={1.5} />
      )}
    </button>
  );
}

export function WindowSelectCard({ windows, selected, onSelect, onRefresh, loading, disabled }: WindowSelectCardProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 推荐窗口 = 主进程评分命中关键词；其余窗口收进"显示全部"折叠区
  const recommended = windows.filter((w) => (w.score ?? 0) > 0);
  const others = windows.filter((w) => (w.score ?? 0) <= 0);

  // 点击浮层外部时自动关闭
  useEffect(() => {
    if (!open) return;
    const handleDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleDocDown);
    return () => document.removeEventListener('mousedown', handleDocDown);
  }, [open]);

  // 点击浮层内空白/非交互区域：立即关闭浮层。
  // 浮层打开时会覆盖下方配置区（采集路径/模式等），若点击命中浮层内
  // 无交互元素，既不会关闭浮层也不会触达下层按钮——形成无反馈死区，
  // 用户感知为“页面无法点击”。此处让“点空白即关闭”，下层配置恢复可点。
  const handlePopoverDown = (e: ReactMouseEvent) => {
    if (!(e.target as HTMLElement).closest('button')) setOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    // 首次展开且列表为空时顺手触发刷新，减少一次点击
    if (next && windows.length === 0 && !loading) onRefresh();
  };

  const handlePick = (win: WindowInfo) => {
    onSelect(win);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <span className="text-b3 font-medium text-text-tertiary block mb-1.5">目标窗口</span>

      {/* 已选窗口卡片 / 未选引导按钮 */}
      <button onClick={handleToggle} disabled={disabled}
        className={cn(
          'w-full flex items-center gap-2 p-2 rounded-kb-md text-left transition-all border',
          selected
            ? 'bg-brand-50 border-brand-200/60 text-brand-700'
            : 'border-dashed border-border/60 text-text-tertiary hover:border-brand-300 hover:text-text-secondary',
          disabled && 'opacity-50 cursor-not-allowed',
        )}>
        {selected ? (
          <>
            {selected.thumbnail && (
              <img src={selected.thumbnail} alt="" className="w-14 h-8 rounded-kb-xs object-cover border border-border/30" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-b3 leading-tight line-clamp-1 block">{selected.title}</span>
              {selected.matched && (
                <span className="text-[10px] text-brand-500 leading-tight">匹配：{selected.matched}</span>
              )}
            </div>
            <span className="text-[11px] text-brand-600 flex-shrink-0">更换</span>
          </>
        ) : (
          <>
            <Monitor className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-b3">选择目标窗口</span>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} strokeWidth={1.5} />
          </>
        )}
      </button>

      {/* 窗口列表浮层：推荐 + 可展开的全部窗口 */}
      {open && (
        <div onMouseDown={handlePopoverDown}
          className="absolute left-0 right-0 top-full mt-1 z-20 rounded-kb-md border border-border/40 bg-bg-secondary backdrop-blur-xl shadow-kb-md p-2">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[11px] text-text-tertiary">推荐窗口</span>
            <button onClick={onRefresh} disabled={loading}
              className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 disabled:opacity-50">
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} strokeWidth={1.5} />
              {loading ? '加载中' : '刷新'}
            </button>
          </div>
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
            {windows.length === 0 && !loading && (
              <p className="text-b3 text-text-tertiary py-2 text-center">未检测到可捕获窗口</p>
            )}
            {windows.length > 0 && recommended.length === 0 && (
              <p className="text-b3 text-text-tertiary py-2 text-center">
                未发现疑似网课/视频窗口
                <span className="block text-[10px] mt-0.5 opacity-70">可从下方全部窗口中手动选择</span>
              </p>
            )}
            {recommended.map((win) => (
              <WindowRow key={win.id} win={win} isSelected={selected?.id === win.id} onClick={() => handlePick(win)} />
            ))}

            {/* 全部窗口折叠区：手动自选未被识别为目标的窗口 */}
            {others.length > 0 && (
              <>
                <button onClick={() => setShowAll((prev) => !prev)}
                  className="flex items-center gap-1 px-1 py-1.5 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors border-t border-border/20 mt-1">
                  {showAll
                    ? <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                    : <ChevronRight className="w-3 h-3" strokeWidth={1.5} />}
                  {showAll ? '收起其他窗口' : `显示全部窗口 (${others.length})`}
                </button>
                {showAll && others.map((win) => (
                  <WindowRow key={win.id} win={win} isSelected={selected?.id === win.id} onClick={() => handlePick(win)} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
