/**
 * ChronosParticleField — 描述符驱动的粒子场
 *
 * 消费 particleMorphs 的 ParticleMorph 描述符（composeMorph 合成），
 * 支持八种分布（volume/shell/grid/helix/crystal/torrent/cluster/canopy）
 * 与六种运动学（still/breathe/flow/spiral/drift/river），状态/气质/主题三轴合成。
 *
 * 核心语义（设计详解）：
 * - 沉睡：星云弥散（体积散布、仅 25% 粒子可见、慢漂）——粒子散布在四周区域
 * - 呼吸：粒子向中心聚合成球壳 + 60bpm 心跳（唤醒仪式）
 * - 专注：粒子从四周逐渐向中心聚集（一粒一粒汇聚），
 *   计时结束时形成完整粒子球。gatherProgress 驱动聚集动画。
 * - 短休/长休：河流循环流动（粒子沿 Y 轴环绕，带垂直起伏模拟水流）
 *
 * 双主题粒子纹理：deep-sea 大半径软光晕（生物荧光），aurora 小半径硬边缘（水晶碎屑）。
 * 主题切换时通过 key 强制重建纹理。
 *
 * 流畅性优化：delta 使用 prevTimeRef 手动计算，避免 clock.getDelta() 重置 elapsedTime；
 * low 档每帧更新 material 属性，仅跳过位置循环。
 *
 * @ai-context: 粒子场组件；描述符在 particleMorphs，色板在 chronosStyles。
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { composeMorph, type Mood } from './particleMorphs';
import { CHRONOS_PALETTES } from './chronosStyles';
import type { ChronosState } from './chronosState';
import type { SceneTheme } from '@/lib/3d/hooks/useSceneTheme';

/** 不可见粒子的远点半径（lerp 过程中飞出视野） */
const FAR_RADIUS = 6.0;
/** 专注后期色温终点（时间将尽的余温：冷白 → 暖橙） */
const HEAT_COLOR = '#F97316';
/** 专注聚集下限：计时开始时仍保留的粒子比例（初始分散态不全空） */
const GATHER_FLOOR = 0.3;
/** 专注分散态半径倍率：粒子在聚集前的散布半径 = morph.radius × GATHER_DISPERSED_SCALE */
const GATHER_DISPERSED_SCALE = 2.0;
/** 粒子最大数量（固定 buffer 上限；degraded 经 drawRange 控制可见数） */
const MAX_PARTICLES = 1500;
/** P0-7 每帧复用临时 Color：targetColor 计算不再每次 new Color（GC 压力） */
const _tmpTarget = new THREE.Color();
const _tmpHeat = new THREE.Color();

/**
 * 生成双主题粒子纹理
 * deep-sea：大半径软光晕（径向渐变缓降，AdditiveBlending 发光突围）
 * aurora：小半径硬边缘（径向渐变陡降，NormalBlending 剪影勾勒）
 */
function createParticleTexture(theme: SceneTheme): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const cx = 32, cy = 32;

  if (theme === 'deep-sea') {
    // 深海生物荧光：径向渐变 + 环形光晕，中心亮→边缘缓降
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(220,240,255,0.9)');
    gradient.addColorStop(0.5, 'rgba(120,200,255,0.3)');
    gradient.addColorStop(0.75, 'rgba(60,150,255,0.08)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    // 外围微光环（生物荧光特征）
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,200,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // 极光结晶：六边形切割面（水晶碎屑），边缘锐利
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60 - 30) * Math.PI / 180;
      const r = 28;
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.3, 'rgba(230,210,255,0.7)');
    gradient.addColorStop(0.6, 'rgba(200,180,255,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    // 晶面棱线
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (i * 120) * Math.PI / 180;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * 28, Math.sin(angle) * 28);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface ChronosParticleFieldProps {
  state: ChronosState;
  theme: SceneTheme;
  /** 预设气质（未设置回退 flow） */
  mood?: Mood;
  /** 剩余比例 0-1（remaining/total），驱动专注能量流线性加速 */
  progress: number;
  /** 降级（reduced-motion/低性能）：粒子数 -60% + 跳帧，形态语义保留 */
  degraded?: boolean;
}

