/**
 * 主题变体 — light/dark 双模式动画参数差异化
 * @ai-context 深色模式：光晕更亮、粒子更密、发光色温更冷
 *            浅色模式：光晕更柔、粒子更稀、色温更暖
 *
 * 通过 document.documentElement.dataset.theme 判断当前模式
 */

// ─────────────────────────────────────────────────────────────
// 主题检测工具
// ─────────────────────────────────────────────────────────────

/** 读取当前主题（'dark' | 'light'） */
export function getCurrentTheme(): 'dark' | 'light' {
  try {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** 当前是否为深色模式 */
export function isDarkMode(): boolean {
  return getCurrentTheme() === 'dark';
}

// ─────────────────────────────────────────────────────────────
// 主题动画参数
// ─────────────────────────────────────────────────────────────

export interface ThemeAnimationParams {
  /** 光晕最大透明度 */
  glowOpacity: number;
  /** 光晕模糊半径（px） */
  glowBlur: number;
  /** 粒子密度（每单位面积粒子数倍数，1.0 = 标准） */
  particleDensity: number;
  /** 发光色温 CSS 色相偏移（deg），0 = 中性，负值 = 更冷，正值 = 更暖 */
  glowHueShift: number;
  /** 发光色（CSS 颜色值） */
  glowColor: string;
  /** 背景氛围层透明度 */
  ambientOpacity: number;
  /** 脉冲动画速度倍数（>1 更快，<1 更慢） */
  pulseSpeedMultiplier: number;
}

/** 深色模式动画参数 */
const darkParams: ThemeAnimationParams = {
  glowOpacity: 0.8,
  glowBlur: 24,
  particleDensity: 1.4,
  glowHueShift: -10,         // 更冷（偏蓝）
  glowColor: 'rgba(100, 180, 255, 0.6)',
  ambientOpacity: 0.15,
  pulseSpeedMultiplier: 1.0,
};

/** 浅色模式动画参数 */
const lightParams: ThemeAnimationParams = {
  glowOpacity: 0.5,
  glowBlur: 16,
  particleDensity: 0.7,
  glowHueShift: 15,          // 更暖（偏橙）
  glowColor: 'rgba(255, 180, 100, 0.4)',
  ambientOpacity: 0.08,
  pulseSpeedMultiplier: 0.85, // 略慢，柔和感
};

/** 按主题获取动画参数 */
export function getThemeAnimParams(theme?: 'dark' | 'light'): ThemeAnimationParams {
  const t = theme ?? getCurrentTheme();
  return t === 'dark' ? darkParams : lightParams;
}

// ─────────────────────────────────────────────────────────────
// React hook：响应式主题参数
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

/**
 * 响应式主题动画参数 hook
 * 监听 documentElement.dataset.theme 变化，自动切换参数
 */
export function useThemeAnimParams(): ThemeAnimationParams {
  const [params, setParams] = useState<ThemeAnimationParams>(getThemeAnimParams);

  useEffect(() => {
    // MutationObserver 监听 data-theme 属性变化
    const observer = new MutationObserver(() => {
      setParams(getThemeAnimParams());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return params;
}

// ─────────────────────────────────────────────────────────────
// CSS 变量读取辅助
// ─────────────────────────────────────────────────────────────

/**
 * 从 CSS 变量读取当前主题的数值参数
 * 可在 CSS 中定义 --kb-glow-opacity 等变量，此函数读取并解析
 */
export function getCSSAnimVar(varName: string, fallback: number): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallback;
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}
