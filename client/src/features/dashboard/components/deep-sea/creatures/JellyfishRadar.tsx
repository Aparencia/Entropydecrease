/**
 * @file 水母脉冲环 -- 五维能力雷达图
 * @description 五维雷达以水母脉冲环形态呈现，每个维度为一条发光触手
 * @ai-context: 替代原 RadarChart.tsx，兼容 RadarDimension 数据接口
 */
import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useInViewAnimation } from '@/hooks/useInViewAnimation';
import type { RadarDimension } from '@/features/dashboard/types/analytics';

interface Props {
  data: RadarDimension[];
  loading?: boolean;
}

/** 五边形顶点计算 */
function pentagonPoints(cx: number, cy: number, r: number, values: number[]): [number, number][] {
  return values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const radius = (v / 100) * r;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

function pointsToPath(points: [number, number][]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ') + ' Z';
}

function JellyfishRadarSkeleton() {
  return (
    <div className="w-full h-[200px] flex items-center justify-center">
      <div className="w-[140px] h-[140px] rounded-full border border-border/20 animate-pulse" />
    </div>
  );
}

const JellyfishRadar = React.memo(function JellyfishRadar({ data, loading }: Props) {
  const prefersReduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInViewAnimation(containerRef);
  const cx = 100, cy = 100, maxR = 70;

  /** 背景五边形网格（3层） */
  const gridRings = useMemo(() => [0.33, 0.66, 1.0].map((scale) => {
    const pts = pentagonPoints(cx, cy, maxR * scale, Array(5).fill(100));
    return pointsToPath(pts);
  }), []);

  /** 数据区域路径 */
  const dataPath = useMemo(() => {
    if (data.length < 5) return '';
    const values = data.map((d) => d.value);
    const pts = pentagonPoints(cx, cy, maxR, values);
    return pointsToPath(pts);
  }, [data]);

  /** 轴线 */
  const axes = useMemo(() => {
    return pentagonPoints(cx, cy, maxR, Array(5).fill(100)).map((p) => ({
      x1: cx, y1: cy, x2: p[0], y2: p[1],
    }));
  }, []);

  if (loading) return <JellyfishRadarSkeleton />;
  if (!data.length) return null;

  return (
    <motion.div
      ref={containerRef}
      className="relative w-full flex flex-col items-center"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label="五维能力雷达图"
    >
      <svg viewBox="0 0 200 200" className="w-full max-w-[220px]">
        <defs>
          <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--kb-brand-500)" stopOpacity={0.15} />
            <stop offset="100%" stopColor="var(--kb-brand-500)" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="tentacle-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--kb-brand-400)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="var(--kb-brand-600)" stopOpacity={0.2} />
          </linearGradient>
        </defs>

        {/* 中心发光 */}
        <circle cx={cx} cy={cy} r={maxR} fill="url(#radar-glow)" />

        {/* 网格环 */}
        {gridRings.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--kb-border-default)" strokeOpacity={0.2} strokeWidth={0.5} />
        ))}

        {/* 轴线 */}
        {axes.map((a, i) => (
          <line key={i} {...a} stroke="var(--kb-border-default)" strokeOpacity={0.15} strokeWidth={0.5} />
        ))}

        {/* 数据区域（水母体） */}
        <motion.path
          d={dataPath}
          fill="url(#tentacle-grad)"
          stroke="var(--kb-brand-400)"
          strokeWidth={1.5}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* 脉冲动画 */}
        {!prefersReduced && isInView && (
          <motion.path
            d={dataPath}
            fill="none"
            stroke="var(--kb-brand-400)"
            strokeWidth={1}
            initial={{ opacity: 0.4, scale: 1 }}
            animate={{ opacity: 0, scale: 1.15 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        )}

        {/* 数据点（触手末端发光） */}
        {data.map((dim, i) => {
          const pts = pentagonPoints(cx, cy, maxR, data.map((d) => d.value));
          const [px, py] = pts[i];
          return (
            <g key={dim.dimension}>
              <circle cx={px} cy={py} r={3} fill="var(--kb-brand-400)" opacity={0.8} />
              <circle cx={px} cy={py} r={5} fill="var(--kb-brand-400)" opacity={0.2} />
              {/* 维度标签 */}
              <text
                x={pentagonPoints(cx, cy, maxR + 14, Array(5).fill(100))[i][0]}
                y={pentagonPoints(cx, cy, maxR + 14, Array(5).fill(100))[i][1]}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--kb-text-secondary)"
                fontSize={8}
              >
                {dim.label}
              </text>
            </g>
          );
        })}
      </svg>
    </motion.div>
  );
});

export default JellyfishRadar;
