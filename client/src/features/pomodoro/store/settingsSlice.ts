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
import { getPhaseDuration, type Mode, type PomodoroSettings, type PomodoroSlice, type PomodoroState } from './pomodoroStoreTypes';

export const createSettingsSlice: PomodoroSlice<Pick<PomodoroState, 'mode' | 'settings' | 'currentGoal' | 'aiRecommendedDuration' | 'aiReasoning' | 'setPreset' | 'setCurrentGoal' | 'updateSettings' | 'setAIRecommendation'>> = (set, get) => ({
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

  setPreset: (presetId) => {
    const { settings, isRunning, activePreset } = get();
    if (activePreset?.id === presetId) return;
    const preset = get().presets.find(p => p.id === presetId) ?? null;
    if (!preset) return;
    // 切换预设 = 开启新周期：计数归零 + 阶段回到 work + 立即应用新预设时长
    // （运行中也重置剩余时间与墙钟截止点——原实现只改阶段不改时长，
    // 导致完成落库按新预设、计时按旧预设的时长失真）
    const mode: Mode = preset.silent ? 'class' : 'self_study';
    const duration = getPhaseDuration('work', preset, settings);
    set({
      activePreset: preset,
      mode,
      completedCount: 0,
      phase: 'work',
      remainingSeconds: duration,
      totalSeconds: duration,
      // 运行中重设墙钟截止点；暂停/空闲保持 null
      endAt: isRunning ? Date.now() + duration * 1000 : null,
    });
    // 持久化 activePresetId
    saveSettings({ ...settings, activePresetId: presetId }).catch(() => {});
  },

  setCurrentGoal: (goal) => set({ currentGoal: goal }),

  setAIRecommendation: (duration, reasoning) =>
    set({ aiRecommendedDuration: duration, aiReasoning: reasoning }),

  updateSettings: (newSettings) => {
    const { settings } = get();
    // 钳制非法时长：0/负数/超上限直接忽略，防止 0 秒番茄与越界值
    // （设置页输入框曾被允许提交 0，而 PresetEditor 有钳制、此处没有）
    const sanitized: Partial<PomodoroSettings> = {};
    for (const [key, value] of Object.entries(newSettings)) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        (sanitized as Record<string, unknown>)[key] = value;
        continue;
      }
      if (key === 'longBreakInterval') {
        if (value >= 0 && value <= 12) (sanitized as Record<string, unknown>)[key] = value;
        continue;
      }
      if (key === 'workDuration' || key === 'shortBreakDuration' || key === 'longBreakDuration' || key === 'classDuration') {
        if (value >= 1 && value <= 180) (sanitized as Record<string, unknown>)[key] = value;
        continue;
      }
      (sanitized as Record<string, unknown>)[key] = value;
    }
    const merged = { ...settings, ...sanitized };
    set({ settings: merged });
    // 统一时长同步入口：空闲时按新设置刷新当前阶段展示时长（运行/暂停中不打断）
    get().syncDisplayDuration();

    // 持久化设置
    saveSettings(merged).catch(() => {});
  },
});
