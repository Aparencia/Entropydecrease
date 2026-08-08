/**
 * ChronosSphere — 时间生物 3D 主体
 *
 * 严格遵循设计方案：由「光子、微粒、液态金属」共同构成的具有生命感的球体。
 *  - 液态金属主体：高细分球体 + 环境映射（PMREM RoomEnvironment）+ 金属度/粗糙度，
 *    表面以多层波状噪声流动（液态起伏），computeVertexNormals 保持金属反光正确
 *  - 光子内层：球体内部发光光点（AdditiveBlending），缓慢流动，随呼吸脉动
 *  - 微粒外层：球壳微粒，随阶段聚散、专注完成时绽放爆发
 *  - 呼吸波纹环：周期扩散脉冲
 *
 * 双风格差异化：deep-sea = 深色液态水银（高金属镜面、冷色辉光）；
 * aurora-dome = 亮银磨砂（柔和反射、紫粉辉光）。
 * useFrame 驱动全部动画（与 React tick 解耦）；阶段过渡 lerp 平滑；
 * 守护灵 intensity 微调节奏；bloom 边沿触发绽放。
 *
 * @ai-context: Chronos 时间生物核心 3D 组件（液态金属 + 光子 + 微粒）。
 */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import type { ChronosPhase, ChronosStyle } from './chronosStyles';
import { CHRONOS_PHASES } from './chronosStyles';

/** 长按判定阈值（ms） */
const LONG_PRESS_MS = 800;
/** 点击判定阈值（ms） */
const TAP_MAX_MS = 500;

interface ChronosSphereProps {
  phase: ChronosPhase;
  style: ChronosStyle;
  /** 守护灵分心分数 0-100 */
  intensity?: number;
  /** 环境光亮度 0-1 */
  ambientLight?: number;
  /** 完成绽放触发 */
  bloom?: boolean;
  /** 点击生物回调 */
  onTap?: () => void;
  /** 长按生物回调（进入沉睡） */
  onLongPress?: () => void;
}

/** 液态流动噪声：多层波叠加（区别于随机细胞膜抖动） */
function liquidNoise(x: number, y: number, z: number, t: number): number {
  return (
    Math.sin(x * 3.5 + t * 1.1) * Math.cos(y * 2.8 + t * 0.7) * 0.6 +
    Math.sin((x + z) * 5.2 + t * 1.6) * Math.cos((y - z) * 4.4 + t * 0.9) * 0.4
  );
}

