/**
 * 自适应排版引擎 Hook
 *
 * @ai-context: 自适应排版引擎（3.17）——基于 CSS custom properties 的
 * 自适应排版方案。动态字体大小（基于阅读距离，使用 prefers-reduced-motion
 * 作为代理）、动态行间距（基于内容难度）、阅读引导线。
 * 返回 CSS 变量对象，应用于容器。
 */
import { useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** 排版配置选项 */
export interface AdaptiveTypographyOptions {
  /** 内容难度（1-5），影响行间距 */
  contentDifficulty?: number;
  /** 基础字体大小（px），默认 16 */
  baseFontSize?: number;
  /** 启用阅读引导线 */
  enableReadingGuide?: boolean;
}

/** 返回的 CSS 变量对象 */
export interface TypographyCSSVariables {
  '--ed-font-size-base': string;
  '--ed-font-size-sm': string;
  '--ed-font-size-lg': string;
  '--ed-line-height': string;
  '--ed-letter-spacing': string;
  '--ed-reading-guide-color': string;
}

/**
 * 自适应排版引擎
 * 根据阅读距离代理（prefers-reduced-motion 作为桌面端近似）和内容难度
 * 动态计算字体大小与行间距，返回 CSS 变量对象。
 *
 * @param options - 排版配置
 * @returns CSS 变量对象，直接 spread 到容器 style
 */
export function useAdaptiveTypography(options: AdaptiveTypographyOptions = {}): TypographyCSSVariables {
  const {
    contentDifficulty = 3,
    baseFontSize = 16,
    enableReadingGuide = false,
  } = options;

  // 使用 prefers-reduced-motion 作为阅读距离的代理
  // 用户偏好减弱动效 → 可能更近的阅读距离 → 较小字体
  const prefersReduced = useReducedMotion();

  return useMemo(() => {
    // 字体大小缩放（reduced-motion → 0.95x，正常 → 1.0x）
    const distanceFactor = prefersReduced ? 0.95 : 1.0;
    const sizeBase = Math.round(baseFontSize * distanceFactor);

    // 行间距：难度越高，行间距越大（1-5 → 1.5-2.0）
    const lineHeight = 1.5 + (contentDifficulty - 1) * 0.125;

    // 字间距：难度越高，略微增加提高可读性
    const letterSpacing = contentDifficulty >= 4 ? '0.02em' : '0em';

    return {
      '--ed-font-size-base': `${sizeBase}px`,
      '--ed-font-size-sm': `${Math.round(sizeBase * 0.875)}px`,
      '--ed-font-size-lg': `${Math.round(sizeBase * 1.25)}px`,
      '--ed-line-height': `${lineHeight}`,
      '--ed-letter-spacing': letterSpacing,
      '--ed-reading-guide-color': enableReadingGuide ? 'rgba(91, 138, 114, 0.08)' : 'transparent',
    };
  }, [baseFontSize, contentDifficulty, enableReadingGuide, prefersReduced]);
}