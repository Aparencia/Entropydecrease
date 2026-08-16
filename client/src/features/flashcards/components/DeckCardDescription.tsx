/**
 * 牌组卡 — 描述行（v0.30）
 *
 * @ai-context: 从 FlashcardsPage 拆出。无描述时预留一行高度保证卡片尺寸一致；
 * 描述超一行时截断并展示“⋯”按钮，点击展开完整内容（scrollHeight 溢出检测）。
 * @ai-context: Extracted from FlashcardsPage. Reserves one line of height when
 * there is no description; truncates overflow with a “⋯” expand/collapse button
 * (overflow detected via scrollHeight/scrollWidth).
 */
import { useState, useRef, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';

export function DeckCardDescription({ description }: { description?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // 收起状态下测量是否溢出一行（垂直换行或水平不可断行溢出均算）
  useLayoutEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (el) {
      setOverflows(
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      );
    }
  }, [description, expanded]);

  if (!description) {
    // 无描述：占位一行高度（12px × 1.5 行高），确保卡片尺寸一致
    return <div className="mt-0.5 min-h-[1.125rem]" aria-hidden="true" />;
  }

  return (
    <div className="flex items-start gap-1 mt-0.5">
      <p
        ref={textRef}
        className={cn(
          // break-words：无空格长串（如 URL/连续字符）也能正常断行，
          // 收起时配合 line-clamp-1 转为垂直溢出以便检测，展开时不撑出卡片
          'text-b3 text-text-tertiary flex-1 min-w-0 min-h-[1.125rem] break-words',
          !expanded && 'line-clamp-1',
        )}
      >
        {description}
      </p>
      {overflows && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="flex-shrink-0 text-b3 leading-[1.125rem] text-text-tertiary hover:text-text-primary transition-colors"
          title={expanded ? '收起描述' : '查看完整描述'}
          aria-label={expanded ? '收起描述' : '查看完整描述'}
        >
          {expanded ? '▴' : '⋯'}
        </button>
      )}
    </div>
  );
}
