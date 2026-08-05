/** @file 五维雷达图组件 — Recharts RadarChart（1.14 支持掌握度钻取）
 * @ai-context: 通用组件：RadarChart。
 * 钻取状态机：L0 全局总览 → L1 课程层（点击维度）→ L2 概念层（点击课程）。
 * 无 drill 数据时退化为纯展示（与旧行为一致）。
 */
import React, { useMemo, useState } from 'react';
import {
  RadarChart as RechartsRadar, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer,
} from 'recharts';
import { ArrowLeft } from 'lucide-react';
import type { RadarDimension, MasteryDrillData } from '../types/analytics';

interface Props {
  data: RadarDimension[];
  loading?: boolean;
  /** 1.14 钻取数据（L1 课程 / L2 概念），缺省时无钻取能力 */
  drill?: MasteryDrillData;
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

/** 钻取状态机：level 0=总览 / 1=课程（dimension）/ 2=概念（dimension+course） */
interface DrillState {
  level: 0 | 1 | 2;
  dimension?: string;
  course?: string;
}

/** 自定义角度轴标签（可点击钻取，activeValue 高亮当前层级上下文） */
function AngleTick({
  x, y, payload, onClick, activeValue, clickable,
}: {
  x?: number; y?: number; payload?: { value?: string };
  onClick?: (value: string) => void;
  activeValue?: string;
  clickable?: boolean;
}) {
  const active = activeValue != null && payload?.value === activeValue;
  return (
    <text
      x={x} y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill={active ? 'var(--kb-brand-400)' : 'var(--kb-text-secondary)'}
      fontSize={11}
      fontWeight={active ? 600 : 400}
      style={clickable ? { cursor: 'pointer' } : undefined}
      onClick={onClick ? () => onClick(payload?.value ?? '') : undefined}
    >
      {payload?.value}
    </text>
  );
}

const RadarChart: React.FC<Props> = ({ data, loading, drill }) => {
  const [state, setState] = useState<DrillState>({ level: 0 });
  const chartData = useMemo(() => data, [data]);

  // 当前层级数据：L0 总览 → L1 课程 → L2 概念
  const currentData = useMemo<RadarDimension[]>(() => {
    if (state.level === 0 || !drill) return chartData;
    if (state.level === 1 && state.dimension) {
      return drill.coursesByDimension[state.dimension] ?? [];
    }
    if (state.level === 2 && state.course) {
      return drill.conceptsByCourse[state.course] ?? [];
    }
    return [];
  }, [state, drill, chartData]);

  // 层级标题（返回按钮旁的路径提示）
  const layerTitle = useMemo(() => {
    if (state.level === 0) return '五维总览';
    if (state.level === 1) return `课程 · ${state.dimension}`;
    return `概念 · ${state.course}`;
  }, [state]);

  /** 点击维度标签：L0→课程层，L1→概念层，L2 不可再下钻 */
  const handleTickClick = (value: string) => {
    if (!drill) return;
    if (state.level === 0) {
      if (drill.coursesByDimension[value]?.length) setState({ level: 1, dimension: value });
    } else if (state.level === 1 && state.dimension) {
      if (drill.conceptsByCourse[value]?.length) setState({ level: 2, dimension: state.dimension, course: value });
    }
  };

  const handleBack = () => {
    if (state.level === 2) setState({ level: 1, dimension: state.dimension });
    else setState({ level: 0 });
  };

  if (loading) return <RadarSkeleton />;
  if (!chartData.length) return null;

  const clickable = drill != null && state.level < 2;
  const activeTick =
    state.level === 1 ? state.dimension : state.level === 2 ? state.course : undefined;

  return (
    <div className="flex flex-col">
      {/* 层级导航：返回按钮 + 当前层级标题 */}
      <div className="flex items-center justify-between mb-1 min-h-6">
        {state.level > 0 ? (
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-[11px] text-text-tertiary hover:text-brand-400 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            {state.level === 2 ? '返回课程' : '返回总览'}
          </button>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-text-tertiary">{layerTitle}</span>
      </div>

      {currentData.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <RechartsRadar data={currentData} outerRadius="72%">
            <defs>
              <linearGradient id="radar-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--kb-brand-500)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--kb-brand-500)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <PolarGrid stroke="var(--kb-border-default)" strokeOpacity={0.4} />
            <PolarAngleAxis dataKey="label" tick={<AngleTick onClick={clickable ? handleTickClick : undefined} activeValue={activeTick} clickable={clickable} />} />
            <Radar
              dataKey="value"
              stroke="var(--kb-brand-500)"
              strokeWidth={2}
              fill="url(#radar-fill)"
            />
          </RechartsRadar>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-[280px] flex items-center justify-center text-[12px] text-text-tertiary">
          该层级暂无数据，继续学习后这里会亮起来
        </div>
      )}

      {/* 钻取提示（仅可下钻层级显示） */}
      {clickable && (
        <p className="text-center text-[10px] text-text-tertiary/70 -mt-1">
          {state.level === 0 ? '点击维度查看课程分解' : '点击课程查看概念掌握度'}
        </p>
      )}
    </div>
  );
};

export default React.memo(RadarChart);
