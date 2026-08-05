/**
 * 录制中锚点自动标注（M2）——时间线自动锚点组件
 *
 * @ai-context: 课堂 smart 路径每连续录制 15 分钟触发一次自动锚点
 * （useClassroomAudio → captureManager.pushBookmark('auto_anchor')），
 * 锚点文本取触发时刻最近的实时转写片段。本组件在时间线区域展示锚点
 * 标记，点击标记展开查看锚点文本。
 */
import { useState } from 'react';
import { Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AutoAnchorItem {
  timestamp: number;
  /** 锚点文本（AI 转写片段，可选） */
  label?: string;
}

interface TimelineAnchorProps {
  anchors: AutoAnchorItem[];
  className?: string;
}

export function TimelineAnchor({ anchors, className }: TimelineAnchorProps) {
  const [openTs, setOpenTs] = useState<number | null>(null);

  if (anchors.length === 0) return null;

  return (
    <div className={cn('px-3 py-2', className)}>
      <div className="flex items-center gap-1.5">
        <Anchor className="w-3.5 h-3.5 text-brand-500/70" strokeWidth={1.5} />
        <span className="text-c1 text-text-tertiary">自动锚点 · {anchors.length}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {anchors.map((a, i) => (
          <div key={a.timestamp} className="flex flex-col gap-1">
            <button
              onClick={() => setOpenTs(openTs === a.timestamp ? null : a.timestamp)}
              className={cn(
                'px-2 py-0.5 rounded-kb-full text-c1 font-medium transition-colors',
                openTs === a.timestamp
                  ? 'bg-brand-500/15 text-brand-600 border border-brand-400/40'
                  : 'bg-bg-tertiary text-text-secondary border border-border/40 hover:border-brand-400/50 hover:text-brand-600',
              )}
              title={a.label ? '点击查看锚点文本' : `自动锚点 ${i + 1}`}
            >
              {i + 1} · {new Date(a.timestamp).toLocaleTimeString()}
            </button>
            {/* 点击展开锚点文本（源自触发时刻最近的实时转写） */}
            {openTs === a.timestamp && a.label && (
              <p className="max-w-[260px] text-c1 text-text-secondary leading-relaxed bg-bg-elevated border border-border/30 rounded-kb-md px-2 py-1.5 shadow-kb-sm">
                {a.label}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimelineAnchor;
