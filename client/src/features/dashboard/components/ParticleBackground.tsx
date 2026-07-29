/**
 * ParticleBackground — 纯CSS实现的轻量粒子效果
 * - 16个随机分布的圆形div
 * - 不同大小(2-8px)、不同opacity(0.1-0.4)
 * - CSS animation: 缓慢漂移(translateX/Y) + opacity呼吸
 * - 深色模式: 粒子为靛蓝/赛博青色
 * - 浅色模式: 粒子为琥珀/蓝色（更柔和）
 * - reduced-motion时隐藏
 *
 * @ai-context: 通用组件：ParticleBackground。
 */
import { useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface Particle {
  id: number;
  size: number;
  x: number;
  y: number;
  opacity: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
}

/** 稳定的伪随机种子生成器 */
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const s1 = seededRandom(i * 7 + 1);
    const s2 = seededRandom(i * 13 + 2);
    const s3 = seededRandom(i * 19 + 3);
    const s4 = seededRandom(i * 23 + 4);
    const s5 = seededRandom(i * 29 + 5);
    const s6 = seededRandom(i * 31 + 6);
    const s7 = seededRandom(i * 37 + 7);

    return {
      id: i,
      size: 2 + s1 * 6,             // 2-8px
      x: s2 * 100,                    // 0-100%
      y: s3 * 100,                    // 0-100%
      opacity: 0.1 + s4 * 0.3,       // 0.1-0.4
      duration: 12 + s5 * 18,        // 12-30s
      delay: s6 * -20,               // -20~0s (negative for initial offset)
      driftX: (s7 - 0.5) * 60,       // -30~30px drift
      driftY: (seededRandom(i * 41 + 8) - 0.5) * 40, // -20~20px drift
    };
  });
}

export default function ParticleBackground() {
  const reducedMotion = useReducedMotion();
  const particles = useMemo(() => generateParticles(16), []);

  if (reducedMotion) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none -z-10"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full kb-particle"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: p.opacity,
            '--drift-x': `${p.driftX}px`,
            '--drift-y': `${p.driftY}px`,
            '--duration': `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
