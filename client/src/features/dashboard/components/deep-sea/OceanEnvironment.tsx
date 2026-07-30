/**
 * @file 深海环境层组件
 * @description 全局深海背景：渐变底色 + 浮力粒子 + 水压深度指示器
 * @ai-context: 纯视觉组件，fixed 定位在 z-index 最低层，不响应交互
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { DepthZone } from './useDepthScroll';

interface Props {
  depthPercent: number;
  currentZone: DepthZone;
}

/** 各层环境色 */
const ZONE_COLORS: Record<DepthZone, { from: string; to: string }> = {
  surface:  { from: '#1a4a5e', to: '#15405a' },
  sunlight: { from: '#13384a', to: '#0f2e3e' },
  twilight: { from: '#0e2a3a', to: '#0b2030' },
  midnight: { from: '#0A1A2A', to: '#060f1a' },
};

/** 确定性伪随机 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/** 浮力粒子数据（预生成，避免每帧计算） */
interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  blur: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: seededRandom(i * 7 + 3) * 100,
    size: 1 + seededRandom(i * 13 + 5) * 3,
    duration: 8 + seededRandom(i * 17 + 11) * 16,
    delay: seededRandom(i * 23 + 7) * 10,
    opacity: 0.1 + seededRandom(i * 31 + 13) * 0.25,
    blur: seededRandom(i * 37 + 19) > 0.5 ? 1 : 0,
  }));
}

/** 深度标尺刻度 */
const DEPTH_MARKERS = [
  { zone: 'surface' as DepthZone, label: '海面', depth: '0m' },
  { zone: 'sunlight' as DepthZone, label: '透光层', depth: '~50m' },
  { zone: 'twilight' as DepthZone, label: '中层', depth: '~200m' },
  { zone: 'midnight' as DepthZone, label: '深渊', depth: '~1000m' },
];

const OceanEnvironment = React.memo(function OceanEnvironment({ depthPercent, currentZone }: Props) {
  const prefersReduced = useReducedMotion();
  const particles = useMemo(() => generateParticles(prefersReduced ? 0 : 40), [prefersReduced]);
  const colors = ZONE_COLORS[currentZone];

  /** 粒子密度随深度增加 */
  const particleOpacityMultiplier = 0.6 + depthPercent * 0.9;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* 渐变背景 */}
      <motion.div
        className="absolute inset-0 transition-colors duration-[2000ms] ease-in-out"
        style={{
          background: `linear-gradient(180deg, ${colors.from} 0%, ${colors.to} 100%)`,
        }}
      />

      {/* 微纸质噪点基底 */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        }}
      />

      {/* 浮力粒子系统 */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-cyan-200/30"
            style={{
              left: `${p.x}%`,
              width: p.size,
              height: p.size,
              opacity: (p.blur ? 0.7 : 1) * p.opacity * particleOpacityMultiplier,
              animation: `kb-float-up ${p.duration}s ease-in-out ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* 水压深度指示器（右侧） */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 w-6">
        {/* 深度轨道 */}
        <div className="relative w-0.5 h-32 rounded-full bg-white/10 overflow-visible">
          {/* 当前位置指示 */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400/80 shadow-[0_0_6px_rgba(34,211,238,0.6)]"
            style={{ top: `${depthPercent * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
        {/* 刻度标签 */}
        <div className="flex flex-col items-center gap-3 mt-1">
          {DEPTH_MARKERS.map((m) => (
            <div
              key={m.zone}
              className={`text-[7px] leading-none transition-colors duration-500 ${
                currentZone === m.zone ? 'text-cyan-300/80' : 'text-white/20'
              }`}
              title={`${m.label} ${m.depth}`}
            >
              {m.depth}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default OceanEnvironment;
