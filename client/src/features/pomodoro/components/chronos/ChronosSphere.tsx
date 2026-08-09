/**
 * ChronosSphere — 时间生物 3D 粒子球体（R3F WebGPU 渲染版）
 *
 * 使用 THREE.Points 实现 GPU 高效粒子渲染，与 2D 版（ChronosParticleField2D）
 * 视觉同构：球面坐标分布 + 六态形态描述符 + 增量角度旋转 + 透视投影。
 * 位置算法与 2D 版一致（静态分布 + 增量角度 + 聚集叠加），每粒子
 * 约 2 次三角函数，跳帧策略按性能档位降频。
 *
 * 双主题配色：deep-sea 冷光蓝绿 / aurora 紫青渐变。
 *
 * @ai-context: Chronos 3D 渲染组件；R3F Points 粒子球，WebGPU 渲染后端。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import { composeMorph, type Mood } from './particleMorphs';
import { computeStaticDistribution } from './particleDistribution';
import { CHRONOS_PALETTES } from './chronosStyles';
import type { ChronosState } from './chronosState';

/** 粒子最大数量 */
const MAX_PARTICLES = 1500;
/** 不可见粒子远点半径 */
const FAR_RADIUS = 6.0;
/** 专注聚集下限（初始分散态不全空） */
const GATHER_FLOOR = 0.3;
/** 专注分散态半径倍率 */
const GATHER_DISPERSED_SCALE = 2.6;

interface ChronosSphereProps {
  state: ChronosState;
  mood?: Mood;
  /** 剩余比例 0-1（remaining/total） */
  progress: number;
  /** 降级：粒子数 -60% */
  degraded?: boolean;
}

