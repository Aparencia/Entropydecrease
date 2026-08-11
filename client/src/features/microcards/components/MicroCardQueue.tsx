/**
 * 微卡队列 — 已生成卡片列表（标签 + 难度 + 状态）
 * Micro-card queue — generated cards with tags + difficulty
 *
 * @ai-context: 展示全部已生成微卡（待处理 + 已处理），点击展开答案。
 * 状态徽章：已会绿 / 不会红 / 深入琥珀。纯本地渲染，无网络依赖。
 * @ai-context: Lists all generated cards (pending + processed); click to
 * reveal the answer. Fully local rendering.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MicroCard, MicroCardStatus } from '../lib/microCardApi';

const STARS = '★★★';

const STATUS_META: Record<MicroCardStatus, { label: string; className: string }> = {
  pending: { label: '待处理', className: 'bg-bg-secondary/60 text-text-tertiary' },
  known: { label: '已会', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  unknown: { label: '不会', className: 'bg-red-500/10 text-red-500' },
  deep: { label: '深入', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};

interface MicroCardQueueProps {
  cards: MicroCard[];
}

export default function MicroCardQueue({ cards }: MicroCardQueueProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <p className="text-c1 text-text-tertiary text-center py-6">生成的微卡会出现在这里</p>
    );
  }

  return (
    <ul className="flex flex-col gap-kb-xs">
      {cards.map((card) => {
        const meta = STATUS_META[card.status];
        const expanded = expandedId === card.id;
        return (
          <li key={card.id}>
            <button
              onClick={() => setExpandedId(expanded ? null : card.id)}
              aria-expanded={expanded}
              className={cn(
                'w-full flex flex-col gap-1 rounded-kb-md border px-kb-sm py-2 text-left transition-colors duration-kb-fast',
                expanded ? 'border-cyber/40 bg-cyber/5' : 'border-border/40 hover:border-cyber/30 hover:bg-bg-elevated/50',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-b2 text-text-primary truncate">{card.front}</span>
                <span className={cn('flex-shrink-0 rounded-kb-full px-2 py-0.5 text-c2', meta.className)}>
                  {meta.label}
                </span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-text-tertiary flex-shrink-0 transition-transform duration-kb-fast', expanded && 'rotate-180')} strokeWidth={1.5} />
              </span>
              <span className="flex items-center gap-2">
                {card.tag && (
                  <span className="rounded-kb-full bg-cyber/10 text-cyber px-2 py-0.5 text-c2">{card.tag}</span>
                )}
                <span className="text-c2 text-amber-500 tracking-tight" aria-label={`难度 ${card.difficulty}`}>
                  {STARS.slice(0, card.difficulty)}
                </span>
              </span>
              {expanded && (
                <span className="text-c1 text-text-secondary/80 leading-relaxed pt-1 border-t border-border/30 mt-1">
                  {card.back}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
