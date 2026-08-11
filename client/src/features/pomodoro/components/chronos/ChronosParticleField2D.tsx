/**
 * ChronosParticleField2D — 2D Canvas 伪 3D 粒子场（WebGL 的性能替代）
 *
 * 视觉等价于 3D 粒子球：保留 3D 球面坐标 + 透视投影（近大远小 + 深度淡出 + 深度分桶），
 * 渲染走 Canvas 2D drawImage（GPU 加速），1500 粒子轻松 60fps，与主页动画同构。
 *
 * 位置算法与 3D 版同构（particleDistribution 静态分布 + 增量角度旋转 + 聚集叠加），
 * 每帧三角函数 ~2 次/粒子。双主题光晕精灵：deep-sea 大光晕（lighter 混合发光突围）、
 * aurora 六边形硬边（source-over 剪影勾勒）。
 *
 * dpr=1（CSS 像素）：2D 绘制无需高倍率 buffer，是流畅性的关键之一。
 *
 * @ai-context: Chronos 2D 渲染组件；描述符 particleMorphs，分布 particleDistribution。
 */
import { useEffect, useRef, useMemo } from 'react';
import { composeMorph, type Mood } from './particleMorphs';
import { computeStaticDistribution } from './particleDistribution';
import { CHRONOS_PALETTES } from './chronosStyles';
import type { ChronosState } from './chronosState';
import type { SceneTheme } from '@/lib/3d/hooks/useSceneTheme';

/** 粒子最大数量 */
const MAX_PARTICLES = 1500;
/** 不可见粒子远点半径 */
const FAR_RADIUS = 6.0;
/** 专注后期色温终点（冷白 → 暖橙） */
const HEAT_COLOR = '#F97316';
/** 专注聚集下限（初始分散态不全空） */
const GATHER_FLOOR = 0.3;
/** 专注分散态半径倍率 */
const GATHER_DISPERSED_SCALE = 2.6;
/** 深度分桶层数（O(n) 伪排序，远→近绘制） */
const DEPTH_BUCKETS = 8;
/** 焦距系数：f = FOCAL_K × radius（透视强度） */
const FOCAL_K = 2.2;
/** 粒子球视觉半径占容器短边比例（≈84% 直径） */
const VIEW_K = 0.42;
/** 树干色（长休破土） */
const TRUNK_COLOR = '#6B4423';

/** hex → [r,g,b]（颜色 lerp 用，模块级缓存避免重复解析） */
const _hexCache = new Map<string, [number, number, number]>();
function hexToRgb(hex: string): [number, number, number] {
  let v = _hexCache.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    _hexCache.set(hex, v);
  }
  return v;
}

/**
 * 双主题光晕精灵（64px 离屏 canvas）
 * deep-sea：大半径软光晕（径向渐变缓降）；aurora：六边形硬边 + 晶面棱线
 */
function createGlowSprite(theme: SceneTheme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const cx = 32, cy = 32;
  if (theme === 'deep-sea') {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  } else {
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 - 30) * Math.PI / 180;
      ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
  return c;
}

interface ChronosParticleField2DProps {
  state: ChronosState;
  theme: SceneTheme;
  mood?: Mood;
  /** 剩余比例 0-1（remaining/total） */
  progress: number;
  /** 降级：粒子数 -60% */
  degraded?: boolean;
}

