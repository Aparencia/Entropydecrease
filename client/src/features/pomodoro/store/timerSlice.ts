/**
 * 番茄钟状态仓库 — 计时器 slice（状态 + 生命周期操作）
 * Pomodoro timer slice — phase state and lifecycle actions
 *
 * @ai-context: 拆分自 usePomodoroStore。本 slice 承载计时器核心状态与
 * start/pause/resume/reset/skip/immersive/initialize；tick 因体量独立于
 * tickSlice。墙钟校准（endAt 吸附）语义保持不变。会话落库/成就/珊瑚
 * 种植等副作用集中在 tick 完成分支，不在此重复。
 * @ai-context: Extracted from the monolith. Holds timer core state and
 * lifecycle actions; the heavy tick machine lives in tickSlice. Wall-clock
 * calibration via endAt is preserved verbatim.
 */
import { loadSettings } from './usePomodoroPersistence';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { seedBuiltinPresets } from '../lib/presetService';
import {
  COMMIT_DIVE_SECONDS, MINI_DIVE_SECONDS, getPhaseDuration,
  getInterval, getNextCount, getNextPhase,
  type Mode, type PomodoroSlice, type PomodoroState,
} from './pomodoroStoreTypes';

export const defaultSettings: PomodoroState['settings'] = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  autoStartBreak: true,
  autoStartWork: false,
  soundEnabled: true,
  notificationEnabled: false,
  classDuration: 45,
};

export const createTimerSlice: PomodoroSlice<Pick<PomodoroState,
  | 'phase' | 'isRunning' | 'isPaused' | 'remainingSeconds' | 'totalSeconds'
  | 'endAt' | 'completedCount' | 'sessionStartTime' | 'pausedAt' | 'totalPausedMs'
  | 'isMiniDive' | 'isImmersive' | 'wasImmersive' | 'lastAction' | 'lastActionCounter'
  | 'lastCompletedPhase' | 'isCycleComplete' | 'lastSessionActualDuration'
  | 'showCompletionOverlay' | 'dismissCompletionOverlay' | 'initialize'
  | 'start' | 'startMiniDive' | 'startCommitDive' | 'pause' | 'resume'
  | 'reset' | 'skip' | 'enterImmersive' | 'exitImmersive'
