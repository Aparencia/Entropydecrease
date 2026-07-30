/** @file 学习趋势折线图组件 — Recharts AreaChart *
 * @ai-context: 通用组件：TrendChart。
 */
import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { TrendPoint } from '../types/analytics';

interface Props {
  data: TrendPoint[];
  loading?: boolean;
}

function TrendSkeleton() {
  return (
    <div className="w-full h-[280px] flex items-end gap-1 px-8 pb-6">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-bg-tertiary/30"
          style={{
            height: `${20 + Math.random() * 60}%`,
            animation: 'pulse-skeleton 1.5s ease-in-out infinite',
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

function formatDate(d: string) {
  const [, m, day] = d.split('-');
  return `${m}/${day}`;
}

const TrendChart: React.FC<Props> = ({ data, loading }) => {
  const chartData = useMemo(() => data.map((p) => ({ ...p, dateLabel: formatDate(p.date) })), [data]);
  const disableAnim = data.length > 1000;

  if (loading) return <TrendSkeleton />;
  if (!chartData.length) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--kb-brand-500)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--kb-brand-500)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--kb-border-default)" strokeOpacity={0.3} vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fill: 'var(--kb-text-secondary)', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--kb-border-default)', strokeOpacity: 0.3 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'var(--kb-text-secondary)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--kb-bg-elevated)',
            border: '1px solid var(--kb-border-default)',
            borderRadius: 'var(--kb-radius-sm)',
            fontSize: 11,
            color: 'var(--kb-text-primary)',
          }}
          labelFormatter={(l) => `日期: ${l}`}
          formatter={(v) => [`${Number(v)} 分钟`, '学习时长']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--kb-brand-500)"
          strokeWidth={2}
          fill="url(#trend-grad)"
          isAnimationActive={!disableAnim}
          animationDuration={800}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--kb-brand-500)', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default React.memo(TrendChart);
