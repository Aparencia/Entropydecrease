/**
 * NoteHealthIndicator — N3 笔记健康度指示器
 *
 * @ai-context: 挂在 EditorToolbar 末端的轻量徽章：防抖计算健康度，
 * 低分显示温和警示（觉察原则——只提示不阻断）；悬停查看分项与建议。
 */
import { useMemo, useState, useEffect } from 'react';
import { HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { assessNoteHealth, healthLevel, type NoteHealthResult } from '../lib/noteHealth';

/** 防抖间隔：编辑器高频更新下避免频繁计算 */
const DEBOUNCE_MS = 800;

const LEVEL_STYLE = {
  good: 'text-semantic-success',
  fair: 'text-semantic-warning',
  weak: 'text-semantic-error',
} as const;

interface NoteHealthIndicatorProps {
  /** 笔记文本内容（markdown 或纯文本） */
  content: string;
}

export function NoteHealthIndicator({ content }: NoteHealthIndicatorProps) {
  const [debounced, setDebounced] = useState(content);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(content), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [content]);

  const health: NoteHealthResult | null = useMemo(
    () => assessNoteHealth(debounced),
    [debounced],
  );

  if (!health) return null;

  const level = healthLevel(health.score);

  return (
    <span className="group/health relative inline-flex shrink-0">
      <span
        className={cn(
          'flex items-center gap-1 px-kb-sm py-0.5 rounded-kb-full text-c1 font-medium cursor-default',
          'bg-bg-secondary/60 transition-colors duration-kb-fast',
          LEVEL_STYLE[level],
        )}
        aria-label={`笔记健康度 ${health.score}`}
      >
        <HeartPulse className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
        {health.score}
      </span>
      {/* 悬停弹层：分项得分 + 改进建议（觉察原则，仅提示） */}
      <span
        role="tooltip"
        className={cn(
          'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[9999] w-64',
          'rounded-kb-md bg-gray-800/95 text-white text-[11px] leading-relaxed',
          'px-3 py-2 shadow-lg pointer-events-none select-none',
          'opacity-0 scale-95 transition-all duration-150 delay-500',
          'group-hover/health:opacity-100 group-hover/health:scale-100',
        )}
      >
        <p className="font-medium mb-1">
          健康度 {health.score}（结构 {health.structure} · 生成 {health.generative} · 覆盖 {health.coverage}）
        </p>
        {health.suggestions.map((s) => (
          <p key={s} className="text-white/80">· {s}</p>
        ))}
        {health.suggestions.length === 0 && <p className="text-white/80">状态不错，保持这个节奏。</p>}
      </span>
    </span>
  );
}
