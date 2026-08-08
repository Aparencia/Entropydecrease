/**
 * Chronos 时间生物 — 双风格视觉配置
 *
 * 依托项目双主题表面语言（深潜 deep-sea / 极光 aurora-dome）深度定制：
 * - deep-sea（深色）：深海有机生物，蓝绿冷光，毛玻璃发光系
 * - aurora-dome（浅色）：极光晶体生命，紫青渐变，平面高光系
 *
 * @ai-context: Chronos 时间生物的视觉参数单一来源，含状态色板与粒子配置。
 */
import type { SceneTheme } from '@/lib/3d/hooks/useSceneTheme';

/** Chronos 生物阶段（映射番茄 phase + 运行态） */
export type ChronosPhase = 'idle' | 'breathing' | 'work' | 'short_break' | 'long_break' | 'final';

/** 单一风格的完整视觉参数 */
export interface ChronosStyle {
  /** 液态金属主体基础色 */
  baseColor: string;
  /** 主体自发光色 */
  emissiveColor: string;
  /** 微粒主色 */
  particleColor: string;
  /** 微粒副色 */
  particleSecondary: string;
  /** 呼吸波纹色 */
  ringColor: string;
  /** 微粒数量基数 */
  particleCount: number;
  /** 液态流动扰动幅度 */
  noiseAmplitude: number;
  /** 金属度（0-1） */
  metalness: number;
  /** 粗糙度（0-1，越低越镜面） */
  roughness: number;
  /** 环境反射强度 */
  envMapIntensity: number;
  /** 光子层颜色（球体内部发光光点） */
  photonColor: string;
  /** 光子数量 */
  photonCount: number;
}

/** 各阶段视觉参数（内部使用，仅服务于 CHRONOS_PHASES） */
interface ChronosPhasePalette {
  /** 主体色（lerp 目标） */
  body: string;
  /** 自发光强度 0-1 */
  emissiveIntensity: number;
  /** 呼吸缩放幅度 0-1 */
  breatheAmplitude: number;
  /** 粒子聚拢半径（相对球体半径的倍数，<1 聚拢，>1 散开） */
  particleRadius: number;
  /** 旋转速度倍率 */
  spinSpeed: number;
}

/** 双风格基础配置：非简单换色，而是两种液态金属材质表现
 *  - deep-sea（深色）：深海液态水银——高金属镜面、冷色底、生物发光青绿辉光
 *  - aurora-dome（浅色）：极光亮银——柔和磨砂银、浅色底、紫粉辉光
 */
export const CHRONOS_STYLES: Record<SceneTheme, ChronosStyle> = {
  'deep-sea': {
    baseColor: '#12263A',
    emissiveColor: '#2DD4BF',
    particleColor: '#5B8A72',
    particleSecondary: '#2DD4BF',
    ringColor: '#2DD4BF',
    particleCount: 1400,
    noiseAmplitude: 0.12,
    metalness: 0.95,
    roughness: 0.08,
    envMapIntensity: 1.2,
    photonColor: '#99F6E4',
    photonCount: 300,
  },
  'aurora-dome': {
    baseColor: '#E8EAF6',
    emissiveColor: '#8B5CF6',
    particleColor: '#A78BFA',
    particleSecondary: '#F0ABFC',
    ringColor: '#8B5CF6',
    particleCount: 1000,
    noiseAmplitude: 0.08,
    metalness: 0.82,
    roughness: 0.28,
    envMapIntensity: 0.65,
    photonColor: '#F5D0FE',
    photonCount: 220,
  },
};

/** 各阶段视觉参数（与主题色叠加使用） */
export const CHRONOS_PHASES: Record<ChronosPhase, ChronosPhasePalette> = {
  idle: {
    body: '#94A3B8',
    emissiveIntensity: 0.12,
    breatheAmplitude: 0.01,
    particleRadius: 1.35,
    spinSpeed: 0.08,
  },
  breathing: {
    body: '#CBD5E1',
    emissiveIntensity: 0.22,
    breatheAmplitude: 0.03,
    particleRadius: 1.2,
    spinSpeed: 0.12,
  },
  work: {
    body: '#34D399',
    emissiveIntensity: 0.5,
    breatheAmplitude: 0.045,
    particleRadius: 1.0,
    spinSpeed: 0.2,
  },
  short_break: {
    body: '#2DD4BF',
    emissiveIntensity: 0.35,
    breatheAmplitude: 0.06,
    particleRadius: 1.15,
    spinSpeed: 0.1,
  },
  long_break: {
    body: '#818CF8',
    emissiveIntensity: 0.4,
    breatheAmplitude: 0.07,
    particleRadius: 1.2,
    spinSpeed: 0.08,
  },
  final: {
    body: '#F59E0B',
    emissiveIntensity: 0.7,
    breatheAmplitude: 0.08,
    particleRadius: 0.95,
    spinSpeed: 0.3,
  },
};

/** 将 phase 映射为 ChronosPhase（含最后 5 分钟暖色渐变） */
export function toChronosPhase(
  phase: 'work' | 'short_break' | 'long_break',
  isRunning: boolean,
  remainingSeconds: number,
  started: boolean,
): ChronosPhase {
  if (!started) return 'idle';
  if (!isRunning && phase === 'work') return 'breathing';
  if (phase === 'work' && remainingSeconds <= 300 && remainingSeconds > 0) return 'final';
  if (phase === 'short_break') return 'short_break';
  if (phase === 'long_break') return 'long_break';
  return 'work';
}

/** 状态指示元数据：每个 ChronosPhase 的中文名、图标与交互提示 */
export interface ChronosStateLabel {
  /** 状态中文名 */
  name: string;
  /** 状态图标（emoji） */
  icon: string;
  /** 交互提示文案（点击/长按行为） */
  hint: string;
}

export const CHRONOS_STATE_LABELS: Record<ChronosPhase, ChronosStateLabel> = {
  idle: { name: '沉睡', icon: '🌙', hint: '点击开始下潜' },
  breathing: { name: '呼吸', icon: '💨', hint: '点击开始专注' },
  work: { name: '专注', icon: '🎯', hint: '点击暂停 · 长按沉睡' },
  short_break: { name: '短休', icon: '☕', hint: '点击提前结束' },
  long_break: { name: '长休', icon: '🌊', hint: '点击提前结束' },
  final: { name: '即将完成', icon: '🔥', hint: '坚持住' },
};