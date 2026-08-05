/**
 * 维基质量徽章 — 社区投票数 + AI 质量评估
 * Wiki quality badge — community votes + AI quality
 *
 * @ai-context: 投票为本地模拟（离线优先，接入 sync-service 后可替换）；
 * AI 质量评估为占位：当前用本地启发式（内容长度）估算，接入 ai-gateway
 * 的评估链后替换为真实分数。投票点击即切换（本地去重）。
 * @ai-context: Votes are local-first (swappable for sync-service later);
 * AI quality is a placeholder heuristic until the gateway evaluation chain
 * is wired in. Clicking votes toggles locally.
 */
import { ThumbsUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WikiPage } from '../types';

interface WikiQualityBadgeProps {
  page: WikiPage;
  onVote: (page: WikiPage) => void;
  className?: string;
}

const AI_QUALITY_COPY: Record<WikiPage['aiQuality'], { label: string; className: string }> = {
  pending: { label: 'AI 评估待定', className: 'bg-bg-secondary/60 text-text-tertiary border-border/40' },
  good: { label: 'AI 评估：质量良好', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  'needs-review': { label: 'AI 评估：建议补充', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
};

export default function WikiQualityBadge({ page, onVote, className }: WikiQualityBadgeProps) {
  const ai = AI_QUALITY_COPY[page.aiQuality];

  return (
    <div className={cn('flex items-center gap-kb-sm', className)}>
      {/* 社区投票 */}
      <button
        onClick={() => onVote(page)}
        aria-pressed={page.votedByMe}
        className={cn(
          'inline-flex items-center gap-1 rounded-kb-full border px-2 py-0.5 text-c2 transition-colors duration-kb-fast',
          page.votedByMe
            ? 'border-brand-500/50 bg-brand-500/10 text-brand-600 dark:text-brand-400'
            : 'border-border/40 text-text-tertiary hover:border-brand-500/30 hover:text-text-secondary',
        )}
      >
        <ThumbsUp className="w-3 h-3" strokeWidth={1.5} />
        {page.votes}
      </button>

      {/* AI 质量评估占位 */}
      <span
        className={cn('inline-flex items-center gap-1 rounded-kb-full border px-2 py-0.5 text-c2', ai.className)}
        title="AI 质量评估将在评估链接入后启用"
      >
        <Sparkles className="w-3 h-3" strokeWidth={1.5} />
        {ai.label}
      </span>
    </div>
  );
}
