/**
 * DiveProfileCard — 潜航档案（顶部数据摘要卡）
 *
 * 展示近 30 天下潜统计：潜次总数、最佳时段、完成率、平均专注时长。
 * 数据不足时显示引导文案。
 *
 * @ai-context: 深潜设置页改造——数据驱动卡片。
 */
import { Waves } from 'lucide-react';
import type { DiveProfileStats } from '../../hooks/useDiveProfile';

export function DiveProfileCard({ stats }: { stats: DiveProfileStats }) {
  return (
    <div className="relative overflow-hidden rounded-kb-lg border border-brand-500/20 bg-brand-500/5 p-kb-md">
      {/* 装饰：水波纹点缀 */}
      <Waves
        className="absolute right-4 top-4 w-6 h-6 text-brand-500/30"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="text-b2 font-semibold text-text-primary flex items-center gap-2">
        <span className="text-brand-500">潜航档案</span>
      </p>
      <p className="mt-1.5 text-c1 text-text-secondary">
        {stats.summaryText}
      </p>
      {stats.sufficient ? (
        <div className="mt-3 flex gap-4">
          <div className="flex-1">
            <p className="text-b1 font-semibold text-text-primary tabular-nums">{stats.totalDives}</p>
            <p className="text-c1 text-text-tertiary">潜次</p>
          </div>
          <div className="flex-1">
            <p className="text-b1 font-semibold text-text-primary tabular-nums">{stats.completionRate}%</p>
            <p className="text-c1 text-text-tertiary">完成率</p>
          </div>
          <div className="flex-1">
            <p className="text-b1 font-semibold text-text-primary tabular-nums">{stats.avgFocusMinutes}min</p>
            <p className="text-c1 text-text-tertiary">平均专注</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-c1 text-text-tertiary">
          🫧 完成几次下潜后，这里会显示你的专属节律分析
        </p>
      )}
    </div>
  );
}