export function ChronosSphere({ state, mood, progress, degraded = false }: ChronosSphereProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const theme = useSceneTheme();
  const tier = useEffectiveTier();
  const morph = composeMorph(mood, state, theme);
  const palette = CHRONOS_PALETTES[theme][state];
  const count = degraded ? 600 : MAX_PARTICLES;

  // 跳帧：high 每帧，medium 隔 1 帧，low 隔 2 帧
  const frameSkip = tier === 'low' ? 3 : tier === 'medium' ? 2 : 1;
  const frameRef = useRef(0);
  const extraAngle = useRef(0);
  const angles = useRef(new Float32Array(MAX_PARTICLES));
  const timeRef = useRef(0);
  const prevPos = useRef(new Float32Array(MAX_PARTICLES * 3));

  // 基础球面参数 + 静态分布预计算
  const base = useMemo(() => {
    const theta0 = new Float32Array(MAX_PARTICLES);
    const phi0 = new Float32Array(MAX_PARTICLES);
    const speed = new Float32Array(MAX_PARTICLES);
    const u = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      theta0[i] = Math.random() * Math.PI * 2;
      phi0[i] = Math.acos(2 * Math.random() - 1);
      speed[i] = 0.6 + Math.random() * 0.8;
      u[i] = Math.random();
    }
    return { theta0, phi0, speed, u };
  }, []);

  // 预计算静态位置与远点位置
  const pre = useMemo(() => {
    const staticPos = new Float32Array(MAX_PARTICLES * 3);
    computeStaticDistribution(morph.distribution, morph.visibleRatio, base, staticPos);
    const farPos = new Float32Array(MAX_PARTICLES * 3);
    const dirX = new Float32Array(MAX_PARTICLES);
    const dirY = new Float32Array(MAX_PARTICLES);
    const dirZ = new Float32Array(MAX_PARTICLES);
    const dirScale = new Float32Array(MAX_PARTICLES);
    const riverPhase = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const i3 = i * 3;
      const th0 = base.theta0[i];
      const ph0 = base.phi0[i];
      const ui = base.u[i];
      farPos[i3] = FAR_RADIUS * Math.sin(ph0) * Math.cos(th0);
      farPos[i3 + 1] = FAR_RADIUS * Math.cos(ph0);
      farPos[i3 + 2] = FAR_RADIUS * Math.sin(ph0) * Math.sin(th0);
      dirX[i] = Math.sin(ph0) * Math.cos(th0);
      dirY[i] = Math.cos(ph0);
      dirZ[i] = Math.sin(ph0) * Math.sin(th0);
      dirScale[i] = 0.5 + 0.5 * Math.cbrt(ui / Math.max(0.001, morph.visibleRatio));
      riverPhase[i] = th0 * 2 + ph0;
    }
    return { staticPos, farPos, dirX, dirY, dirZ, dirScale, riverPhase };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph.distribution, morph.visibleRatio]);

  // 初始位置、颜色、大小 buffer（固定大小，drawRange 控制可见数）
  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const sz = new Float32Array(MAX_PARTICLES);
    const pRgb = new THREE.Color(palette.particle);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const i3 = i * 3;
      // 初始位置：静态分布
      pos[i3] = pre.staticPos[i3];
      pos[i3 + 1] = pre.staticPos[i3 + 1];
      pos[i3 + 2] = pre.staticPos[i3 + 2];
      // 颜色：粒子基色
      const c = pRgb.clone();
      col[i3] = c.r;
      col[i3 + 1] = c.g;
      col[i3 + 2] = c.b;
      // 初始 prevPos
      prevPos.current[i3] = pos[i3];
      prevPos.current[i3 + 1] = pos[i3 + 1];
      prevPos.current[i3 + 2] = pos[i3 + 2];
      // 大小
      sz[i] = 0.03 + Math.random() * 0.06;
    }
    return { positions: pos, colors: col, sizes: sz };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre.staticPos]);

  // 颜色与状态缓存（避免每帧 new THREE.Color 和重复计算）
  const colorCache = useRef({
    r: 255, g: 255, b: 255,
    pRgb: new THREE.Color(),
    tRgb: new THREE.Color(),
    heatColor: new THREE.Color('#F97316'),
  });

  useFrame(({ clock }, delta) => {
    if (!pointsRef.current) return;

    // 跳帧
    frameRef.current += 1;
    if (frameRef.current % frameSkip !== 0) return;

    const safeDelta = Math.min(delta, 0.1);
    timeRef.current += safeDelta;
    const t = timeRef.current;

    // 状态收敛
    const k = Math.min(safeDelta * 2, 1);
    const heat = state === 'focus' ? 1 - progress : 0;
    const gatherProgress = state === 'focus' ? 1 - progress : 0;
    const visibleRatio = state === 'focus'
      ? Math.min(1, GATHER_FLOOR + (1 - GATHER_FLOOR) * gatherProgress * 1.2)
      : morph.visibleRatio;

    // 颜色更新（复用缓存 Color 对象，避免每帧 new）
    const cc = colorCache.current;
    cc.pRgb.set(palette.particle);
    cc.tRgb.set(morph.tint);
    let tr = cc.pRgb.r * 0.7 + cc.tRgb.r * 0.3;
    let tg = cc.pRgb.g * 0.7 + cc.tRgb.g * 0.3;
    let tb = cc.pRgb.b * 0.7 + cc.tRgb.b * 0.3;
    if (heat > 0.02) {
      tr = tr + (cc.heatColor.r - tr) * heat;
      tg = tg + (cc.heatColor.g - tg) * heat;
      tb = tb + (cc.heatColor.b - tb) * heat;
    }
    cc.r += (tr * 255 - cc.r) * k;
    cc.g += (tg * 255 - cc.g) * k;
    cc.b += (tb * 255 - cc.b) * k;

    // 整体旋转
    extraAngle.current += safeDelta * (state === 'focus' ? 0.1 : state === 'asleep' ? 0 : 0.04);
    const ea = extraAngle.current;

    const R = morph.radius;
    const R_scale = R / Math.max(morph.radius, 0.1);
    const heart = 1 + Math.sin(t * Math.PI * 2) * 0.06;
    const posK = Math.min(safeDelta * 3, 1);
    const flowRateBase = morph.flowSpeed;
    const isTorrent = morph.distribution === 'torrent';
    const isCanopy = morph.distribution === 'canopy';
    const isFocusGather = state === 'focus' && gatherProgress < 1;
    const dirR = R * GATHER_DISPERSED_SCALE;

    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const colArray = colAttr.array as Float32Array;

    // 更新可见粒子数
    pointsRef.current.geometry.setDrawRange(0, count);

    const { staticPos, farPos, dirX, dirY, dirZ, dirScale, riverPhase } = pre;
    const { theta0, phi0, speed, u } = base;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      if (u[i] > visibleRatio) {
        // 不可见：向远点 lerp
        prevPos.current[i3] += (farPos[i3] - prevPos.current[i3]) * posK;
        prevPos.current[i3 + 1] += (farPos[i3 + 1] - prevPos.current[i3 + 1]) * posK;
        prevPos.current[i3 + 2] += (farPos[i3 + 2] - prevPos.current[i3 + 2]) * posK;
        posArray[i3] = prevPos.current[i3];
        posArray[i3 + 1] = prevPos.current[i3 + 1];
        posArray[i3 + 2] = prevPos.current[i3 + 2];
        continue;
      }

      // 静态分布 × 动态半径
      const sx = staticPos[i3] * R_scale;
      const sy = staticPos[i3 + 1] * R_scale;
      const sz = staticPos[i3 + 2] * R_scale;
      const sp = speed[i];
      let px: number, py: number, pz: number;

      // 运动学（与 2D 版同构）
      switch (morph.motion) {
        case 'breathe': {
          px = sx * heart; py = sy * heart; pz = sz * heart;
          break;
        }
        case 'flow': {
          angles.current[i] += safeDelta * flowRateBase * sp;
          const a = angles.current[i] + ea;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          px = sx * ca + sz * sa;
          pz = -sx * sa + sz * ca;
          py = isTorrent
            ? (((sy + 1.2 - t * sp * 1.2) % 2.4) + 2.4) % 2.4 - 1.2
            : sy;
          break;
        }
        case 'spiral': {
          angles.current[i] += safeDelta * flowRateBase * sp * 0.8;
          const a = angles.current[i] + ea;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          px = sx * ca + sz * sa;
          pz = -sx * sa + sz * ca;
          py = sy + Math.sin(t * 2 + theta0[i]) * 0.08 * morph.flowSpeed;
          break;
        }
        case 'river': {
          angles.current[i] += safeDelta * 0.3 * sp;
          const a = angles.current[i] + ea;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          px = sx * ca + sz * sa;
          pz = -sx * sa + sz * ca;
          py = sy + Math.sin(t * 0.8 + riverPhase[i]) * (isCanopy ? 0.12 : 0.08);
          break;
        }
        case 'drift': {
          px = sx + Math.sin(t * 0.3 + theta0[i] * 5) * 0.06;
          py = sy + Math.sin(t * 0.25 + phi0[i] * 5) * 0.06;
          pz = sz + Math.cos(t * 0.35 + theta0[i] * 3) * 0.06;
          break;
        }
        default: {
          px = sx; py = sy; pz = sz;
          break;
        }
      }

      // 专注聚集叠加
      if (isFocusGather) {
        const staggerOffset = u[i] * 0.3;
        const effG = Math.max(0, Math.min(1, (gatherProgress - staggerOffset) / (1 - staggerOffset)));
        const sg = effG * effG * (3 - 2 * effG);
        const invG = 1 - sg;
        const dr = dirR * dirScale[i];
        px = px * sg + dirX[i] * dr * invG;
        py = py * sg + dirY[i] * dr * invG;
        pz = pz * sg + dirZ[i] * dr * invG;
      }

      // 位置平滑
      prevPos.current[i3] += (px - prevPos.current[i3]) * posK;
      prevPos.current[i3 + 1] += (py - prevPos.current[i3 + 1]) * posK;
      prevPos.current[i3 + 2] += (pz - prevPos.current[i3 + 2]) * posK;
      posArray[i3] = prevPos.current[i3];
      posArray[i3 + 1] = prevPos.current[i3 + 1];
      posArray[i3 + 2] = prevPos.current[i3 + 2];

      // 颜色：当前状态的粒子色
      colArray[i3] = cc.r / 255;
      colArray[i3 + 1] = cc.g / 255;
      colArray[i3 + 2] = cc.b / 255;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} key={`chronos-3d-${count}`}>
      <bufferGeometry key={`cg-${count}`}>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={MAX_PARTICLES}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={MAX_PARTICLES}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          array={sizes}
          count={MAX_PARTICLES}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        transparent
        opacity={morph.opacity}
        sizeAttenuation
        size={0.08}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}