export function ChronosParticleField({ state, theme, mood, progress, degraded = false }: ChronosParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const frameRef = useRef(0);
  const prevTimeRef = useRef(0);

  // 形态描述符（合成：状态 × 气质 × 主题）
  const morph = composeMorph(mood, state, theme);
  const palette = CHRONOS_PALETTES[theme][state];

  const count = degraded ? 600 : 1500;
  const frameSkip = useEffectiveTier() === 'low' ? 3 : 1;
  const isLowTier = frameSkip > 1;

  // 双主题粒子纹理
  const particleTexture = useMemo(() => createParticleTexture(theme), [theme]);

  // 每粒子基础球面参数（预计算，避免每帧分配）
  // P0-8：固定 MAX_PARTICLES 大小（degraded 切换不再重建 buffer/GPU 上传，
  // 可见粒子数由 setDrawRange 控制，与既有减粒子语义一致）
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

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    return g;
  }, []);

  // lerp 状态：分布半径/尺寸/透明度/颜色收敛（状态与气质切换平滑）
  const current = useRef({
    radius: morph.radius,
    size: morph.size,
    opacity: morph.opacity,
    color: new THREE.Color(palette.particle),
  });

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // 手动计算 delta，避免 clock.getDelta() 重置 elapsedTime 导致时间不一致
    const delta = prevTimeRef.current === 0 ? 0.016 : Math.min(t - prevTimeRef.current, 0.1);
    prevTimeRef.current = t;
    const k = Math.min(delta * 2, 1);
    const c = current.current;

    // 时间感知（专注态）：
    // - 色温渐变：剩余越少颜色越暖（冷白 → 暖橙，时间将尽的余温）
    // - 粒子聚集：剩余越少粒子越向中心汇聚（沙漏逆隐喻：时间流逝 = 粒子聚合）
    //   gatherProgress = 1 - progress：0→1 驱动粒子从分散到聚集
    const heat = state === 'focus' ? 1 - Math.max(0, Math.min(1, progress)) : 0;
    const gatherProgress = state === 'focus' ? 1 - Math.max(0, Math.min(1, progress)) : 0;
    // P0-7：targetColor 复用模块级临时 Color（原每帧 2 次 new 分配）
    const targetColor = heat > 0.02
      ? _tmpTarget.set(palette.particle).lerp(_tmpHeat.set(HEAT_COLOR), heat)
      : _tmpTarget.set(palette.particle);
    // 专注态：粒子可见比例随聚集进度递增（从 GATHER_FLOOR → 1.0）
    // 一粒一粒汇聚 = 逐渐有更多粒子从远点回到可见区域
    const visibleRatio = state === 'focus'
      ? Math.min(1, GATHER_FLOOR + (1 - GATHER_FLOOR) * gatherProgress * 1.2)
      : morph.visibleRatio;

    // 描述符目标收敛（每帧，保证状态切换平滑）
    c.radius += (morph.radius - c.radius) * k;
    c.size += (morph.size - c.size) * k;
    c.opacity += (morph.opacity - c.opacity) * k;
    c.color.lerp(targetColor, k);

    // material 属性每帧更新（低档也不跳过，保证颜色/透明度平滑）
    if (materialRef.current) {
      materialRef.current.color.copy(c.color);
      materialRef.current.opacity = c.opacity;
      materialRef.current.size = 0.07 * c.size * (theme === 'deep-sea' ? 1.2 : 0.9);
      materialRef.current.map = particleTexture;
    }

    // 低档跳帧：仅跳过位置更新循环，material 属性已在上方每帧更新
    frameRef.current += 1;
    if (isLowTier && frameRef.current % frameSkip !== 0) return;

    // 时间感知：专注能量流流速随剩余时间平滑加速（幂级缓动，避免突变）
    const accel = 1 + 1.5 * Math.pow(1 - Math.max(0, Math.min(1, progress)), 0.5);

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const R = c.radius;
    const heartbeat = 1 + Math.sin(t * Math.PI * 2 * 1) * 0.06; // 60bpm 心跳缩放

    const { theta0, phi0, speed, u } = base;
    const gridStep = Math.PI * 2 / 16; // 经纬网格经线步长
    const gridPhiStep = Math.PI / 12;  // 经纬网格纬线步长

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // 可见性：超出 visibleRatio 的粒子推至远点（lerp 自然飞出）；
      // 专注态可见比例随剩余时间递增（粒子聚集）
      if (u[i] > visibleRatio) {
        arr[i3] = FAR_RADIUS * Math.sin(phi0[i]) * Math.cos(theta0[i]);
        arr[i3 + 1] = FAR_RADIUS * Math.cos(phi0[i]);
        arr[i3 + 2] = FAR_RADIUS * Math.sin(phi0[i]) * Math.sin(theta0[i]);
        continue;
      }

      const th0 = theta0[i];
      const ph0 = phi0[i];
      const sp = speed[i];
      let x: number, y: number, z: number;

      // ── 分布函数（形状级差异）──
      switch (morph.distribution) {
        case 'volume': { // 星云：球内均匀体积散布
          const r = R * Math.cbrt(u[i] / morph.visibleRatio);
          x = r * Math.sin(ph0) * Math.cos(th0);
          y = r * Math.cos(ph0);
          z = r * Math.sin(ph0) * Math.sin(th0);
          break;
        }
        case 'shell': { // 球壳：±0.12 厚度
          const r = R * (1 + (u[i] - 0.5) * 0.24);
          x = r * Math.sin(ph0) * Math.cos(th0);
          y = r * Math.cos(ph0);
          z = r * Math.sin(ph0) * Math.sin(th0);
          break;
        }
        case 'grid': { // 经纬网格：量化到网格线交叉点
          const gTh = Math.round(th0 / gridStep) * gridStep;
          const gPh = Math.round(ph0 / gridPhiStep) * gridPhiStep;
          const r = R * (1 + (u[i] - 0.5) * 0.1);
          x = r * Math.sin(gPh) * Math.cos(gTh);
          y = r * Math.cos(gPh);
          z = r * Math.sin(gPh) * Math.sin(gTh);
          break;
        }
        case 'helix': { // 火焰螺旋：沿螺旋线上升
          const turns = 3;
          const yy = -R + (th0 / (Math.PI * 2)) * 2 * R;
          const ang = th0 * turns + yy * 2;
          const shrink = Math.sqrt(Math.max(0, 1 - (yy / R) * (yy / R) * 0.7));
          x = R * Math.cos(ang) * shrink;
          y = yy;
          z = R * Math.sin(ang) * shrink;
          break;
        }
        case 'crystal': { // 水晶晶簇：黄金角顶点聚集 + 径向抖动
          const vi = Math.floor(u[i] * 12);
          const va = vi * 137.5 * Math.PI / 180;
          const vr = R * (0.75 + (u[i] % 0.25));
          x = vr * Math.sin(ph0 * 0.5 + va) * Math.cos(th0 + va);
          y = vr * Math.abs(Math.cos(ph0 * 0.5 + va));
          z = vr * Math.sin(ph0 * 0.5 + va) * Math.sin(th0 + va);
          break;
        }
        case 'torrent': { // 洪流：圆柱内单向下落循环
          const r = R * 0.35 * Math.sqrt(u[i]);
          const cyc = ((th0 / (Math.PI * 2) * 4 - t * sp * 0.5) % 1 + 1) % 1;
          x = r * Math.cos(th0 * 3);
          y = cyc * 2.4 - 1.2;
          z = r * Math.sin(th0 * 3);
          break;
        }
        case 'cluster': { // 种子团：紧密球团
          const r = R * (0.6 + u[i] * 0.4);
          x = r * Math.sin(ph0) * Math.cos(th0);
          y = r * Math.cos(ph0);
          z = r * Math.sin(ph0) * Math.sin(th0);
          break;
        }
        case 'canopy': { // 树冠：上半球茂密扩散 + 斑驳闪烁
          const r = R * (0.7 + u[i] * 0.3) + Math.sin(t * 1.3 + th0 * 3) * 0.04;
          const phC = ph0 * 0.5; // 压缩到上半球
          x = r * Math.sin(phC) * Math.cos(th0);
          y = 0.9 + r * Math.cos(phC) * 0.7;
          z = r * Math.sin(phC) * Math.sin(th0) * 0.8;
          break;
        }
      }

      // ── 运动学调制 ──
      switch (morph.motion) {
        case 'breathe': { // 心跳：整体缩放（60bpm）
          arr[i3] = x * heartbeat;
          arr[i3 + 1] = y * heartbeat;
          arr[i3 + 2] = z * heartbeat;
          break;
        }
        case 'flow': { // 纬线流动：经度随时间推进
          const a = th0 + t * morph.flowSpeed * accel * sp;
          const rr = Math.sqrt(x * x + y * y + z * z) || 1;
          const ph = Math.acos(Math.max(-1, Math.min(1, y / rr)));
          arr[i3] = rr * Math.sin(ph) * Math.cos(a);
          arr[i3 + 1] = y;
          arr[i3 + 2] = rr * Math.sin(ph) * Math.sin(a);
          break;
        }
        case 'spiral': { // 螺旋：旋转 + 垂直波动
          const a = th0 + t * morph.flowSpeed * accel * sp * 0.8;
          const rr = Math.sqrt(x * x + z * z) || 1;
          arr[i3] = rr * Math.cos(a);
          arr[i3 + 1] = y + Math.sin(t * 2 + th0) * 0.08 * morph.flowSpeed;
          arr[i3 + 2] = rr * Math.sin(a);
          break;
        }
        case 'drift': { // 漂移：缓慢无规律游动
          arr[i3] = x + Math.sin(t * 0.3 + th0 * 5) * 0.06;
          arr[i3 + 1] = y + Math.sin(t * 0.25 + ph0 * 5) * 0.06;
          arr[i3 + 2] = z + Math.cos(t * 0.35 + th0 * 3) * 0.06;
          break;
        }
        case 'river': { // 河流循环流动：粒子沿 Y 轴环绕，带垂直起伏模拟水流
          const angle = th0 + t * 0.3 * sp;
          const rr = Math.sqrt(x * x + z * z) || 1;
          const wave = Math.sin(t * 0.8 + th0 * 2 + ph0) * 0.08;
          arr[i3] = rr * Math.cos(angle);
          arr[i3 + 1] = y + wave;
          arr[i3 + 2] = rr * Math.sin(angle);
          break;
        }
        default: { // still：静止于分布点
          arr[i3] = x;
          arr[i3 + 1] = y;
          arr[i3 + 2] = z;
          break;
        }
      }

      // ── 专注态聚集叠加：粒子从四周向中心汇聚（一粒一粒）──
      // 在运动学调制之后，对专注态的可见粒子做分散→聚集的 lerp 过渡
      if (state === 'focus' && gatherProgress < 1) {
        // 每个粒子有独立的聚集偏移量，产生"一粒一粒"的错落感
        const staggerOffset = u[i] * 0.3;
        const effectiveGather = Math.max(0, Math.min(1, (gatherProgress - staggerOffset) / (1 - staggerOffset)));
        // smoothstep 缓动：聚集过程先慢后快再慢
        const smoothG = effectiveGather * effectiveGather * (3 - 2 * effectiveGather);
        // 分散态位置：体积分布，大半径
        // 修复：使用 morph.visibleRatio（恒为 1.0）而非动态 visibleRatio，防止分母过小导致极端位置
        const dispersedR = c.radius * GATHER_DISPERSED_SCALE * (0.5 + 0.5 * Math.cbrt(u[i] / Math.max(0.001, morph.visibleRatio)));
        const dx = dispersedR * Math.sin(ph0) * Math.cos(th0);
        const dy = dispersedR * Math.cos(ph0);
        const dz = dispersedR * Math.sin(ph0) * Math.sin(th0);
        // 从分散位置 lerp 到当前运动学计算位置
        arr[i3] = arr[i3] * smoothG + dx * (1 - smoothG);
        arr[i3 + 1] = arr[i3 + 1] * smoothG + dy * (1 - smoothG);
        arr[i3 + 2] = arr[i3 + 2] * smoothG + dz * (1 - smoothG);
      }
    }
    posAttr.needsUpdate = true;
    // degraded 切换：仅改变可见粒子数，buffer 不重建
    geo.setDrawRange(0, count);

    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * (state === 'focus' ? 0.1 : state === 'asleep' ? 0 : 0.04);
    }
  });

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        ref={materialRef}
        size={0.07 * morph.size * (theme === 'deep-sea' ? 1.2 : 0.9)}
        color={palette.particle}
        map={particleTexture}
        transparent
        opacity={morph.opacity}
        sizeAttenuation
        blending={theme === 'deep-sea' ? THREE.AdditiveBlending : THREE.NormalBlending}
        depthWrite={false}
      />
    </points>
  );
}