export function ChronosSphere({ phase, style, intensity = 50, ambientLight = 0.5, bloom = false, onTap, onLongPress }: ChronosSphereProps) {
  const { gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const photonRef = useRef<THREE.Points>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // 性能档位：low 隔 2 帧更新粒子/顶点
  const tier = useEffectiveTier();
  const frameSkip = tier === 'low' ? 3 : tier === 'medium' ? 2 : 1;
  const frameRef = useRef(0);
  const lowTier = tier === 'low';

  // ── 环境映射：本地生成（RoomEnvironment PMREM），零网络依赖 ──
  const envMap = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    return rt.texture;
  }, [gl]);

  // 当前值（useFrame 中向 targets 收敛，平滑过渡）
  const current = useRef({
    color: new THREE.Color(CHRONOS_PHASES[phase].body),
    emissive: CHRONOS_PHASES[phase].emissiveIntensity,
  });
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

  // ── 手势：tap（<500ms）与 long-press（800ms）──
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
    if (Date.now() - pointerDownRef.current < TAP_MAX_MS && onTap) onTap();
  };

  // ── 液态金属主体：高细分二十面体 + 原始顶点缓存 ──
  const liquidGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 5);
    geo.userData.original = geo.attributes.position.array.slice();
    return geo;
  }, []);

  // ── 光子内层：球体内部发光光点 ──
  const photonGeo = useMemo(() => {
    const count = style.photonCount;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 0.3 + Math.random() * 0.55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return geo;
  }, [style.photonCount]);

  // ── 微粒外层：球壳微粒（聚散 + 绽放）──
  const particleCount = style.particleCount;
  const particles = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    const colorA = new THREE.Color(style.particleColor);
    const colorB = new THREE.Color(style.particleSecondary);
    for (let i = 0; i < particleCount; i++) {
      const r = 1.05 + Math.random() * 0.55;
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

  const bloomRef = useRef(0);
  const isBlooming = useRef(false);
  const prevBloom = useRef(bloom);
  // bloom false→true 边沿触发绽放
  useEffect(() => {
    if (bloom && !prevBloom.current) {
      isBlooming.current = true;
    }
    prevBloom.current = bloom;
  }, [bloom]);
  // 卸载清理长按定时器
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // 每帧动画
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const safeDelta = Math.min(clock.getDelta(), 0.1);
    frameRef.current += 1;
    const shouldUpdate = frameRef.current % frameSkip === 0;
    const step = frameSkip;

    // 绽放推进
    if (isBlooming.current) {
      bloomRef.current = Math.min(1, bloomRef.current + safeDelta * 1.2);
      if (bloomRef.current >= 1) {
        isBlooming.current = false;
        bloomRef.current = 0;
      }
    }
    const bloomPulse = isBlooming.current ? 1 + bloomRef.current * 0.8 : 1;
    const focusFactor = 0.7 + (intensity / 100) * 0.6;

    // 颜色/发光平滑过渡
    const lerpK = Math.min(safeDelta * 2.5, 1);
    current.current.color.lerp(targets.current.bodyColor, lerpK);
    current.current.emissive += (targets.current.emissive - current.current.emissive) * lerpK;
    if (materialRef.current) {
      const ambientBoost = 1 + (0.5 - ambientLight) * 1.2;
      materialRef.current.emissiveIntensity = current.current.emissive * Math.max(0.4, ambientBoost);
      materialRef.current.color.copy(current.current.color);
    }

    // 呼吸缩放 + 液态表面流动（跳帧更新顶点与法线）
    if (meshRef.current) {
      const breath = 1 + Math.sin(t * 1.2 * focusFactor) * targets.current.breathe;
      meshRef.current.scale.setScalar(breath * bloomPulse);
      meshRef.current.rotation.y += safeDelta * targets.current.spin * focusFactor;

      if (shouldUpdate && !lowTier) {
        const pos = liquidGeo.attributes.position as THREE.BufferAttribute;
        const original = liquidGeo.userData.original as Float32Array;
        const amp = style.noiseAmplitude * (0.6 + targets.current.breathe * 8);
        for (let i = 0; i < pos.count; i++) {
          const i3 = i * 3;
          const ox = original[i3];
          const oy = original[i3 + 1];
          const oz = original[i3 + 2];
          const n = liquidNoise(ox * 3, oy * 3, oz * 3, t * focusFactor);
          pos.setXYZ(i3 / 3, ox + n * amp, oy + n * amp, oz + n * amp);
        }
        pos.needsUpdate = true;
        liquidGeo.computeVertexNormals(); // 液态起伏需要法线更新，金属反光才正确流动
      }
    }

    // 光子内层：整体缓慢旋转 + 呼吸脉动
    if (photonRef.current) {
      photonRef.current.rotation.y += safeDelta * 0.35;
      photonRef.current.rotation.x += safeDelta * 0.12;
      const pulse = 1 + Math.sin(t * 1.2 * focusFactor) * targets.current.breathe * 0.6;
      photonRef.current.scale.setScalar(pulse * bloomPulse);
    }

    // 微粒外层：聚散 + 绽放爆发（跳帧）
    if (pointsRef.current && shouldUpdate) {
      const posAttr = particleGeo.attributes.position as THREE.BufferAttribute;
      const targetR = targets.current.particleRadius;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        const targetLen = targetR * (isBlooming.current ? 1 + bloomRef.current * 2 : 1);
        const newLen = len + (targetLen - len) * Math.min(safeDelta * step * 1.5, 1);
        const k = newLen / len;
        posAttr.setXYZ(i, x * k, y * k, z * k);
      }
      posAttr.needsUpdate = true;
      pointsRef.current.rotation.y += safeDelta * 0.15;
    }

    // 呼吸波纹（扩散环）
    if (ringRef.current && ringMatRef.current) {
      const cycle = (t * focusFactor) % 1;
      ringRef.current.scale.setScalar((1 + cycle * 1.4) * bloomPulse);
      ringMatRef.current.opacity = Math.max(0, 0.35 * (1 - cycle) * (isBlooming.current ? 1.5 : 1));
    }
  });

  return (
    <group
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelLongPress}
    >
      {/* 液态金属主体 */}
      <mesh ref={meshRef} geometry={liquidGeo} castShadow>
        <meshStandardMaterial
          ref={materialRef}
          color={current.current.color}
          metalness={style.metalness}
          roughness={style.roughness}
          envMap={envMap}
          envMapIntensity={style.envMapIntensity}
          emissive={style.emissiveColor}
          emissiveIntensity={current.current.emissive}
        />
      </mesh>

      {/* 光子内层：球体内部发光光点 */}
      <points ref={photonRef} geometry={photonGeo}>
        <pointsMaterial
          size={0.055}
          color={style.photonColor}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* 微粒外层：球壳微粒 */}
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