/**
 * EyeCareMode — 护眼模式 CSS 滤镜覆盖层
 *
 * @ai-context: 数字养生守门人护眼模式——CSS 滤镜覆盖（sepia/warm tint），
 * 可开关切换，通过 CSS custom properties 实现，不影响交互。
 */
import { useEffect } from 'react';
import { EYE_CARE_VAR } from './eyeCareModeUtils';

// react-refresh: 组件文件只导出组件；工具/hook 已移至 ./eyeCareModeUtils，
// 此处 re-export 保持 '@/components/EyeCareMode' 导出签名不变（App.tsx 直接 import）
// oxlint-disable-next-line react/only-export-components
export { applyEyeCareFilter, isEyeCareActive, useEyeCareMode } from './eyeCareModeUtils';

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
