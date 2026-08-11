/** @file 7×24 学习热力图组件 — 纯 CSS Grid *
 * @ai-context: 通用组件：HeatmapChart。
 */
import React, { useState, useMemo, useCallback } from 'react';
import type { HeatmapCell } from '../types/analytics';

interface Props {
  data: HeatmapCell[];
  loading?: boolean;
}

const DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function HeatmapSkeleton() {
  return (
    <div className="w-full h-[220px] grid gap-[2px]" style={{ gridTemplateColumns: '24px repeat(24, 1fr)' }}>
      {Array.from({ length: 168 }).map((_, i) => (
        <div key={i} className="rounded-[2px] bg-bg-tertiary/30" style={{ animation: 'pulse-skeleton 1.5s ease-in-out infinite', animationDelay: `${(i % 12) * 80}ms` }} />
      ))}
    </div>
  );
}

/** 从 computed style 解析 hex 颜色 → [r, g, b] */
function parseColor(v: string): [number, number, number] {
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

/** RGB 三元组线性插值（供多段混色链使用，避免 string 中间态） */
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** RGB 三元组 → CSS 颜色串 */
function toCss(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const HeatmapChart: React.FC<Props> = ({ data, loading }) => {
  const [tip, setTip] = useState<{ day: string; hour: number; val: number; eff: number | null; peak: boolean; x: number; y: number } | null>(null);

  const { max, bg, brand, gold } = useMemo(() => {
    const mx = Math.max(...data.map((c) => c.value), 1);
    const s = getComputedStyle(document.documentElement);
    return {
      max: mx,
      bg: parseColor(s.getPropertyValue('--kb-bg-tertiary')),
      brand: parseColor(s.getPropertyValue('--kb-brand-500')),
      gold: parseColor(s.getPropertyValue('--kb-accent-400') || 'rgb(251,191,36)'),
    };
  }, [data]);

  // D5 效率维度：有效样本的完成率均值（0-1），无样本为 null
  const { maxEff, minEff } = useMemo(() => {
    const effs = data.map((c) => c.efficiency).filter((e): e is number => e != null);
    if (effs.length === 0) return { maxEff: 1, minEff: 0 };
    return { maxEff: Math.max(...effs, 1), minEff: Math.min(...effs, 0) };
  }, [data]);

  // D5 单元格配色：亮度=分钟数（原语义），色相=效率（高→品牌金，低→灰蓝）
  const cellColor = useCallback((c: HeatmapCell) => {
    const base = mix(bg, brand, c.value / max);
    if (c.efficiency == null) return toCss(base);
    const t = maxEff === minEff ? 0.5 : (c.efficiency - minEff) / (maxEff - minEff);
    return toCss(mix(base, gold, Math.min(1, Math.max(0, t)) * 0.55));
  }, [bg, brand, gold, max, maxEff, minEff]);

  const onEnter = useCallback((e: React.MouseEvent, c: HeatmapCell) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ day: DAYS[c.dayOfWeek], hour: c.hour, val: c.value, eff: c.efficiency ?? null, peak: c.peak ?? false, x: r.left + r.width / 2, y: r.top });
  }, []);
  const onLeave = useCallback(() => setTip(null), []);

  if (loading) return <HeatmapSkeleton />;

  return (
    <div className="relative select-none">
      <div className="flex gap-1">
        {/* Y 轴标签 */}
        <div className="flex flex-col justify-around pr-1 pt-[18px]">
          {DAYS.map((d) => (
            <div key={d} className="h-[14px] flex items-center text-[10px] text-text-tertiary leading-none">{d}</div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* X 轴标签 */}
          <div className="grid mb-1" style={{ gridTemplateColumns: 'repeat(24, 1fr)', gap: '2px' }}>
            {HOURS.map((h) => (
              <div key={h} className="text-[8px] text-text-tertiary text-center leading-none">{h % 3 === 0 ? h : ''}</div>
            ))}
          </div>
          {/* 网格 */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(24, 1fr)', gap: '2px' }}>
            {data.map((c) => (
              <div
                key={`${c.dayOfWeek}-${c.hour}`}
                className="h-[14px] rounded-[2px] cursor-pointer transition-opacity duration-150 hover:opacity-80"
                style={{
                  backgroundColor: cellColor(c),
                  // D5 黄金时段标注：高峰档格子加金色描边，突出个人高效窗口
                  boxShadow: c.peak && c.value > 0 ? 'inset 0 0 0 1px rgba(251,191,36,0.55)' : undefined,
                }}
                onMouseEnter={(e) => onEnter(e, c)}
                onMouseLeave={onLeave}
              />
            ))}
          </div>
        </div>
      </div>

      {/* D5 图例：分钟数 + 黄金时段 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-tertiary">
        <span>颜色深浅 = 专注分钟数</span>
        <span>颜色偏金 = 完成率更高</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.55)', backgroundColor: 'rgba(251,191,36,0.15)' }} />
          黄金时段（个人高峰档）
        </span>
      </div>

      {/* Tooltip */}
      {tip && (
        <div
          className="fixed z-50 px-2 py-1 rounded-[var(--kb-radius-sm)] bg-bg-elevated/95 backdrop-blur-sm border border-border/30 shadow-md pointer-events-none text-[10px] whitespace-nowrap"
          style={{ left: tip.x, top: tip.y - 32, transform: 'translateX(-50%)' }}
        >
          <span className="text-text-secondary">{tip.day} {tip.hour}:00</span>
          <span className="text-text-primary font-medium ml-1.5">{tip.val}分钟</span>
          {tip.eff != null && (
            <span className="text-text-secondary ml-1.5">完成率 {Math.round(tip.eff * 100)}%</span>
          )}
          {tip.peak && <span className="text-amber-400 ml-1.5">✦ 黄金时段</span>}
        </div>
      )}
    </div>
  );
};

export default React.memo(HeatmapChart);
