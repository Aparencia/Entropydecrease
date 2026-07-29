/**
 * @file 动画模块统一导出
 * @description 氛围系统、微交互组件、动画预设的统一入口
 *
 * @ai-context: 动效模块统一出口 barrel，保持旧导入路径兼容。
 */

// ── 状态管理 ──
export { useAmbientStore } from './useAmbientState';
export type { GlowSpot, FocusAchievement } from './useAmbientState';

// ── CSS 变量同步 Hook ──
export {
  useAmbientCSSSync,
  useAmbientMouseTracker,
  useAmbientScrollTracker,
  useAmbientVisibilityTracker,
} from './useAmbientCSSSync';

// ── 心流氛围光引擎 ──
export { useAmbientLight } from './useAmbientLight';

// ── 专注成就系统 ──
export { useFocusAchievement } from './useFocusAchievement';

// ── 动画预设 ──
export * from './presets';

// ── 主题参数 ──
export * from './themeVariants';

// ── 动画偏好 ──
export * from './useAnimationPreference';

// ── 组件 ──
export { default as InkRipple, triggerInkRipple } from './InkRipple';
export { default as AIPulseLoading } from './AIPulseLoading';
