/**
 * 自我效能感叙事（1.11 D1）
 * Growth story — weekly growth narrative
 *
 * @ai-context: 用聚合数据（aggregator 的 WeeklySummary + trend）生成一周成长
 * 叙事：新概念掌握（费曼完成数）、费曼趋势（本周 vs 上周）、闪卡记忆强度
 * （平均复习间隔变化）、专注时长变化（本周 vs 上周）。只陈述事实 + 一句
 * 正向收尾，不虚构进步（自我效能感的诚实来源）。
 */
import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnalyticsAggregate } from '../types/analytics';

interface Props {
  /** 聚合分析结果（null=加载中/无数据） */
  aggregate: AnalyticsAggregate | null;
  loading?: boolean;
}

/** 变化片段：+X / -X / 持平 */
function deltaLabel(delta: number, unit: string): { text: string; up: boolean | null } {
  if (delta === 0) return { text: `与上周持平${unit}`, up: null };
  return {
    text: `${delta > 0 ? '+' : '-'}${Math.abs(delta)}${unit}`,
    up: delta > 0,
  };
}

export default function GrowthStory({ aggregate, loading }: Props) {
  const narrative = useMemo(() => {
    if (!aggregate) return null;
    const w = aggregate.weekly;
    // 费曼趋势：本周 vs 上周完成数
    const feynmanDelta = deltaLabel(w.feynmanCount - w.prevFeynmanCount, ' 个概念');
    // 专注时长变化：本周 vs 上周
    const focusDelta = deltaLabel(w.totalMinutes - w.prevTotalMinutes, ' 分钟');
    // 记忆强度：平均复习间隔变化（天）；null=样本不足
    const memory =
      w.masteryDelta === null
        ? { text: '复习节奏刚刚起步，正在生长', up: null as boolean | null }
        : deltaLabel(Math.round(w.masteryDelta * 10) / 10, ' 天间隔');

    return {
      newConcepts: w.feynmanCount,
      reviewCount: w.reviewCount,
      feynmanDelta,
      focusDelta,
      memory,
      closing:
        w.feynmanCount === 0 && w.totalMinutes === 0
          ? '从第一个小目标开始，本周就是生长的起点。'
          : '每一点积累都在让知识之海更深一点。',
    };
  }, [aggregate]);

  if (loading || !narrative) {
    return (
      <div className="rounded-kb-xl border border-border/15 bg-bg-elevated/30 p-5 animate-pulse-skeleton">
        <div className="h-4 w-28 bg-bg-tertiary rounded-kb-sm mb-4" />
        <div className="h-3 w-full bg-bg-tertiary rounded-kb-sm mb-2" />
        <div className="h-3 w-3/4 bg-bg-tertiary rounded-kb-sm" />
      </div>
    );
  }

  const { newConcepts, reviewCount, feynmanDelta, focusDelta, memory } = narrative;

  const trendChip = (up: boolean | null, text: string) => (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-kb-full text-c1 font-medium',
        up === true && 'bg-emerald-500/10 text-emerald-400',
        up === false && 'bg-amber-500/10 text-amber-400',
        up === null && 'bg-bg-tertiary/60 text-text-tertiary',
      )}
    >
      {up === true && <TrendingUp className="w-3 h-3" />}
      {up === false && <TrendingDown className="w-3 h-3" />}
      {up === null && <Minus className="w-3 h-3" />}
      {text}
    </span>
  );

  return (
    <div className="rounded-kb-xl border border-border/15 bg-bg-elevated/30 backdrop-blur-sm p-5">
      <h3 className="text-b3 font-semibold text-text-primary mb-1">本周成长</h3>
      <p className="text-c1 text-text-tertiary mb-4">
        这周你掌握了 <span className="text-brand-500 font-semibold">{newConcepts}</span> 个新概念，
        完成 <span className="text-brand-500 font-semibold">{reviewCount}</span> 次复习——
        {narrative.closing}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-kb-lg border border-border/20 bg-bg-elevated/40 p-3">
          <p className="text-c1 text-text-tertiary mb-1.5">费曼趋势</p>
          {trendChip(feynmanDelta.up, feynmanDelta.text)}
        </div>
        <div className="rounded-kb-lg border border-border/20 bg-bg-elevated/40 p-3">
          <p className="text-c1 text-text-tertiary mb-1.5">记忆强度</p>
          {trendChip(memory.up, memory.text)}
        </div>
        <div className="rounded-kb-lg border border-border/20 bg-bg-elevated/40 p-3">
          <p className="text-c1 text-text-tertiary mb-1.5">专注时长</p>
          {trendChip(focusDelta.up, focusDelta.text)}
        </div>
      </div>
    </div>
  );
}
