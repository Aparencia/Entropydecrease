/**
 * SegmentList — 精细路径提取结果列表
 * Extracted segment list for the fine capture path.
 *
 * @ai-context: 右侧内容区组件（fine 路径）。从 ClassroomPage 平移拆出，
 * 支持多选/批量插入（当前落地为复制剪贴板），新片段到达时自动滚动到底部。
 * @ai-context: Right-pane component for the fine path, split out of
 * ClassroomPage; auto-scrolls to bottom when new segments arrive.
 */
import { useRef, useEffect } from 'react';
import { Eye, Plus, ListPlus, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtractedSegment } from '@/lib/capture';

interface SegmentListProps {
  segments: ExtractedSegment[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** 插入选中：父级拼 Markdown 后回调（打开笔记插入弹窗） */
  onInsertSelected: (markdown: string) => void;
  onInsertAll: (markdown: string) => void;
}

export function SegmentList({ segments, selectedIds, onToggleSelect, onInsertSelected, onInsertAll }: SegmentListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [segments.length]);

  /** 拼接选中/全部片段为 Markdown（带 [HH:MM:SS] 时间戳） */
  const buildMarkdown = (list: ExtractedSegment[]): string =>
    list
      .map((s) => {
        const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `[${time}] ${s.text}`;
      })
      .join('\n\n');

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <span className="text-b2 font-medium text-text-secondary">提取结果 ({segments.length})</span>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const md = buildMarkdown(segments.filter((s) => selectedIds.has(s.id)));
            if (md) onInsertSelected(md);
          }} disabled={selectedIds.size === 0}
            className={cn('inline-flex items-center gap-1 px-2.5 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
              selectedIds.size > 0 ? 'bg-brand-50 text-brand-600 hover:bg-brand-100' : 'text-text-tertiary cursor-not-allowed')}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2} /> 插入选中
          </button>
          <button onClick={() => {
            const md = buildMarkdown(segments);
            if (md) onInsertAll(md);
          }} disabled={segments.length === 0}
            className={cn('inline-flex items-center gap-1 px-2.5 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
              segments.length > 0 ? 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary' : 'text-text-tertiary cursor-not-allowed')}>
            <ListPlus className="w-3.5 h-3.5" strokeWidth={2} /> 全部插入
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {segments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
            <Eye className="w-12 h-12 mb-3 opacity-20" strokeWidth={1} />
            <p className="text-b2">采集进行中，提取结果将在此显示</p>
          </div>
        )}
        {segments.map((seg) => {
          const isSelected = selectedIds.has(seg.id);
          const sourceLabel = seg.source === 'vision' ? '视觉' : seg.source === 'audio' ? '音频' : 'UI';
          const sourceColor = seg.source === 'vision'
            ? 'bg-accent-500/10 text-accent-600'
            : seg.source === 'audio' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600';
          return (
            <div key={seg.id} onClick={() => onToggleSelect(seg.id)}
              className={cn('group p-3 rounded-kb-md cursor-pointer transition-all border border-transparent',
                isSelected ? 'bg-brand-50/50 border-brand-200/50' : 'hover:bg-bg-tertiary/50')}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn('px-1.5 py-0.5 rounded-kb-xs text-[10px] font-medium', sourceColor)}>{sourceLabel}</span>
                <span className="text-[10px] text-text-tertiary">{new Date(seg.timestamp).toLocaleTimeString()}</span>
                {isSelected && <CheckCircle2 className="ml-auto w-4 h-4 text-brand-500" strokeWidth={1.5} />}
              </div>
              <p className="text-b2 text-text-primary leading-relaxed">{seg.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
