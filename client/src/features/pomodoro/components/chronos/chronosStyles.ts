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
  /** 主体基础色 */
  baseColor: string;
  /** 主体自发光色 */
  emissiveColor: string;
  /** 粒子主色 */
  particleColor: string;
  /** 粒子副色 */
  particleSecondary: string;
  /** 呼吸波纹色 */
  ringColor: string;
  /** 粒子数量基数 */
  particleCount: number;
  /** 顶点扰动幅度（细胞膜质感） */
  noiseAmplitude: number;
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

/** 双风格基础配置 */
export const CHRONOS_STYLES: Record<SceneTheme, ChronosStyle> = {
  'deep-sea': {
    baseColor: '#1E3A5F',
    emissiveColor: '#2DD4BF',
    particleColor: '#5B8A72',
    particleSecondary: '#2DD4BF',
    ringColor: '#2DD4BF',
    particleCount: 1400,
    noiseAmplitude: 0.14,
  },
  'aurora-dome': {
    baseColor: '#C7D2FE',
    emissiveColor: '#8B5CF6',
    particleColor: '#A78BFA',
    particleSecondary: '#F0ABFC',
    ringColor: '#8B5CF6',
    particleCount: 1000,
    noiseAmplitude: 0.1,
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