/**
 * 护眼模式核心逻辑（自 EyeCareMode.tsx 拆出）
 *
 * @ai-context: 护眼模式 CSS 滤镜工具与 Hook——applyEyeCareFilter / isEyeCareActive /
 * useEyeCareMode 从组件文件移出（react-refresh：组件文件只导出组件），
 * EyeCareModeStyle 组件保留在原文件。CSS custom properties 实现，不影响交互。
 */
import { useEffect } from 'react';

/** 护眼模式 CSS 变量名 */
export const EYE_CARE_VAR = '--ed-eye-care-filter';

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
