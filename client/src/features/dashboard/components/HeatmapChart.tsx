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

/** 线性插值两个 hex 颜色 */
function lerp(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

const HeatmapChart: React.FC<Props> = ({ data, loading }) => {
  const [tip, setTip] = useState<{ day: string; hour: number; val: number; x: number; y: number } | null>(null);

  const { max, bg, brand } = useMemo(() => {
    const mx = Math.max(...data.map((c) => c.value), 1);
    const s = getComputedStyle(document.documentElement);
    return { max: mx, bg: parseColor(s.getPropertyValue('--kb-bg-tertiary')), brand: parseColor(s.getPropertyValue('--kb-brand-500')) };
  }, [data]);

  const cellColor = useCallback((v: number) => lerp(bg, brand, v / max), [bg, brand, max]);

  const onEnter = useCallback((e: React.MouseEvent, c: HeatmapCell) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ day: DAYS[c.dayOfWeek], hour: c.hour, val: c.value, x: r.left + r.width / 2, y: r.top });
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
                style={{ backgroundColor: cellColor(c.value) }}
                onMouseEnter={(e) => onEnter(e, c)}
                onMouseLeave={onLeave}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tip && (
        <div
          className="fixed z-50 px-2 py-1 rounded-[var(--kb-radius-sm)] bg-bg-elevated/95 backdrop-blur-sm border border-border/30 shadow-md pointer-events-none text-[10px] whitespace-nowrap"
          style={{ left: tip.x, top: tip.y - 32, transform: 'translateX(-50%)' }}
        >
          <span className="text-text-secondary">{tip.day} {tip.hour}:00</span>
          <span className="text-text-primary font-medium ml-1.5">{tip.val}分钟</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(HeatmapChart);
