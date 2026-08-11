/**
 * EyeCareMode — 护眼模式 CSS 滤镜覆盖层
 *
 * @ai-context: 数字养生守门人护眼模式——CSS 滤镜覆盖（sepia/warm tint），
 * 可开关切换，通过 CSS custom properties 实现，不影响交互。
 */
import { useEffect } from 'react';

/** 护眼模式 CSS 变量名 */
const EYE_CARE_VAR = '--ed-eye-care-filter';

/**
 * 护眼模式效果：暖色调 sepia 滤镜
 * 通过 CSS 自定义属性应用到根元素，避免 DOM 侵入
 */
export function applyEyeCareFilter(enabled: boolean): void {
  const root = document.documentElement;
  if (enabled) {
    root.style.setProperty(EYE_CARE_VAR, 'sepia(0.15) hue-rotate(-10deg) brightness(0.95)');
  } else {
    root.style.removeProperty(EYE_CARE_VAR);
  }
}

/**
 * 检查护眼模式当前是否启用
 */
export function isEyeCareActive(): boolean {
  const root = document.documentElement;
  return root.style.getPropertyValue(EYE_CARE_VAR) !== '';
}

/**
 * 护眼模式管理 Hook
 * 在 body 上应用 CSS 滤镜，toggle 开关
 */
export function useEyeCareMode(enabled: boolean): void {
  useEffect(() => {
    applyEyeCareFilter(enabled);
    return () => {
      applyEyeCareFilter(false);
    };
  }, [enabled]);
}

/**
 * EyeCareMode 样式注入组件
 * 在应用根组件挂载一次，提供 CSS 变量到 body 的映射
 */
export function EyeCareModeStyle() {
  useEffect(() => {
    // 注入 CSS 规则：将 CSS 变量映射到 body 滤镜
    const style = document.createElement('style');
    style.id = 'eye-care-mode-style';
    style.textContent = `
      body {
        filter: var(${EYE_CARE_VAR}, none);
        transition: filter 0.8s ease;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existing = document.getElementById('eye-care-mode-style');
      if (existing) existing.remove();
    };
  }, []);

  return null;
}