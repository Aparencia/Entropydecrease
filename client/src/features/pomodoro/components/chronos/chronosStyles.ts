/**
 * Chronos 时间生物 — 双主题叙事色板与对比策略
 *
 * 形态语义保留（余烬/心跳/星体/种子/树冠），颜色按双主题差异化，
 * 且两套主题采用相反的对比策略（需求 2）：
 * - deep-sea（深色）= 发光突围：粒子高亮，靠"光"从黑暗中浮出
 * - aurora（浅色）= 深色勾勒：深色阶 + 彩色光晕（白炽在浅背景不可见，必须反转）
 *
 * 粒子形态参数已迁移至 particleMorphs.ts（描述符架构），本文件只承载颜色。
 *
 * @ai-context: 视觉参数单一来源；ChronosParticleField / 氛围层共用。
 */
import type { SceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import type { ChronosState } from './chronosState';

/** 单一状态的叙事色 */
export interface CreatureStyle {
  /** 主体色 */
  body: string;
  /** 自发光色 */
  emissive: string;
  /** 辉光色（点光/氛围层） */
  glow: string;
  /** 粒子主色 */
  particle: string;
  /** 粒子副色 */
  particleSecondary: string;
}

/** 双主题 × 五态色板（深色发光突围 / 浅色深色勾勒） */
export const CHRONOS_PALETTES: Record<SceneTheme, Record<ChronosState, CreatureStyle>> = {
  // deep-sea（深色）：冷色系高亮粒子，从黑暗中浮出
  'deep-sea': {
    // 沉睡：深海暗蓝灰余烬
    asleep: {
      body: '#1E3A5F', emissive: '#1E3A5F', glow: '#0F2440',
      particle: '#3B82F6', particleSecondary: '#1E3A5F',
    },
    // 呼吸：青蓝心跳 + 冷色辉光
    breathing: {
      body: '#22D3EE', emissive: '#0891B2', glow: '#22D3EE',
      particle: '#67E8F9', particleSecondary: '#0E7490',
    },
    // 专注：冷白星体 + 亮蓝能量流
    focus: {
      body: '#E0F2FE', emissive: '#7DD3FC', glow: '#38BDF8',
      particle: '#BAE6FD', particleSecondary: '#38BDF8',
    },
    // 短休：绿松石种子
    short_break: {
      body: '#2DD4BF', emissive: '#14B8A6', glow: '#2DD4BF',
      particle: '#5EEAD4', particleSecondary: '#0F766E',
    },
    // 长休：深海绿树影
    long_break: {
      body: '#10B981', emissive: '#059669', glow: '#34D399',
      particle: '#6EE7B7', particleSecondary: '#065F46',
    },
  },
  // aurora（浅色）：深色阶 + 彩色光晕，剪影勾勒
  'aurora-dome': {
    // 沉睡：暗紫余烬（浅底深色剪影）
    asleep: {
      body: '#4C1D95', emissive: '#4C1D95', glow: '#3B0764',
      particle: '#7C3AED', particleSecondary: '#4C1D95',
    },
    // 呼吸：紫粉心跳
    breathing: {
      body: '#C084FC', emissive: '#A855F7', glow: '#C084FC',
      particle: '#D8B4FE', particleSecondary: '#9333EA',
    },
    // 专注：深金星体（浅底高对比，白炽反转）
    focus: {
      body: '#92400E', emissive: '#B45309', glow: '#F59E0B',
      particle: '#D97706', particleSecondary: '#FBBF24',
    },
    // 短休：深薄荷种子
    short_break: {
      body: '#047857', emissive: '#065F46', glow: '#10B981',
      particle: '#047857', particleSecondary: '#34D399',
    },
    // 长休：紫罗兰树影
    long_break: {
      body: '#6D28D9', emissive: '#5B21B6', glow: '#8B5CF6',
      particle: '#7C3AED', particleSecondary: '#A78BFA',
    },
  },
};

/** 对比策略规格（氛围层/粒子基调共用） */
export interface ContrastSpec {
  /** 全局粒子基调主色 */
  particleMain: string;
  /** 全局粒子基调副色 */
  particleSecondary: string;
  /** 发光策略：deep-sea 自发光突围 / aurora 深色勾勒 */
  glowStrategy: 'emissive' | 'outline';
}

/** 双主题对比策略 */
export function paletteContrast(theme: SceneTheme): ContrastSpec {
  return theme === 'deep-sea'
    ? { particleMain: '#E0F2FE', particleSecondary: '#38BDF8', glowStrategy: 'emissive' }
    : { particleMain: '#4C1D95', particleSecondary: '#C084FC', glowStrategy: 'outline' };
}
