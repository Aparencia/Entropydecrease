/**
 * @ai-context: 设备性能分级检测（内存/核数/GPU），供 3D 场景与动效降级决策。
 */
import { useReducedMotion } from './useReducedMotion';

export interface DeviceCapability {
  /** 是否为低端设备（硬件并发数 < 4） */
  isLowEnd: boolean;
  /** 用户是否偏好减弱动效 */
  prefersReducedMotion: boolean;
  /** 综合判断：是否应禁用重量级动画（低端设备 || 偏好减弱动效） */
  shouldDisableHeavyAnimations: boolean;
}

/**
 * 设备能力检测 hook
 *
 * 综合硬件并发数与 prefers-reduced-motion 偏好，
 * 返回是否应禁用重量级动画（如粒子系统、环境光呼吸动画等）。
 *
 * 用法：
 * ```tsx
 * const { shouldDisableHeavyAnimations } = useDeviceCapability();
 * ```
 */
export function useDeviceCapability(): DeviceCapability {
  const prefersReducedMotion = useReducedMotion();
  const isLowEnd =
    typeof navigator !== 'undefined' &&
    (navigator.hardwareConcurrency ?? 4) < 4;

  return {
    isLowEnd,
    prefersReducedMotion,
    shouldDisableHeavyAnimations: isLowEnd || prefersReducedMotion,
  };
}
