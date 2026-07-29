/**
 * @file 水母游动轨迹 -- 学习趋势
 * @description 学习趋势以水母群游动轨迹形态呈现，SVG 面积图 + 有机动态
 * @ai-context: 替代原 TrendChart.tsx，兼容 TrendPoint 数据接口
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { TrendPoint } from '@/features/dashboard/types/analytics';

interface Props {
  data: TrendPoint[];
  loading?: boolean;
}

function TrendSkeleton() {
  return (
    <div className="w-full h-[120px] flex items-end gap-0.5 px-4 pb-2">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-cyan-400/10"
          style={{
            height: `${20 + Math.random() * 60}%`,
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default function JellyfishTrend({ data, loading }: Props) {
  const prefersReduced = useReducedMotion();

  const width = 400;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  /** SVG 路径计算 */
  const { areaPath, linePath, points } = useMemo(() => {
    if (!data.length) return { areaPath: '', linePath: '', points: [] as { x: number; y: number; value: number; date: string }[] };
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const step = chartW / Math.max(data.length - 1, 1);

    const pts = data.map((d, i) => ({
      x: padding.left + i * step,
      y: padding.top + chartH - (d.value / maxVal) * chartH,
      value: d.value,
      date: d.date,
    }));

    // 平滑曲线
    const line = pts.map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = pts[i - 1];
      const cpx = (prev.x + p.x) / 2;
      return `C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
    }).join(' ');

    const area = `${line} L ${pts[pts.length - 1].x} ${padding.top + chartH} L ${pts[0].x} ${padding.top + chartH} Z`;

    return { areaPath: area, linePath: line, points: pts };
  }, [data, chartW, chartH, padding.left, padding.top]);

  if (loading) return <TrendSkeleton />;
  if (!data.length) return null;

  /** 格式化日期标签 */
  const formatDate = (d: string) => {
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  };

  return (
    <motion.div
      className="relative rounded-[var(--kb-radius-lg)] border border-cyan-400/15 bg-bg-elevated/20 backdrop-blur-sm overflow-hidden"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label="学习趋势"
    >
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <h3 className="text-[10px] font-medium text-cyan-200/60">水母轨迹 -- 认知负熵指数</h3>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[120px]">
        <defs>
          <linearGradient id="trend-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--kb-brand-400)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--kb-brand-400)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="trend-line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--kb-brand-400)" stopOpacity={0.4} />
            <stop offset="50%" stopColor="var(--kb-brand-400)" stopOpacity={0.8} />
            <stop offset="100%" stopColor="var(--kb-brand-400)" stopOpacity={0.4} />
          </linearGradient>
        </defs>

        {/* 面积填充 */}
        <motion.path
          d={areaPath}
          fill="url(#trend-area-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />

        {/* 趋势线 */}
        <motion.path
          d={linePath}
          fill="none"
          stroke="url(#trend-line-grad)"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />

        {/* 脉冲动画（水母呼吸） */}
        {!prefersReduced && points.length > 0 && (
          <motion.circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={4}
            fill="var(--kb-brand-400)"
            opacity={0.6}
            animate={{
              r: [4, 8, 4],
              opacity: [0.6, 0.2, 0.6],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* X 轴标签（首尾） */}
        {points.length > 1 && (
          <>
            <text x={points[0].x} y={height - 4} fill="var(--kb-text-tertiary)" fontSize={7} textAnchor="start" opacity={0.5}>
              {formatDate(points[0].date)}
            </text>
            <text x={points[points.length - 1].x} y={height - 4} fill="var(--kb-text-tertiary)" fontSize={7} textAnchor="end" opacity={0.5}>
              {formatDate(points[points.length - 1].date)}
            </text>
          </>
        )}
      </svg>
    </motion.div>
  );
}
