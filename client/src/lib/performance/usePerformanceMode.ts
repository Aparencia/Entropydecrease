/**
 * usePerformanceMode — 性能模式 React hook 层
 *
 * - usePerformanceModeStore：Zustand store（mode + setMode），使全部消费方响应模式变更；
 * - usePerformanceMode()：读/写模式（写入时持久化到 localStorage）；
 * - useEffectiveTier()：有效 tier = min(自动 tier, 模式上限)，供 3D 消费侧
 *   （QualityController / 场景 / 粒子系统）替代原先对 tier 的直接订阅。
 *
 * @ai-context: hook 层，依赖 performanceMode 纯函数层与 3D tier store。
 * setMode 会经 IPC 通知主进程（采集频率缩放/进程策略，见 electron/performanceMode.ts）。
 */
import { create } from 'zustand';
import { usePerformanceStore } from '@/lib/3d/core/PerformanceMonitor';
import {
  readPerformanceMode,
  writePerformanceMode,
  effectiveTier,
  type PerformanceMode,
} from './performanceMode';

interface PerformanceModeState {
  mode: PerformanceMode;
  setMode: (m: PerformanceMode) => void;
}

/** 性能模式 store：初始值读自 localStorage，setMode 持久化、通知主进程并更新状态 */
export const usePerformanceModeStore = create<PerformanceModeState>((set) => ({
  mode: readPerformanceMode(),
  setMode: (m) => {
    writePerformanceMode(m);
    // 通知主进程（采集频率缩放等）；非 Electron 环境静默忽略
    window.electronAPI?.invoke('performance:set-mode', m)?.catch((err) => {
      console.debug('[usePerformanceMode] notify main process of mode failed', err);
    });
    set({ mode: m });
  },
}));

/** 读/写性能模式（写入即持久化） */
export function usePerformanceMode() {
  const mode = usePerformanceModeStore((s) => s.mode);
  const setMode = usePerformanceModeStore((s) => s.setMode);
  return { mode, setMode };
}

/**
 * 有效 tier：min(自动 tier, 当前模式上限)。
 * 3D 消费侧应使用本 hook 替代直接订阅 usePerformanceStore.tier，
 * 使用户手动模式能约束自动 tier 的上限（天花板模型）。
 */
export function useEffectiveTier() {
  const autoTier = usePerformanceStore((s) => s.tier);
  const mode = usePerformanceModeStore((s) => s.mode);
  return effectiveTier(autoTier, mode);
}
