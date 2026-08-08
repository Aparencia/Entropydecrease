/**
 * ChronosSphere — 时间生物 3D 主体
 *
 * 有机球体（顶点扰动细胞膜质感）+ 粒子光环 + 呼吸波纹，
 * useFrame 驱动全部动画（不依赖 React 状态，与番茄钟每秒 tick 解耦）。
 *
 * 阶段变化通过 refs 记录目标值，每帧 lerp 平滑过渡；
 * 守护灵分心分数（intensity）微调光效节奏（P2）；
 * 完成绽放（bloom）为一次性粒子爆发动画（P1）。
 *
 * @ai-context: Chronos 时间生物核心 3D 组件。
 */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import type { ChronosPhase, ChronosStyle } from './chronosStyles';
import { CHRONOS_PHASES } from './chronosStyles';

/** 长按判定阈值（ms）：超过则触发 onLongPress 而非 onTap */
const LONG_PRESS_MS = 800;
/** 点击判定阈值（ms）：超过则不视为 tap */
const TAP_MAX_MS = 500;

interface ChronosSphereProps {
  /** 生物阶段 */
  phase: ChronosPhase;
  /** 主题风格（深潜/极光） */
  style: ChronosStyle;
  /** 守护灵分心分数 0-100（P2：分数低时光效节奏放缓） */
  intensity?: number;
  /** 环境光亮度 0-1（P2：暗环境增强自发光，亮环境减弱） */
  ambientLight?: number;
  /** 完成绽放触发（P1：一次性粒子爆发） */
  bloom?: boolean;
  /** 点击生物回调 */
  onTap?: () => void;
  /** 长按生物回调（进入沉睡） */
  onLongPress?: () => void;
}

/** 简易伪随机噪声（确定性，避免重渲染抖动） */
function noise(x: number, y: number, z: number, t: number): number {
  return (
    Math.sin(x * 3.1 + t * 0.8) * Math.cos(y * 2.7 + t * 0.6) * Math.sin(z * 3.3 + t * 0.5)
  );
}

