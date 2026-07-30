/** @file 五维雷达图组件 — Recharts RadarChart *
 * @ai-context: 通用组件：RadarChart。
 */
import React, { useMemo } from 'react';
import {
  RadarChart as RechartsRadar, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer,
} from 'recharts';
import type { RadarDimension } from '../types/analytics';

interface Props {
  data: RadarDimension[];
  loading?: boolean;
}

/** 骨架占位 — pulse-skeleton 动画 */
function RadarSkeleton() {
  return (
    <div className="w-full h-[280px] flex items-center justify-center">
      <div className="relative w-[200px] h-[200px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-border/20"
            style={{
              transform: `scale(${1 - i * 0.25})`,
              animation: 'pulse-skeleton 1.5s ease-in-out infinite',
              animationDelay: `${i * 200}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** 自定义角度轴标签 */
function AngleTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  return (
    <text
      x={x} y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="var(--kb-text-secondary)"
      fontSize={11}
    >
      {payload?.value}
    </text>
  );
}

const RadarChart: React.FC<Props> = ({ data, loading }) => {
  const chartData = useMemo(() => data, [data]);

  if (loading) return <RadarSkeleton />;
  if (!chartData.length) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RechartsRadar data={chartData} outerRadius="72%">
        <defs>
          <linearGradient id="radar-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--kb-brand-500)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--kb-brand-500)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <PolarGrid stroke="var(--kb-border-default)" strokeOpacity={0.4} />
        <PolarAngleAxis dataKey="label" tick={<AngleTick />} />
        <Radar
          dataKey="value"
          stroke="var(--kb-brand-500)"
          strokeWidth={2}
          fill="url(#radar-fill)"
        />
      </RechartsRadar>
    </ResponsiveContainer>
  );
};

export default React.memo(RadarChart);
