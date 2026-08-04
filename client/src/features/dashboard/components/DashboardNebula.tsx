/**
 * 知识星空 · 星云氛围层
 * @description 仪表盘沉浸背景：靛蓝/赛博青/琥珀星云 + 闪烁星点 + 漂移光晕
 * @ai-context 纯 CSS 驱动（零 JS 调度）；L0 全量（20 星点 + 2 光晕），L1 减量（10 星点），L2 仅渐变静帧
 */
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import '../styles/dashboard-nebula.css';

/** 降级级别：与项目其他模块同源 */
export type NebulaDegradation = 'L0' | 'L1' | 'L2';

interface DashboardNebulaProps {
  degradation: NebulaDegradation;
}

/** 确定性伪随机 @ai-context 星点位置/时长可复现 */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  soft: boolean;
}

function generateStars(count: number): Star[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: seeded(i * 7 + 3) * 96 + 2,
    y: seeded(i * 11 + 41) * 96 + 2,
    size: 1.5 + seeded(i * 13 + 5) * 2.5,
    duration: 4 + seeded(i * 17 + 11) * 6,
    delay: seeded(i * 23 + 7) * 5,
    soft: seeded(i * 29 + 13) > 0.5,
  }));
}

/** 漂移光晕配置 @ai-context 超慢速漂移的星云光团 */
const DRIFT_ORBS = [
  { x: '18%', y: '30%', size: 300, bg: 'var(--kb-nebula-core-a)' },
  { x: '72%', y: '55%', size: 260, bg: 'var(--kb-nebula-core-b)' },
] as const;

/**
 * 星云背景组件
 * @ai-context 相对容器绝对定位，随主题自动适配晨曦星云/深空星云
 */
export default function DashboardNebula({ degradation }: DashboardNebulaProps) {
  const prefersReduced = useReducedMotion();

  const starCount = degradation === 'L1' ? 10 : 20;
  const stars = useMemo(
    () => generateStars(prefersReduced ? 0 : starCount),
    [prefersReduced, starCount],
  );
  const showDrift = degradation !== 'L2' && !prefersReduced;
  const animPlay = prefersReduced ? 'paused' as const : undefined;

  return (
    <div className="kb-nebula" aria-hidden="true">
      {/* 星点 */}
      {stars.map((s) => (
        <div
          key={s.id}
          className={`kb-nebula-star${s.soft ? ' kb-nebula-star-soft' : ''}`}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            ['--kb-star-duration' as string]: `${s.duration}s`,
            ['--kb-star-delay' as string]: `${s.delay}s`,
            animationPlayState: animPlay,
          }}
        />
      ))}

      {/* 漂移光晕 */}
      {showDrift && DRIFT_ORBS.map((orb, i) => (
        <div
          key={`drift-${i}`}
          className="kb-nebula-drift"
          style={{
            left: orb.x,
            top: orb.y,
            width: orb.size,
            height: orb.size,
            background: orb.bg,
            animationPlayState: animPlay,
          }}
        />
      ))}
    </div>
  );
}