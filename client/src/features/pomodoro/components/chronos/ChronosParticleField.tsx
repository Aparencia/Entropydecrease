/**
 * ChronosParticleField — 时间生物环境微粒场
 *
 * 参考项目既有模式：ParticleSystem（useEffectiveTier 跳帧降级/漂移）与
 * TideBreath（isRunning 状态联动/lerp 缓动/reduced-motion 降级）。
 *
 * 环绕时间生物的外层"生命场"：粒子随番茄钟状态收拢/散开/加速——
 * 专注=向心收拢加速旋转（世界变深），休息=散开漂浮（放松），
 * 沉睡=静止微漂，绽放=粒子外爆。双风格取色自 CHRONOS_STYLES。
 *
 * @ai-context: Chronos 环境粒子场组件，挂载于 ChronosCanvas 内、生物主体外围。
 */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import type { ChronosPhase, ChronosStyle } from './chronosStyles';
import { CHRONOS_PHASES } from './chronosStyles';

interface ChronosParticleFieldProps {
  /** 生物阶段（驱动粒子场收拢/散开） */
  phase: ChronosPhase;
  /** 主题风格（深潜/极光） */
  style: ChronosStyle;
  /** 绽放触发（专注完成外爆） */
  bloom?: boolean;
}

/** 各状态的粒子场目标半径（环境场位于生物主体外围环带）
 * @ai-context: 半径域经视锥校准（camera z=5.0, fov=45° 时可见半高 ≈2.07）：
 * 原 3.2-3.6 域大部分粒子落在视锥外被裁剪，表现为"环境场几乎不可见"；
 * 收缩至 1.3-2.2 后主体环带完整落在视锥内，收拢/散开状态差异保留。 */
const FIELD_RADIUS: Record<ChronosPhase, number> = {
  idle: 2.0,
  breathing: 1.9,
  work: 1.5,
  short_break: 2.1,
  long_break: 2.2,
  final: 1.3,
};

/** 各状态粒子不透明度（专注最亮，沉睡最暗） */
const FIELD_OPACITY: Record<ChronosPhase, number> = {
  idle: 0.35,
  breathing: 0.5,
  work: 0.85,
  short_break: 0.6,
  long_break: 0.55,
  final: 0.9,
};

export function ChronosParticleField({ phase, style, bloom = false }: ChronosParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const tier = useEffectiveTier();
  const frameSkip = tier === 'low' ? 3 : tier === 'medium' ? 2 : 1;
  const frameRef = useRef(0);
  const lowTier = tier === 'low';

  const count = lowTier ? Math.floor(style.particleCount * 0.35) : style.particleCount;

  // 粒子数据：初始环带位置（垂直/深度双压扁成环绕盘，确保视锥内完整可见）+ 垂直漂移相位
  const { positions, colors, phaseOffset } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const off = new Float32Array(count);
    const colorA = new THREE.Color(style.particleColor);
    const colorB = new THREE.Color(style.particleSecondary);
    for (let i = 0; i < count; i++) {
      // 半径域 1.3-2.1（视锥校准后全部可见；原 2.0-3.6 大部分被裁剪）
      const r = 1.3 + Math.random() * 0.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6; // 垂直压扁，形成环绕盘
      pos[i * 3 + 2] = r * Math.cos(phi) * 0.55; // 深度压扁，减少视锥纵深裁剪
      off[i] = Math.random() * Math.PI * 2;
      const t = Math.random();
      const c = colorA.clone().lerp(colorB, t);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col, phaseOffset: off };
  }, [count, style.particleColor, style.particleSecondary]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  // 绽放边沿触发
  const bloomRef = useRef(0);
  const isBlooming = useRef(false);
  const prevBloom = useRef(bloom);
  useEffect(() => {
    if (bloom && !prevBloom.current) {
      isBlooming.current = true;
    }
    prevBloom.current = bloom;
  }, [bloom]);

  // 状态驱动的目标值缓存（避免每帧对象分配）
  const targetRef = useRef({
    radius: FIELD_RADIUS[phase],
    opacity: FIELD_OPACITY[phase],
    color: new THREE.Color(CHRONOS_PHASES[phase].body),
  });
  targetRef.current.radius = FIELD_RADIUS[phase];
  targetRef.current.opacity = FIELD_OPACITY[phase];
  targetRef.current.color.set(CHRONOS_PHASES[phase].body);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const safeDelta = Math.min(clock.getDelta(), 0.1);
    frameRef.current += 1;
    if (frameRef.current % frameSkip !== 0) return;
    const step = frameSkip;

    // 绽放推进
    if (isBlooming.current) {
      bloomRef.current = Math.min(1, bloomRef.current + safeDelta * 1.2);
      if (bloomRef.current >= 1) {
        isBlooming.current = false;
        bloomRef.current = 0;
      }
    }
    const bloomBoost = isBlooming.current ? 1 + bloomRef.current * 2.5 : 1;

    // 状态联动：向目标半径缓动 + 不透明度 lerp（TideBreath 模式）
    if (pointsRef.current && materialRef.current) {
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      const targetR = Math.min(4.5, targetRef.current.radius * bloomBoost);
      const lerpK = Math.min(safeDelta * step * 1.2, 1);
      const opacityK = Math.min(safeDelta * 2, 1);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = array[i3];
        const y = array[i3 + 1];
        const z = array[i3 + 2];
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        const newLen = len + (targetR - len) * lerpK;
        const k = newLen / len;
        // 垂直正弦漂移（基于绝对时钟相位，跳帧仍平滑——ParticleSystem 模式）
        const drift = Math.sin(t * 0.4 + phaseOffset[i]) * 0.06 * step;
        array[i3] = x * k;
        array[i3 + 1] = y * k + drift;
        array[i3 + 2] = z * k;
      }
      posAttr.needsUpdate = true;

      // 状态收拢加速旋转：专注越快，休息越慢
      const spinSpeed = phase === 'work' ? 0.22 : phase === 'final' ? 0.3 : phase === 'idle' ? 0.04 : 0.1;
      pointsRef.current.rotation.y += safeDelta * spinSpeed;
      // 不透明度平滑（沉睡最暗 → 专注最亮）
      materialRef.current.opacity += (targetRef.current.opacity - materialRef.current.opacity) * opacityK;
      // 主体色向阶段色微调（TideBreath 涨落式联动）
      materialRef.current.color.lerp(targetRef.current.color, opacityK);
    }
  });

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={FIELD_OPACITY[phase]}
        size={lowTier ? 0.08 : 0.07}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}