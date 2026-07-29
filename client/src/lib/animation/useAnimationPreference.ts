/**
 * 动画偏好管理 hook
 * @ai-context 封装 useReducedMotion + 手动开关 + 性能降级逻辑，统一提供动画决策
 *
 * 基于已有 hooks/useReducedMotion.ts 扩展，不重复检测 prefers-reduced-motion。
 */

import { useState, useEffect, useCallback } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DURATION_ENTER, DURATION_EXIT } from './presets';

/** localStorage 键：用户手动关闭动画 */
const LS_ANIMATION_DISABLED = 'ed-animation-disabled';
const LEGACY_LS_ANIMATION_DISABLED = 'keban-animation-disabled'; // 品牌重构旧键，一次性迁移（兼容保留至 2027-01）

/** 一次性旧键迁移：新键缺失且旧键存在时复制并删除旧键 */
function migrateLegacyAnimationKey(): void {
  try {
    if (localStorage.getItem(LS_ANIMATION_DISABLED) === null) {
      const legacy = localStorage.getItem(LEGACY_LS_ANIMATION_DISABLED);
      if (legacy !== null) {
        localStorage.setItem(LS_ANIMATION_DISABLED, legacy);
        localStorage.removeItem(LEGACY_LS_ANIMATION_DISABLED);
      }
    }
  } catch { /* localStorage 不可用时忽略 */ }
}

export interface AnimationPreference {
  /** 是否减弱动画（系统偏好或手动关闭） */
  isReduced: boolean;
  /** 入场动画时长（秒），reduced 时为 0 */
  enterDuration: number;
  /** 退场动画时长（秒），reduced 时为 0 */
  exitDuration: number;
  /** 通用过渡时长（秒），reduced 时为 0（可传入自定义标准时长） */
  transitionDuration: (standardSeconds?: number) => number;
  /** 综合判断是否应播放动画 */
  shouldAnimate: boolean;
  /** 用户手动切换动画开关（持久化到 localStorage） */
  setManualDisable: (disabled: boolean) => void;
  /** 手动禁用状态 */
  manualDisabled: boolean;
}

/**
 * 统一动画偏好管理
 * - isReduced: prefers-reduced-motion 或 localStorage 手动关闭
 * - enterDuration / exitDuration: 正常返回标准时长，reduced 返回 0
 * - shouldAnimate: 综合判断是否应播放动画
 */
export function useAnimationPreference(): AnimationPreference {
  const prefersReduced = useReducedMotion();

  const [manualDisabled, setManualDisabledState] = useState<boolean>(() => {
    try {
      migrateLegacyAnimationKey();
    return localStorage.getItem(LS_ANIMATION_DISABLED) === 'true';
    } catch {
      return false;
    }
  });

  const setManualDisable = useCallback((disabled: boolean) => {
    setManualDisabledState(disabled);
    try {
      localStorage.setItem(LS_ANIMATION_DISABLED, String(disabled));
    } catch {
      // localStorage 写入失败静默忽略（隐私模式等）
    }
  }, []);

  // 监听其他标签页的 localStorage 变更
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === LS_ANIMATION_DISABLED) {
        setManualDisabledState(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const isReduced = prefersReduced || manualDisabled;

  return {
    isReduced,
    enterDuration: isReduced ? 0 : DURATION_ENTER,
    exitDuration: isReduced ? 0 : DURATION_EXIT,
    transitionDuration: (standardSeconds = DURATION_ENTER) =>
      isReduced ? 0 : standardSeconds,
    shouldAnimate: !isReduced,
    setManualDisable,
    manualDisabled,
  };
}
