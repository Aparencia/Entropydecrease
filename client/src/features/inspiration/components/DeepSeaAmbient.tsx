/**
 * 深海环境动画层
 * @description 浮力微粒 + 环境光晕球 + 焦散光斑 + 水母脉动光晕 + 漂移光带 + 底部雾气层 + 深度粒子层
 * @ai-context 纯 CSS 动画驱动（零 JS 调度），仅使用 transform + opacity（GPU composite 层）
 */
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { DegradationLevel } from '../types';

interface DeepSeaAmbientProps {
  degradation: DegradationLevel;
}

/** 确定性伪随机 */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: seeded(i * 7 + 3) * 100,
    size: 1 + seeded(i * 13 + 5) * 3,
    duration: 10 + seeded(i * 17 + 11) * 14,
    delay: seeded(i * 23 + 7) * 8,
    opacity: 0.08 + seeded(i * 31 + 13) * 0.18,
  }));
}

/** 光晕球配置 */
const GLOW_ORBS = [
  { x: '20%', y: '30%', size: 260, color: 'rgba(34, 211, 238, 0.06)', duration: '8s' },
  { x: '70%', y: '60%', size: 220, color: 'rgba(139, 92, 246, 0.05)', duration: '10s' },
  { x: '50%', y: '80%', size: 200, color: 'rgba(34, 211, 238, 0.04)', duration: '12s' },
] as const;

/** 水母脉动光晕配置 */
const JELLY_ORBS = [
  { x: '15%', y: '20%', size: 100, color: 'rgba(34, 211, 238, 0.06)', duration: '10s', delay: '0s' },
  { x: '75%', y: '45%', size: 120, color: 'rgba(139, 92, 246, 0.05)', duration: '12s', delay: '3s' },
  { x: '45%', y: '70%', size: 80, color: 'rgba(34, 211, 238, 0.04)', duration: '8s', delay: '5s' },
] as const;

/** 慢速漂移光带配置 */
const DRIFT_RAYS = [
  { y: '25%', width: 700, height: 100, duration: '18s', delay: '0s' },
  { y: '60%', width: 600, height: 80, duration: '22s', delay: '5s' },
] as const;

/** 深度粒子颜色池 */
const DEPTH_PARTICLE_COLORS = [
  'bg-cyan-300/15',
  'bg-purple-300/12',
  'bg-amber-200/10',
  'bg-white/8',
] as const;

interface DepthParticle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  colorClass: string;
}

function generateDepthParticles(count: number): DepthParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: seeded(i * 11 + 41) * 100,
    size: 3 + seeded(i * 19 + 53) * 3,
    duration: 15 + seeded(i * 23 + 67) * 10,
    delay: seeded(i * 29 + 71) * 12,
    colorClass: DEPTH_PARTICLE_COLORS[Math.floor(seeded(i * 37 + 79) * DEPTH_PARTICLE_COLORS.length)],
  }));
}

/**
 * 深海环境动画组件
 * 浮力微粒（CSS kb-float-up）+ 环境光晕（CSS kb-ambient-glow）+ 焦散光斑（CSS kb-caustic-drift）
 * + 水母脉动光晕（CSS kb-jelly-pulse）+ 漂移光带（CSS kb-drift-ray）+ 底部雾气层 + 深度粒子层
 */
export default function DeepSeaAmbient({ degradation }: DeepSeaAmbientProps) {
  const prefersReduced = useReducedMotion();

  // L1 减少粒子数，L0 正常
  const particleCount = degradation === 'L1' ? 6 : 18;
  const particles = useMemo(
    () => generateParticles(prefersReduced ? 0 : particleCount),
    [prefersReduced, particleCount],
  );

  // 深度粒子：L1 减至 3 个，L0 正常 10 个
  const depthParticleCount = degradation === 'L1' ? 3 : 10;
  const depthParticles = useMemo(
    () => generateDepthParticles(prefersReduced ? 0 : depthParticleCount),
    [prefersReduced, depthParticleCount],
  );

  // 水母光晕：L1 减至 1 个，L0 全部 3 个
  const jellyOrbs = degradation === 'L1' ? JELLY_ORBS.slice(0, 1) : JELLY_ORBS;

  // 漂移光带：L1 减至 1 条，L0 全部 2 条
  const driftRays = degradation === 'L1' ? DRIFT_RAYS.slice(0, 1) : DRIFT_RAYS;

  // L2 完全不渲染（hooks 之后再 early return）
  if (degradation === 'L2') return null;

  const animPlayState = prefersReduced ? 'paused' as const : undefined;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* 底部雾气层 — z-index 最低，位于所有元素最底层 */}
      <div
        className="kb-depth-fog absolute bottom-0 left-0 right-0"
        style={{
          height: '30%',
          background: 'linear-gradient(180deg, transparent 0%, rgba(6, 182, 212, 0.03) 60%, rgba(139, 92, 246, 0.02) 100%)',
          animation: prefersReduced ? undefined : 'kb-fog-breathe 30s ease-in-out infinite',
          animationPlayState: animPlayState,
        }}
      />

      {/* 漂移光带 */}
      {driftRays.map((ray, i) => (
        <div
          key={`drift-${i}`}
          className="kb-drift-ray absolute left-1/2"
          style={{
            top: ray.y,
            width: ray.width,
            height: ray.height,
            marginLeft: -ray.width / 2,
            background: `linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.04) 50%, transparent 100%)`,
            borderRadius: '50%',
            animation: prefersReduced ? undefined : `kb-drift-ray ${ray.duration} ease-in-out ${ray.delay} infinite`,
            animationPlayState: animPlayState,
          }}
        />
      ))}

      {/* 浮力微粒 */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-cyan-200/20"
            style={{
              left: `${p.x}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              animation: `kb-float-up ${p.duration}s ease-in-out ${p.delay}s infinite`,
              animationPlayState: animPlayState,
            }}
          />
        ))}
      </div>

      {/* 深度粒子层 */}
      <div className="absolute inset-0 overflow-hidden">
        {depthParticles.map((p) => (
          <div
            key={`depth-${p.id}`}
            className={`kb-depth-particle absolute rounded-full ${p.colorClass}`}
            style={{
              left: `${p.x}%`,
              width: p.size,
              height: p.size,
              animation: prefersReduced ? undefined : `kb-float-up ${p.duration}s ease-in-out ${p.delay}s infinite`,
              animationPlayState: animPlayState,
            }}
          />
        ))}
      </div>

      {/* 环境光晕球 */}
      {GLOW_ORBS.map((orb, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: orb.x,
            top: orb.y,
            width: orb.size,
            height: orb.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            animation: prefersReduced ? 'none' : `kb-ambient-glow ${orb.duration} ease-in-out infinite`,
          }}
        />
      ))}

      {/* 水母脉动光晕 */}
      {jellyOrbs.map((jelly, i) => (
        <div
          key={`jelly-${i}`}
          className="kb-jelly-orb"
          style={{
            position: 'absolute',
            left: jelly.x,
            top: jelly.y,
            width: jelly.size,
            height: jelly.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${jelly.color} 0%, transparent 70%)`,
            animation: prefersReduced ? undefined : `kb-jelly-pulse ${jelly.duration} ease-in-out ${jelly.delay} infinite`,
            animationPlayState: animPlayState,
          }}
        />
      ))}

      {/* 焦散光斑 */}
      <div
        className="kb-caustic-light"
        style={{
          top: '25%',
          left: '35%',
          animationPlayState: prefersReduced ? 'paused' : undefined,
        }}
      />
    </div>
  );
}