export function ChronosParticleField2D({ state, theme, mood, progress, degraded = false }: ChronosParticleField2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const morph = composeMorph(mood, state, theme);
  const palette = CHRONOS_PALETTES[theme][state];
  const count = degraded ? 600 : MAX_PARTICLES;

  // 最新值 ref（rAF 循环单次挂载，避免 effect 重建）
  const morphRef = useRef(morph);
  morphRef.current = morph;
  const stateRef = useRef(state);
  stateRef.current = state;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  // 基础球面参数 + 静态分布预计算（与 3D 版同构）
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
  }, [base, morph.distribution, morph.visibleRatio]);

  // 运行时可变状态（rAF 内更新，避免 React 渲染）
  const angles = useRef(new Float32Array(MAX_PARTICLES));
  const prevPos = useRef(new Float32Array(MAX_PARTICLES * 3));
  const extraAngle = useRef(0);
  const creature = useRef(0); // 嫩芽/树干萌出进度
  const projX = useRef(new Float32Array(MAX_PARTICLES));
  const projY = useRef(new Float32Array(MAX_PARTICLES));
  const projR = useRef(new Float32Array(MAX_PARTICLES));
  const projA = useRef(new Float32Array(MAX_PARTICLES));
  const buckets = useRef<number[][]>(Array.from({ length: DEPTH_BUCKETS }, () => []));
  const current = useRef({
    radius: morph.radius,
    size: morph.size,
    opacity: morph.opacity,
    r: 255, g: 255, b: 255,
  });
  const glowSprite = useMemo(() => createGlowSprite(theme), [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let prevT = 0;

    // 同步初始化 canvas buffer（不依赖 rAF：隐藏页面 rAF 暂停时 buffer 仍正确）
    canvas.width = canvas.clientWidth || 1;
    canvas.height = canvas.clientHeight || 1;

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const delta = prevT === 0 ? 0.016 : Math.min((t - prevT) / 1000, 0.1);
      prevT = t;
      const m = morphRef.current;
      const st = stateRef.current;
      const prog = Math.max(0, Math.min(1, progressRef.current));
      const pal = paletteRef.current;

      // canvas 尺寸跟随 CSS（dpr=1：2D 绘制无高倍 buffer，流畅关键）
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      // ── 状态收敛（与 3D 版同构）──
      const k = Math.min(delta * 2, 1);
      const c = current.current;
      const heat = st === 'focus' ? 1 - prog : 0;
      const gatherProgress = st === 'focus' ? 1 - prog : 0;
      const visibleRatio = st === 'focus'
        ? Math.min(1, GATHER_FLOOR + (1 - GATHER_FLOOR) * gatherProgress * 1.2)
        : m.visibleRatio;
      c.radius += (m.radius - c.radius) * k;
      c.size += (m.size - c.size) * k;
      c.opacity += (m.opacity - c.opacity) * k;
      // 颜色：状态色 70% + 气质色 30%，focus 时向暖橙渐变
      const pRgb = hexToRgb(pal.particle);
      const tRgb = hexToRgb(m.tint);
      let tr = pRgb[0] * 0.7 + tRgb[0] * 0.3;
      let tg = pRgb[1] * 0.7 + tRgb[1] * 0.3;
      let tb = pRgb[2] * 0.7 + tRgb[2] * 0.3;
      if (heat > 0.02) {
        const hRgb = hexToRgb(HEAT_COLOR);
        tr = tr + (hRgb[0] - tr) * heat;
        tg = tg + (hRgb[1] - tg) * heat;
        tb = tb + (hRgb[2] - tb) * heat;
      }
      c.r += (tr - c.r) * k;
      c.g += (tg - c.g) * k;
      c.b += (tb - c.b) * k;

      // 辅助形态萌出进度（短休嫩芽 / 长休树干）
      const creatureTarget = st === 'short_break' || st === 'long_break' ? 1 : 0;
      creature.current += (creatureTarget - creature.current) * k;

      // ── 位置计算 + 透视投影 + 深度分桶 ──
      const accel = 1 + 1.5 * Math.pow(1 - prog, 0.5);
      const R = c.radius;
      const R_scale = R / m.radius;
      const dirR = R * GATHER_DISPERSED_SCALE;
      const flowRateBase = m.flowSpeed * accel;
      const isTorrent = m.distribution === 'torrent';
      const isCanopy = m.distribution === 'canopy';
      const isFocusGather = st === 'focus' && gatherProgress < 1;
      const heart = 1 + Math.sin(t / 1000 * Math.PI * 2) * 0.06; // 60bpm 心跳
      const posK = Math.min(delta * 3, 1);
      const { staticPos, farPos, dirX, dirY, dirZ, dirScale, riverPhase } = pre;
      const { theta0, phi0, speed, u } = base;

      // 世界→像素系数 + 透视焦距
      const Rpx = Math.min(w, h) * VIEW_K;
      const kpx = Rpx / R;
      const focal = FOCAL_K * R;
      const cx = w / 2;
      const cy = h / 2;

      // 整体旋转（Y 轴，等效于 3D 版 points.rotation.y）
      extraAngle.current += delta * (st === 'focus' ? 0.1 : st === 'asleep' ? 0 : 0.04);
      const ea = extraAngle.current;

      // 清空分桶
      for (let b = 0; b < DEPTH_BUCKETS; b++) buckets.current[b].length = 0;

      const pxArr = projX.current;
      const pyArr = projY.current;
      const prArr = projR.current;
      const paArr = projA.current;
      const timeS = t / 1000;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        if (u[i] > visibleRatio) {
          // 不可见：向远点 lerp（不投影不绘制）
          const fx = farPos[i3];
          const fy = farPos[i3 + 1];
          const fz = farPos[i3 + 2];
          prevPos.current[i3] += (fx - prevPos.current[i3]) * posK;
          prevPos.current[i3 + 1] += (fy - prevPos.current[i3 + 1]) * posK;
          prevPos.current[i3 + 2] += (fz - prevPos.current[i3 + 2]) * posK;
          continue;
        }

        // 静态分布 × 动态半径
        const sx = staticPos[i3] * R_scale;
        const sy = staticPos[i3 + 1] * R_scale;
        const sz = staticPos[i3 + 2] * R_scale;
        const sp = speed[i];
        const th0 = theta0[i];
        const ph0 = phi0[i];
        let px: number, py: number, pz: number;

        // 运动学（增量角度 + 旋转，每粒子 ~2 次 sin/cos）
        switch (m.motion) {
          case 'breathe': {
            px = sx * heart; py = sy * heart; pz = sz * heart;
            break;
          }
          case 'flow': {
            angles.current[i] += delta * flowRateBase * sp;
            const a = angles.current[i] + ea;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            px = sx * ca + sz * sa;
            pz = -sx * sa + sz * ca;
            py = isTorrent
              ? (((sy + 1.2 - timeS * sp * 1.2) % 2.4) + 2.4) % 2.4 - 1.2
              : sy;
            break;
          }
          case 'spiral': {
            angles.current[i] += delta * flowRateBase * sp * 0.8;
            const a = angles.current[i] + ea;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            px = sx * ca + sz * sa;
            pz = -sx * sa + sz * ca;
            py = sy + Math.sin(timeS * 2 + th0) * 0.08 * m.flowSpeed;
            break;
          }
          case 'river': {
            angles.current[i] += delta * 0.3 * sp;
            const a = angles.current[i] + ea;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            px = sx * ca + sz * sa;
            pz = -sx * sa + sz * ca;
            py = sy + Math.sin(timeS * 0.8 + riverPhase[i]) * (isCanopy ? 0.12 : 0.08);
            break;
          }
          case 'drift': {
            px = sx + Math.sin(timeS * 0.3 + th0 * 5) * 0.06;
            py = sy + Math.sin(timeS * 0.25 + ph0 * 5) * 0.06;
            pz = sz + Math.cos(timeS * 0.35 + th0 * 3) * 0.06;
            break;
          }
          default: {
            px = sx; py = sy; pz = sz;
            break;
          }
        }

        // 专注聚集叠加（分散方向预计算）
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

        // 位置平滑（prevPos 收敛）
        prevPos.current[i3] += (px - prevPos.current[i3]) * posK;
        prevPos.current[i3 + 1] += (py - prevPos.current[i3 + 1]) * posK;
        prevPos.current[i3 + 2] += (pz - prevPos.current[i3 + 2]) * posK;
        const fx = prevPos.current[i3];
        const fy = prevPos.current[i3 + 1];
        const fz = prevPos.current[i3 + 2];

        // 透视投影：近大远小 + 深度淡出 + 分桶
        const s = focal / (focal - fz);
        const x2 = cx + fx * kpx * s;
        const y2 = cy + fy * kpx * s;
        const r2 = Math.max(0.5, 0.07 * c.size * kpx * s * (theme === 'deep-sea' ? 1.2 : 0.9));
        const depthA = 0.5 + 0.5 * (fz + R) / (2 * R); // 远淡近浓
        pxArr[i] = x2;
        pyArr[i] = y2;
        prArr[i] = r2;
        paArr[i] = c.opacity * depthA;
        // 分桶：z 越大越近，绘制顺序靠后（覆盖在上）
        const bIdx = Math.max(0, Math.min(DEPTH_BUCKETS - 1, Math.floor((fz + R) / (2 * R) * DEPTH_BUCKETS)));
        buckets.current[bIdx].push(i);
      }

      // ── 绘制（远 → 近，lighter 混合发光）──
      ctx.globalCompositeOperation = theme === 'deep-sea' ? 'lighter' : 'source-over';
      const rgbStr = `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
      for (let b = 0; b < DEPTH_BUCKETS; b++) {
        const bucket = buckets.current[b];
        for (let j = 0; j < bucket.length; j++) {
          const idx = bucket[j];
          const r2 = prArr[idx];
          const a = Math.max(0, Math.min(1, paArr[idx]));
          ctx.globalAlpha = a;
          ctx.drawImage(glowSprite, pxArr[idx] - r2, pyArr[idx] - r2, r2 * 2, r2 * 2);
          ctx.fillStyle = `rgba(${rgbStr},1)`;
          ctx.beginPath();
          ctx.arc(pxArr[idx], pyArr[idx], r2 * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // ── 辅助形态（短休嫩芽 / 长休树干，2D 简化绘制）──
      const cp = creature.current;
      if (cp > 0.02) {
        if (st === 'short_break') {
          const sprout = hexToRgb(pal.particle);
          ctx.fillStyle = `rgb(${sprout[0]},${sprout[1]},${sprout[2]})`;
          ctx.beginPath();
          ctx.moveTo(cx, cy - Rpx * 1.02);
          ctx.lineTo(cx - 7 * cp, cy - Rpx * 1.02 - 24 * cp);
          ctx.lineTo(cx + 7 * cp, cy - Rpx * 1.02 - 24 * cp);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = TRUNK_COLOR;
          ctx.fillRect(cx - 2.5, cy - Rpx * 0.95 - 42 * cp, 5, 42 * cp);
        }
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [base, pre, count, theme, glowSprite]);

  return <canvas ref={canvasRef} className="!absolute inset-0 w-full h-full" aria-hidden="true" />;
}