export function ChronosSphere({ phase, style, intensity = 50, ambientLight = 0.5, bloom = false, onTap, onLongPress }: ChronosSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // 性能档位（P3-15 同源）：low 隔 2 帧更新粒子/顶点
  const tier = useEffectiveTier();
  const frameSkip = tier === 'low' ? 3 : tier === 'medium' ? 2 : 1;
  const frameRef = useRef(0);

  // 当前值（useFrame 中向 targets 收敛，实现平滑过渡）
  const current = useRef({
    color: new THREE.Color(CHRONOS_PHASES[phase].body),
    emissive: CHRONOS_PHASES[phase].emissiveIntensity,
  });

  // 目标值（阶段变化时更新，useFrame 中 lerp）
  const targets = useRef({
    bodyColor: new THREE.Color(CHRONOS_PHASES[phase].body),
    emissive: 0.3,
    breathe: 0.03,
    particleRadius: 1.2,
    spin: 0.1,
  });

  const palette = CHRONOS_PHASES[phase];
  targets.current.bodyColor.set(palette.body);
  targets.current.emissive = palette.emissiveIntensity;
  targets.current.breathe = palette.breatheAmplitude;
  targets.current.particleRadius = palette.particleRadius;
  targets.current.spin = palette.spinSpeed;

  // ── 手势：tap（<500ms）与 long-press（800ms）区分 ──
  const pointerDownRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    longPressFiredRef.current = false;
    pointerDownRef.current = Date.now();
    cancelLongPress();
    if (onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerUp = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    cancelLongPress();
    if (longPressFiredRef.current) return;
    const elapsed = Date.now() - pointerDownRef.current;
    if (elapsed < TAP_MAX_MS && onTap) onTap();
  };

  // 有机球体：细分二十面体 + 原始顶点缓存
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    geo.userData.original = geo.attributes.position.array.slice();
    return geo;
  }, []);

  // 粒子光环
  const particleCount = style.particleCount;
  const particles = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    const colorA = new THREE.Color(style.particleColor);
    const colorB = new THREE.Color(style.particleSecondary);
    for (let i = 0; i < particleCount; i++) {
      // 球壳分布（半径 1.2-1.6 的随机球面）
      const r = 1.2 + Math.random() * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const t = Math.random();
      const c = colorA.clone().lerp(colorB, t);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [particleCount, style.particleColor, style.particleSecondary]);

  const particleGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particles.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(particles.colors, 3));
    return geo;
  }, [particles]);

  const bloomRef = useRef(0); // 绽放进度 0-1（完成后回 0）
  const isBlooming = useRef(false);
  const prevBloom = useRef(bloom);

  // bloom false→true 边沿触发绽放（P1 完成动画）
  useEffect(() => {
    if (bloom && !prevBloom.current) {
      isBlooming.current = true;
    }
    prevBloom.current = bloom;
  }, [bloom]);

  // 卸载时清理长按定时器
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // 每帧动画
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const safeDelta = Math.min(clock.getDelta(), 0.1);

    // 低档跳帧：非更新帧直接返回（呼吸缩放仍每帧执行，视觉无感）
    frameRef.current += 1;
    const shouldUpdate = frameRef.current % frameSkip === 0;
    const step = frameSkip;

    // 绽放进度推进（P1 完成动画）
    if (isBlooming.current) {
      bloomRef.current = Math.min(1, bloomRef.current + safeDelta * 1.2);
      if (bloomRef.current >= 1) {
        isBlooming.current = false;
        bloomRef.current = 0;
      }
    }
    const bloomPulse = isBlooming.current ? 1 + bloomRef.current * 0.8 : 1;

    // 守护灵联动：低分 → 节奏放缓（P2）
    const focusFactor = 0.7 + (intensity / 100) * 0.6;

    // 颜色/发光平滑过渡：向目标 lerp（阶段切换不再瞬跳）
    const lerpK = Math.min(safeDelta * 2.5, 1);
    current.current.color.lerp(targets.current.bodyColor, lerpK);
    current.current.emissive += (targets.current.emissive - current.current.emissive) * lerpK;

    // 环境光补偿：暗环境增强自发光，亮环境减弱（P2）
    if (materialRef.current) {
      const ambientBoost = 1 + (0.5 - ambientLight) * 1.2;
      materialRef.current.emissiveIntensity = current.current.emissive * Math.max(0.4, ambientBoost);
      materialRef.current.color.copy(current.current.color);
    }

    // 呼吸缩放
    if (meshRef.current) {
      const breath = 1 + Math.sin(t * 1.2 * focusFactor) * targets.current.breathe;
      meshRef.current.scale.setScalar(breath * bloomPulse);
      meshRef.current.rotation.y += safeDelta * targets.current.spin * focusFactor;
    }

    // 跳帧更新：顶点扰动 + 粒子（low/medium 档降开销）
    if (shouldUpdate) {
      // 顶点扰动（细胞膜）
      if (meshRef.current) {
        const pos = geometry.attributes.position as THREE.BufferAttribute;
        const original = geometry.userData.original as Float32Array;
        const amp = style.noiseAmplitude * (0.6 + targets.current.breathe * 8);
        for (let i = 0; i < pos.count; i++) {
          const i3 = i * 3;
          const ox = original[i3];
          const oy = original[i3 + 1];
          const oz = original[i3 + 2];
          const n = noise(ox * 4, oy * 4, oz * 4, t * focusFactor);
          pos.setXYZ(i3 / 3, ox + n * amp, oy + n * amp, oz + n * amp);
        }
        pos.needsUpdate = true;
      }

      // 粒子：向球体聚拢/散开 + 绽放爆发
      if (pointsRef.current) {
        const posAttr = particleGeo.attributes.position as THREE.BufferAttribute;
        const targetR = targets.current.particleRadius;
        for (let i = 0; i < posAttr.count; i++) {
          const x = posAttr.getX(i);
          const y = posAttr.getY(i);
          const z = posAttr.getZ(i);
          const len = Math.sqrt(x * x + y * y + z * z) || 1;
          const targetLen = targetR * (isBlooming.current ? 1 + bloomRef.current * 2 : 1);
          // 向目标半径缓动（step 补偿跳帧）
          const newLen = len + (targetLen - len) * Math.min(safeDelta * step * 1.5, 1);
          const k = newLen / len;
          posAttr.setXYZ(i, x * k, y * k, z * k);
        }
        posAttr.needsUpdate = true;
        pointsRef.current.rotation.y += safeDelta * 0.15;
      }
    }

    // 呼吸波纹（扩散环）
    if (ringRef.current && ringMatRef.current) {
      const cycle = (t * focusFactor) % 1;
      const scale = 1 + cycle * 1.4;
      ringRef.current.scale.setScalar(scale * bloomPulse);
      ringMatRef.current.opacity = Math.max(0, 0.35 * (1 - cycle) * (isBlooming.current ? 1.5 : 1));
    }
  });

  return (
    <group
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelLongPress}
    >
      {/* 有机球体主体 */}
      <mesh ref={meshRef} geometry={geometry} castShadow>
        <meshStandardMaterial
          ref={materialRef}
          color={current.current.color}
          emissive={style.emissiveColor}
          emissiveIntensity={current.current.emissive}
          roughness={0.35}
          metalness={0.15}
          flatShading
        />
      </mesh>

      {/* 粒子光环 */}
      <points ref={pointsRef} geometry={particleGeo}>
        <pointsMaterial
          size={0.045}
          vertexColors
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* 呼吸波纹环 */}
      <mesh ref={ringRef} rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.85, 1.0, 48]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color={style.ringColor}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}