>> = (set, get) => ({
  // ── 计时器状态 ──
  phase: 'work',
  isRunning: false,
  isPaused: false,
  remainingSeconds: defaultSettings.workDuration * 60,
  totalSeconds: defaultSettings.workDuration * 60,
  endAt: null,
  completedCount: 0,
  sessionStartTime: null,
  pausedAt: null,
  totalPausedMs: 0,
  isMiniDive: false,
  isImmersive: false,
  wasImmersive: false,
  lastAction: null,
  lastActionCounter: 0,
  lastCompletedPhase: null,
  isCycleComplete: false,
  lastSessionActualDuration: null,
  showCompletionOverlay: false,

  initialize: async () => {
    const saved = await loadSettings();
    const merged = saved ? { ...defaultSettings, ...saved } : defaultSettings;

    // 种子化预设（首次启动时创建内置预设）
    const presets = await seedBuiltinPresets(merged as Parameters<typeof seedBuiltinPresets>[0]);

    // 恢复上次选中的预设
    let activePreset: PomodoroState['activePreset'] = null;
    if (merged.activePresetId) {
      activePreset = presets.find(p => p.id === merged.activePresetId) ?? null;
    }
    if (!activePreset && presets.length > 0) {
      // 默认选中第二个（自习）或第一个
      activePreset = presets.find(p => !p.silent) ?? presets[0];
    }

    const phase = get().phase;
    const duration = getPhaseDuration(phase, activePreset, merged);
    // 派生兼容 mode 字段
    const mode: Mode = activePreset?.silent ? 'class' : 'self_study';
    set({
      settings: merged,
      presets,
      activePreset,
      mode,
      remainingSeconds: get().isRunning || get().isPaused ? get().remainingSeconds : duration,
      totalSeconds: get().isRunning || get().isPaused ? get().totalSeconds : duration,
    });
    // 如果启用了通知，主动请求权限
    if (merged.notificationEnabled && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  },

  start: () => {
    set((s) => ({
      isRunning: true, isPaused: false, sessionStartTime: Date.now(),
      // 墙钟截止点：tick 据此校准，避免 interval 漂移/后台节流累积误差
      endAt: Date.now() + s.remainingSeconds * 1000,
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
      totalPausedMs: 0, pausedAt: null,
    }));
    soundPlayer.play('pomodoro_start');
  },

  startMiniDive: () => {
    // 3 分钟真实专注：走完整 tick 链路（记会话/触发成就），duration 按 180s 如实记录
    set((s) => ({
      mode: 'self_study', phase: 'work',
      remainingSeconds: MINI_DIVE_SECONDS, totalSeconds: MINI_DIVE_SECONDS,
      endAt: Date.now() + MINI_DIVE_SECONDS * 1000,
      isMiniDive: true, isRunning: true, isPaused: false,
      sessionStartTime: Date.now(), currentGoal: '首潜 · 3 分钟体验',
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
    }));
    soundPlayer.play('pomodoro_start');
  },

  startCommitDive: () => {
    // T3: 5 分钟承诺深潜——复用 isMiniDive 记录链路（时长按实际记录，不走预设）
    set((s) => ({
      mode: 'self_study', phase: 'work',
      remainingSeconds: COMMIT_DIVE_SECONDS, totalSeconds: COMMIT_DIVE_SECONDS,
      endAt: Date.now() + COMMIT_DIVE_SECONDS * 1000,
      isMiniDive: true, isRunning: true, isPaused: false,
      sessionStartTime: Date.now(), currentGoal: '就 5 分钟 · 随时可以停',
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
    }));
    soundPlayer.play('pomodoro_start');
  },

  pause: () => {
    set((s) => ({
      isRunning: false, isPaused: true, endAt: null,
      pausedAt: Date.now(),
      lastAction: 'pause', lastActionCounter: s.lastActionCounter + 1,
    }));
    soundPlayer.play('pomodoro_pause');
  },

  resume: () => {
    const { sessionStartTime, wasImmersive, pausedAt, totalPausedMs } = get();
    // 累计暂停时长（暂停时刻到恢复时刻的间隔）
    const additionalPause = pausedAt ? Date.now() - pausedAt : 0;
    set((s) => ({
      isRunning: true,
      isPaused: false,
      // 恢复运行重设墙钟截止点（暂停期间时间不计入）
      endAt: Date.now() + s.remainingSeconds * 1000,
      // 如果 sessionStartTime 为空（重置后），重新记录
      sessionStartTime: sessionStartTime ?? Date.now(),
      // 累计暂停时间
      totalPausedMs: totalPausedMs + additionalPause,
      pausedAt: null,
      // 若上次是从沉浸模式退出的，自动重新进入沉浸
      isImmersive: wasImmersive ? true : get().isImmersive,
      wasImmersive: false,
    }));
  },

  reset: () => {
    const { phase, settings, activePreset } = get();
    const duration = getPhaseDuration(phase, activePreset, settings);
    set({
      remainingSeconds: duration,
      totalSeconds: duration,
      isRunning: false,
      isPaused: false,
      endAt: null,
      sessionStartTime: null,
      wasImmersive: false,
      isMiniDive: false,
      totalPausedMs: 0,
      pausedAt: null,
    });
  },

  skip: () => {
    const { phase, completedCount, settings, activePreset } = get();
    const interval = getInterval(activePreset, settings);
    const newCount = getNextCount(phase, completedCount, interval);
    const nextPhase = getNextPhase(phase, completedCount, interval);
    const duration = getPhaseDuration(nextPhase, activePreset, settings);
    set({
      phase: nextPhase,
      remainingSeconds: duration,
      totalSeconds: duration,
      completedCount: newCount,
      isRunning: false,
      isPaused: false,
      endAt: null,
      isMiniDive: false,
      totalPausedMs: 0,
      pausedAt: null,
    });
  },

  enterImmersive: () => set({ isImmersive: true }),

  exitImmersive: () => {
    const { isRunning } = get();
    // 退出沉浸时自动暂停计时器（不等于结束专注）
    if (isRunning) {
      soundPlayer.play('pomodoro_pause');
    }
    set((s) => ({
      isImmersive: false, wasImmersive: true, isRunning: false, isPaused: true, endAt: null,
      pausedAt: Date.now(),
      lastAction: 'exit_immersive', lastActionCounter: s.lastActionCounter + 1,
    }));
  },

  dismissCompletionOverlay: () => set({ showCompletionOverlay: false }),
});
