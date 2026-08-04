/**
 * 番茄钟状态仓库 — 设置 slice（配置与预设切换）
 * Pomodoro settings slice — config and preset switching
 *
 * @ai-context: 拆分自 usePomodoroStore。updateSettings 在计时器未运行时
 * 同步刷新阶段时长；setPreset 切换=开启新周期（计数归零）；setMode 为
 * @deprecated 兼容层映射到内置预设。saveSettings 持久化失败静默降级。
 * @ai-context: Extracted from the monolith. updateSettings refreshes phase
 * duration when idle; switching presets starts a fresh cycle (count resets);
 * setMode is the deprecated compat shim mapping onto builtin presets.
 */
import { saveSettings } from './usePomodoroPersistence';
import { getPhaseDuration, type Mode, type PomodoroSlice, type PomodoroState } from './pomodoroStoreTypes';

export const createSettingsSlice: PomodoroSlice<Pick<PomodoroState, 'mode' | 'settings' | 'currentGoal' | 'aiRecommendedDuration' | 'aiReasoning' | 'setMode' | 'setPreset' | 'setCurrentGoal' | 'updateSettings' | 'setAIRecommendation'>> = (set, get) => ({
  mode: 'self_study',
  settings: {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartBreak: true,
    autoStartWork: false,
    soundEnabled: true,
    notificationEnabled: false,
    classDuration: 45,
  },
  currentGoal: null,
  aiRecommendedDuration: undefined,
  aiReasoning: undefined,

  /** @deprecated 兼容层：将 mode 映射到内置预设 */
  setMode: (mode) => {
    const { presets } = get();
    const target = mode === 'class'
      ? presets.find(p => p.silent)
      : presets.find(p => !p.silent);
    if (target) get().setPreset(target.id);
  },

  setPreset: (presetId) => {
    const { settings, phase, isRunning, isPaused, activePreset } = get();
    if (activePreset?.id === presetId) return;
    const preset = get().presets.find(p => p.id === presetId) ?? null;
    if (!preset) return;
    // 切换预设 = 开启新周期：计数归零，避免跨预设累计
    const mode: Mode = preset.silent ? 'class' : 'self_study';
    set({ activePreset: preset, mode, completedCount: 0, phase: 'work' });
    // 切换预设后，若计时器未运行，重置当前阶段时长
    if (!isRunning && !isPaused) {
      const duration = getPhaseDuration('work', preset, settings);
      set({ remainingSeconds: duration, totalSeconds: duration });
    }
    // 持久化 activePresetId
    saveSettings({ ...settings, activePresetId: presetId }).catch(() => {});
  },

  setCurrentGoal: (goal) => set({ currentGoal: goal }),

  setAIRecommendation: (duration, reasoning) =>
    set({ aiRecommendedDuration: duration, aiReasoning: reasoning }),

  updateSettings: (newSettings) => {
    const { settings, phase, isRunning, isPaused, activePreset } = get();
    const merged = { ...settings, ...newSettings };

    // If not running, update timer to reflect new duration
    if (!isRunning && !isPaused) {
      const duration = getPhaseDuration(phase, activePreset, merged);
      set({
        settings: merged,
        remainingSeconds: duration,
        totalSeconds: duration,
      });
    } else {
      set({ settings: merged });
    }

    // 持久化设置
    saveSettings(merged).catch(() => {});
  },
});
