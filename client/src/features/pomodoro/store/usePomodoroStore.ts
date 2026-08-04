/**
 * 番茄钟状态仓库（组合入口）— 2026-08 slice 拆分
 * Pomodoro store — composition entry after slice split
 *
 * @ai-context: 拆分自 811 行单体：类型/纯函数在 pomodoroStoreTypes，
 * 计时器状态机在 timerSlice + tickSlice，配置/预设切换在 settingsSlice，
 * 预设 CRUD 在 presetSlice。旧导入路径与全部选择器 hooks 全兼容。
 * @ai-context: Split from the 811-line monolith into four slices; this
 * entry preserves every legacy export and selector hook.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { PomodoroState } from './pomodoroStoreTypes';
import { createTimerSlice } from './timerSlice';
import { createTickSlice } from './tickSlice';
import { createSettingsSlice } from './settingsSlice';
import { createPresetSlice } from './presetSlice';

export const usePomodoroStore = create<PomodoroState>((set, get, store) => ({
  ...createTimerSlice(set, get, store),
  ...createTickSlice(set, get, store),
  ...createSettingsSlice(set, get, store),
  ...createPresetSlice(set, get, store),
}));

// ─── 向后兼容 re-export ─────────────────────────────────────────────────────

export type { Phase, Mode, PomodoroAction, PomodoroSettings, PomodoroState } from './pomodoroStoreTypes';
export { MINI_DIVE_SECONDS, COMMIT_DIVE_SECONDS } from './pomodoroStoreTypes';

// ---------------------------------------------------------------------------
// 选择器 Hooks — 避免整 store 订阅导致不必要的重渲染（保持原实现）
// ---------------------------------------------------------------------------

/** 仅订阅设置对象（低频变更） */
export const usePomodoroSettings = () =>
  usePomodoroStore(s => s.settings);

/** 仅订阅运行状态 */
export const usePomodoroRunning = () =>
  usePomodoroStore(s => s.isRunning);

/** 仅订阅剩余秒数（高频 tick） */
export const usePomodoroRemaining = () =>
  usePomodoroStore(s => s.remainingSeconds);

/** 仅订阅当前阶段 */
export const usePomodoroPhase = () =>
  usePomodoroStore(s => s.phase);

/** 仅订阅暂停状态 */
export const usePomodoroPaused = () =>
  usePomodoroStore(s => s.isPaused);

/** 仅订阅完成计数 */
export const usePomodoroCompletedCount = () =>
  usePomodoroStore(s => s.completedCount);

/** 仅订阅模式（@deprecated 使用 useActivePreset） */
export const usePomodoroMode = () =>
  usePomodoroStore(s => s.mode);

/** 订阅当前活动预设 */
export const useActivePreset = () =>
  usePomodoroStore(s => s.activePreset);

/** 订阅预设列表 */
export const usePresets = () =>
  usePomodoroStore(s => s.presets);

/** 订阅沉浸式状态（复合值，使用 useShallow） */
export const usePomodoroImmersive = () =>
  usePomodoroStore(useShallow(s => ({
    isImmersive: s.isImmersive,
    wasImmersive: s.wasImmersive,
  })));

/**
 * 动作信号 hook — 供 usePomodoroEffects 消费
 * 返回 lastAction、lastActionCounter 及 phase_complete 所需的上下文
 */
export const usePomodoroActionSignal = () =>
  usePomodoroStore(useShallow(s => ({
    lastAction: s.lastAction,
    lastActionCounter: s.lastActionCounter,
    lastCompletedPhase: s.lastCompletedPhase,
    isCycleComplete: s.isCycleComplete,
    lastSessionActualDuration: s.lastSessionActualDuration,
    mode: s.mode,
    activePreset: s.activePreset,
    settings: s.settings,
    currentGoal: s.currentGoal,
  })));

/** 计时器显示所需的最小订阅集（复合，useShallow 防引用不等） */
export const usePomodoroTimerDisplay = () =>
  usePomodoroStore(useShallow(s => ({
    remainingSeconds: s.remainingSeconds,
    totalSeconds: s.totalSeconds,
    isRunning: s.isRunning,
    isPaused: s.isPaused,
    phase: s.phase,
  })));
