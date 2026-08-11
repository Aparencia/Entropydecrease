/**
 * particleMorphs — 粒子形态描述符与深度定制合成
 *
 * 形态 = 状态基础行为 × 预设气质外形 × 主题运动调制（纯函数合成）：
 * - 状态基础行为：沉睡=星云弥散（不维持球型）/ 呼吸=聚合心跳 / 专注=能量流 /
 *   短休=种子团 / 长休=树冠
 * - 预设气质外形：六种（grid 经纬网格 / flow 自由流动 / nebula 星云 / flame 螺旋 /
 *   crystal 晶簇 / torrent 洪流），决定呼吸与专注态的粒子形状
 * - 主题运动调制：deep-sea 厚重缓慢 / aurora 轻盈飘逸
 *
 * @ai-context: ChronosParticleField 消费描述符渲染，新增形态只需加描述符。
 */
import type { SceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import type { ChronosState } from './chronosState';

/** 粒子分布形状（形状级差异） */
export type Distribution = 'volume' | 'shell' | 'grid' | 'helix' | 'crystal' | 'torrent' | 'cluster' | 'canopy';
/** 粒子运动学 */
export type Motion = 'still' | 'breathe' | 'flow' | 'spiral' | 'drift' | 'river';
/** 预设气质（PomodoroPreset.mood） */
export type Mood = 'grid' | 'flow' | 'nebula' | 'flame' | 'crystal' | 'torrent';

/** 粒子形态描述符（粒子场唯一事实源） */
export interface ParticleMorph {
  distribution: Distribution;
  /** 特征半径（world units） */
  radius: number;
  /** 可见粒子比例（沉睡星云仅 40% 可见） */
  visibleRatio: number;
  motion: Motion;
  /** 流动/螺旋基础速度（专注态随剩余时间线性加速） */
  flowSpeed: number;
  /** 粒子尺寸倍率 */
  size: number;
  opacity: number;
  /** 气质主色（粒子颜色混合来源，任何状态可感知的形态差异） */
  tint: string;
}

/** 六种预设气质的中文名（PresetEditor 选择器展示） */
export const MOOD_LABELS: Record<Mood, string> = {
  grid: '经纬网格',
  flow: '自由流动',
  nebula: '星云',
  flame: '火焰螺旋',
  crystal: '水晶晶簇',
  torrent: '奔流洪流',
};

/** 状态基础行为（五态核心语义，任何气质/主题下不丢失） */
export const STATE_BASE_MORPH: Record<ChronosState, ParticleMorph> = {
  // 沉睡：星云弥散——体积随机散布、仅 60% 可见、微光（"无主形态"= 待燃灰烬）
  // 半径 4.0 让粒子充分散布至四周，visibleRatio 0.6 + 中高透明度保证弥散亮度可感知
  asleep: {
    distribution: 'volume', radius: 4.0, visibleRatio: 0.6,
    motion: 'drift', flowSpeed: 0, size: 0.9, opacity: 0.55, tint: '#34D399',
  },
  // 呼吸：粒子向中心聚合成球壳 + 60bpm 心跳（唤醒仪式）
  breathing: {
    distribution: 'shell', radius: 1.0, visibleRatio: 1,
    motion: 'breathe', flowSpeed: 0, size: 1, opacity: 0.7, tint: '#34D399',
  },
  // 专注：球壳 + 能量流（流速随剩余时间线性加速）
  focus: {
    distribution: 'shell', radius: 1.0, visibleRatio: 1,
    motion: 'flow', flowSpeed: 1, size: 1, opacity: 0.9, tint: '#34D399',
  },
  // 短休：坍缩成种子团 + 河流循环流动
  short_break: {
    distribution: 'cluster', radius: 0.35, visibleRatio: 1,
    motion: 'river', flowSpeed: 0, size: 0.9, opacity: 0.8, tint: '#34D399',
  },
  // 长休：树冠扩散（上半球茂密）+ 河流循环流动
  long_break: {
    distribution: 'canopy', radius: 1.8, visibleRatio: 1,
    motion: 'river', flowSpeed: 0, size: 1.1, opacity: 0.75, tint: '#34D399',
  },
};

/** 预设气质外形（决定呼吸/专注态的粒子形状与运动风格 + 全局色调/半径） */
export const MOOD_STYLE: Record<Mood, { distribution: Distribution; motion: Motion; sizeScale: number; opacityScale: number; flowScale: number; tint: string; radiusScale: number }> = {
  // 上课/纪律：经纬线网格壳、规整旋转流，青蓝经纬色
  grid: { distribution: 'grid', motion: 'spiral', sizeScale: 1.0, opacityScale: 1.0, flowScale: 0.8, tint: '#22D3EE', radiusScale: 1.0 },
  // 自习/自由：自由流动壳，翠绿生机色
  flow: { distribution: 'shell', motion: 'flow', sizeScale: 1.0, opacityScale: 1.0, flowScale: 1.0, tint: '#34D399', radiusScale: 1.0 },
  // 星云：体积弥散慢漂，紫罗兰星云色，范围略广
  nebula: { distribution: 'volume', motion: 'drift', sizeScale: 0.9, opacityScale: 0.85, flowScale: 0.7, tint: '#A78BFA', radiusScale: 1.15 },
  // 火焰：螺旋上升分布，专注时螺旋加速，橙红余烬色
  flame: { distribution: 'helix', motion: 'spiral', sizeScale: 1.05, opacityScale: 1.05, flowScale: 1.2, tint: '#FB923C', radiusScale: 1.1 },
  // 水晶：多面体顶点/棱边聚集（晶簇），粉晶棱面色，范围紧凑
  crystal: { distribution: 'crystal', motion: 'still', sizeScale: 1.15, opacityScale: 1.0, flowScale: 0.6, tint: '#F472B6', radiusScale: 0.9 },
  // 洪流：单向密集洪流，海蓝奔流色
  torrent: { distribution: 'torrent', motion: 'flow', sizeScale: 1.0, opacityScale: 1.1, flowScale: 1.4, tint: '#60A5FA', radiusScale: 1.05 },
};

/** 主题运动调制：deep-sea 厚重缓慢 / aurora 轻盈飘逸 */
const THEME_MORPH_SCALE: Record<SceneTheme, { sizeScale: number; opacityScale: number; speedScale: number }> = {
  'deep-sea': { sizeScale: 1.15, opacityScale: 0.85, speedScale: 0.7 },
  'aurora-dome': { sizeScale: 0.85, opacityScale: 1.1, speedScale: 1.3 },
};

/**
 * 合成粒子形态（纯函数）：
 * 状态特殊语义覆盖分布（沉睡=星云、短休=种子团、长休=树冠，任何气质下不丢失），
 * 呼吸/专注采用气质外形；运动学由状态决定、气质/主题调制速度与尺寸。
 */
export function composeMorph(mood: Mood | undefined, state: ChronosState, theme: SceneTheme): ParticleMorph {
  const base = STATE_BASE_MORPH[state];
  const moodStyle = MOOD_STYLE[mood ?? 'flow'];
  const themeScale = THEME_MORPH_SCALE[theme];

  // 分布：状态特殊语义优先，其余状态用气质外形
  let distribution: Distribution = base.distribution;
  if (state === 'breathing' || state === 'focus') {
    distribution = moodStyle.distribution;
  }

  // 运动学：状态决定基础，气质调制（flame 专注=螺旋加速、crystal 呼吸=静止凝晶）
  let motion: Motion = base.motion;
  if (state === 'focus' && moodStyle.motion === 'spiral') motion = 'spiral';
  if (state === 'breathing' && moodStyle.motion === 'still') motion = 'still';
  if (state === 'asleep' && moodStyle.distribution === 'volume') motion = 'drift';

  return {
    distribution,
    // 气质半径调制：crystal 紧凑 / nebula 松散（任何状态可感知的差异）
    radius: base.radius * moodStyle.radiusScale,
    visibleRatio: base.visibleRatio,
    motion,
    // 专注态流速 = 状态基础 × 气质流量 × 主题速度；其余状态无流动
    flowSpeed: state === 'focus'
      ? base.flowSpeed * moodStyle.flowScale * themeScale.speedScale
      : 0,
    size: base.size * moodStyle.sizeScale * themeScale.sizeScale,
    opacity: base.opacity * moodStyle.opacityScale * themeScale.opacityScale,
    tint: moodStyle.tint,
  };
}
