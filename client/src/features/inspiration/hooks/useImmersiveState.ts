/**
 * 沉浸式状态机 hook
 * @ai-context 管理从普通列表进入沉浸式全屏 → 点击空白触发突触动画 → 卡片浮现 → 退出的完整生命周期
 */

import { useReducer, useCallback, useEffect } from 'react';
import type {
  ImmersivePhase,
  ImmersiveAction,
  SynapseState,
  DegradationLevel,
} from '../types';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';

// ─────────────────────────────────────────────────────────────
// Reducer（纯函数，无副作用）
// ─────────────────────────────────────────────────────────────

const INITIAL_STATE: SynapseState = {
  phase: 'idle',
  clickPoint: null,
  curveSeed: 0,
};

/**
 * 沉浸式阶段 reducer
 * @ai-context 根据 dispatch action 驱动 SynapseState 在 idle → entering → immersive → synapse → converge → card → settled 间流转
 */
function synapseReducer(state: SynapseState, action: ImmersiveAction): SynapseState {
  switch (action.type) {
    case 'ENTER':
      return { ...state, phase: 'entering' };
    case 'ENTER_COMPLETE':
      return { ...state, phase: 'immersive' };
    case 'CLICK':
      return { ...state, phase: 'synapse', clickPoint: action.point, curveSeed: Date.now() };
    case 'SYNAPSE_COMPLETE':
      return { ...state, phase: 'converge' };
    case 'CONVERGE_COMPLETE':
      return { ...state, phase: 'card' };
    case 'CARD_COMPLETE':
      return { ...state, phase: 'settled' };
    case 'DISMISS_CARD':
      return { phase: 'idle', clickPoint: null, curveSeed: state.curveSeed };
    case 'EXIT':
      return { ...INITIAL_STATE };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * 沉浸式视图状态机 hook
 * @ai-context 管理从普通列表进入沉浸式全屏 → 点击空白触发突触动画 → 卡片浮现 → 退出的完整生命周期
 * @returns 当前阶段、进入/点击/关闭/退出方法、设备降级级别
 */
export function useImmersiveState(): {
  phase: ImmersivePhase;
  degradation: DegradationLevel;
  clickPoint: { x: number; y: number } | null;
  curveSeed: number;
  enter: () => void;
  click: (point: { x: number; y: number }) => void;
  dismiss: () => void;
  exit: () => void;
  enteringComplete: () => void;
  synapseComplete: () => void;
  convergeComplete: () => void;
  cardComplete: () => void;
} {
  const [state, dispatch] = useReducer(synapseReducer, INITIAL_STATE);
  const { shouldDisableHeavyAnimations, prefersReducedMotion } = useDeviceCapability();

  // 设备降级级别推导
  const degradation: DegradationLevel = prefersReducedMotion
    ? 'L2'
    : shouldDisableHeavyAnimations
      ? 'L1'
      : 'L0';

  // Escape 键退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.phase !== 'idle') {
        dispatch({ type: 'EXIT' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.phase]);

  const enter = useCallback(() => dispatch({ type: 'ENTER' }), []);
  const click = useCallback(
    (point: { x: number; y: number }) => dispatch({ type: 'CLICK', point }),
    [],
  );
  const dismiss = useCallback(() => dispatch({ type: 'DISMISS_CARD' }), []);
  const exit = useCallback(() => dispatch({ type: 'EXIT' }), []);
  const enteringComplete = useCallback(() => dispatch({ type: 'ENTER_COMPLETE' }), []);
  const synapseComplete = useCallback(() => dispatch({ type: 'SYNAPSE_COMPLETE' }), []);
  const convergeComplete = useCallback(() => dispatch({ type: 'CONVERGE_COMPLETE' }), []);
  const cardComplete = useCallback(() => dispatch({ type: 'CARD_COMPLETE' }), []);

  return {
    phase: state.phase,
    degradation,
    clickPoint: state.clickPoint,
    curveSeed: state.curveSeed,
    enter,
    click,
    dismiss,
    exit,
    enteringComplete,
    synapseComplete,
    convergeComplete,
    cardComplete,
  };
}
