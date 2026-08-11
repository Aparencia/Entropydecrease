import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock persistence layer to avoid storage coupling
// 音效播放器：jsdom 无 AudioContext，真实调用会触发 fetch 音频文件（5s 超时）
// 并留下悬挂异步任务导致测试进程不退出，故整体 mock
vi.mock('@/lib/audio/SoundPlayer', () => ({
  soundPlayer: {
    play: vi.fn(),
    playByCategory: vi.fn(),
    preload: vi.fn().mockResolvedValue(undefined),
    preloadAll: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn(),
    getVolume: vi.fn().mockReturnValue(1),
    setMuted: vi.fn(),
    getSettings: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('@/lib/achievements/evaluator', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
}));

vi.mock('./usePomodoroPersistence', () => ({
  loadSettings: vi.fn().mockResolvedValue(null),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  recordSession: vi.fn().mockResolvedValue(undefined),
  playCompletionSound: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock 预设服务，避免 IndexedDB 依赖
vi.mock('../lib/presetService', () => ({
  MAX_PRESETS: 8,
  getAllPresets: vi.fn().mockResolvedValue([]),
  getPresetById: vi.fn().mockResolvedValue(undefined),
  createPreset: vi.fn().mockResolvedValue({}),
  updatePreset: vi.fn().mockResolvedValue(undefined),
  deletePreset: vi.fn().mockResolvedValue(undefined),
  reorderPresets: vi.fn().mockResolvedValue(undefined),
  seedBuiltinPresets: vi.fn().mockResolvedValue([]),
}));

import { usePomodoroStore } from './usePomodoroStore';
import { isColdStart } from './pomodoroStoreTypes';
import { recordSession, playCompletionSound } from './usePomodoroPersistence';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { PomodoroPreset } from '@/types/models';

// 测试用内置预设
const CLASS_PRESET: PomodoroPreset = {
  id: 'preset-class', name: '上课', icon: 'GraduationCap',
  workDuration: 45, shortBreakDuration: 5, longBreakDuration: 15,
  longBreakInterval: 0, silent: true, builtin: true, sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const STUDY_PRESET: PomodoroPreset = {
  id: 'preset-study', name: '自习', icon: 'BookOpen',
  workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15,
  longBreakInterval: 4, silent: false, builtin: true, sortOrder: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

// Default settings (mirrors store internals)
const DEFAULT_SETTINGS = {
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

const DEFAULT_STATE = {
  phase: 'work' as const,
  isRunning: false,
  isPaused: false,
  isArmed: false,
  lastActivityAt: Date.now(),
  isStepDive: false,
  stepCompleted: false,
  ritualSkipped: false,
  _breathingResumeRemaining: null as number | null,
  _breathingResumeTotal: null as number | null,
  remainingSeconds: 25 * 60,
  totalSeconds: 25 * 60,
  endAt: null as number | null,
  completedCount: 0,
  showCompletionOverlay: false,
  mode: 'self_study' as const,
  settings: DEFAULT_SETTINGS,
  presets: [CLASS_PRESET, STUDY_PRESET],
  activePreset: STUDY_PRESET,
};

beforeEach(() => {
  usePomodoroStore.setState({ ...DEFAULT_STATE });
  vi.clearAllMocks();
});

describe('Pomodoro Store', () => {
  // ── start / pause / resume ────────────────────────────────

  describe('start/pause/resume', () => {
    it('should start timer', () => {
      usePomodoroStore.getState().start();
      expect(usePomodoroStore.getState().isRunning).toBe(true);
      expect(usePomodoroStore.getState().isPaused).toBe(false);
    });

    it('should pause timer', () => {
      usePomodoroStore.getState().start();
      usePomodoroStore.getState().pause();
      expect(usePomodoroStore.getState().isRunning).toBe(false);
      expect(usePomodoroStore.getState().isPaused).toBe(true);
    });

    it('should resume timer after pause', () => {
      usePomodoroStore.getState().start();
      usePomodoroStore.getState().pause();
      usePomodoroStore.getState().resume();
      expect(usePomodoroStore.getState().isRunning).toBe(true);
      expect(usePomodoroStore.getState().isPaused).toBe(false);
    });
  });

  // ── tick countdown ────────────────────────────────────────

  describe('tick', () => {
    it('should decrement remainingSeconds by 1 when running', () => {
      usePomodoroStore.getState().start();
      const before = usePomodoroStore.getState().remainingSeconds;
      usePomodoroStore.getState().tick();
      expect(usePomodoroStore.getState().remainingSeconds).toBe(before - 1);
    });

    it('should not decrement when not running', () => {
      const before = usePomodoroStore.getState().remainingSeconds;
      usePomodoroStore.getState().tick();
      expect(usePomodoroStore.getState().remainingSeconds).toBe(before);
    });

    it('should snap remainingSeconds to endAt wall clock when drift exceeds 1s', () => {
      // Arrange：模拟休眠唤醒——递减模型认为还剩 500s，但墙钟显示实际只剩 100s
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 500,
        endAt: Date.now() + 100 * 1000,
      });

      // Act
      usePomodoroStore.getState().tick();

      // Assert：吸附到墙钟值而非继续 -1
      expect(usePomodoroStore.getState().remainingSeconds).toBe(100);
    });

    it('should keep -1 rhythm when wall clock drift is within 1s', () => {
      // Arrange：刚 start，墙钟与递减模型误差 ≤1s，不应跳秒
      usePomodoroStore.getState().start();
      const before = usePomodoroStore.getState().remainingSeconds;

      // Act
      usePomodoroStore.getState().tick();

      // Assert
      expect(usePomodoroStore.getState().remainingSeconds).toBe(before - 1);
    });
  });

  // ── phase rotation ────────────────────────────────────────

  describe('phase rotation', () => {
    it('should transition from work to short_break after timer ends', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('short_break');
      expect(state.completedCount).toBe(1);
    });

    it('should transition from short_break back to work', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'short_break',
        completedCount: 1,
      });
      usePomodoroStore.getState().tick();
      expect(usePomodoroStore.getState().phase).toBe('work');
    });

    it('should trigger long_break every 4th pomodoro', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 3, // 3 already done, this will be the 4th
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('long_break');
      expect(state.completedCount).toBe(4);
    });

    it('should return to short_break for non-4th pomodoro', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 1, // 2nd pomodoro
      });
      usePomodoroStore.getState().tick();
      expect(usePomodoroStore.getState().phase).toBe('short_break');
    });

    it('should set correct duration for short_break phase', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(5 * 60);
      expect(state.totalSeconds).toBe(5 * 60);
    });

    it('should set correct duration for long_break phase', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 3,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(15 * 60);
      expect(state.totalSeconds).toBe(15 * 60);
    });

    it('should set correct duration when returning to work', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'short_break',
        completedCount: 1,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(25 * 60);
      expect(state.totalSeconds).toBe(25 * 60);
    });
  });

  // ── autoStart behavior ────────────────────────────────────

  describe('autoStart', () => {
    it('should auto-start break when autoStartBreak is true', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.isRunning).toBe(true); // break auto-starts
      expect(state.isPaused).toBe(false);
    });

    it('should NOT auto-start work when autoStartWork is false', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'short_break',
        completedCount: 1,
        settings: { ...DEFAULT_SETTINGS, autoStartWork: false },
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(true);
    });

    it('should auto-start work when autoStartWork is true', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'short_break',
        completedCount: 1,
        settings: { ...DEFAULT_SETTINGS, autoStartWork: true },
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.isRunning).toBe(true);
    });
  });

  // ── session recording ─────────────────────────────────────

  describe('session recording', () => {
    it('should record session when work phase completes', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      expect(recordSession).toHaveBeenCalledTimes(1);
    });

    it('should NOT record session when break phase completes', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'short_break',
        completedCount: 1,
      });
      usePomodoroStore.getState().tick();
      expect(recordSession).not.toHaveBeenCalled();
    });

    it('should play completion sound when soundEnabled', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      expect(playCompletionSound).toHaveBeenCalledTimes(1);
    });

    it('should NOT play sound when soundEnabled is false', () => {
      usePomodoroStore.setState({
        isRunning: true,
        remainingSeconds: 1,
        phase: 'work',
        completedCount: 0,
        settings: { ...DEFAULT_SETTINGS, soundEnabled: false },
      });
      usePomodoroStore.getState().tick();
      expect(playCompletionSound).not.toHaveBeenCalled();
    });
  });

  // ── skip ──────────────────────────────────────────────────

  describe('skip', () => {
    it('skip work 应计入长休周期计数（completedCount +1）且进入短休', () => {
      usePomodoroStore.setState({ phase: 'work', completedCount: 0 });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('short_break');
      expect(state.completedCount).toBe(1); // 跳过也计入长休周期计数
      expect(state.isRunning).toBe(false);
    });

    it('should skip break without incrementing completedCount', () => {
      usePomodoroStore.setState({ phase: 'short_break', completedCount: 1 });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.completedCount).toBe(1); // unchanged
    });

    it('第 4 次 work 跳过应进入 long_break 且计数 +1（=4）', () => {
      usePomodoroStore.setState({ phase: 'work', completedCount: 3 });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('long_break');
      expect(state.completedCount).toBe(4); // 跳过也计入周期计数
    });
  });

  // ── reset ─────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset timer to current phase duration', () => {
      usePomodoroStore.setState({
        phase: 'work',
        isRunning: true,
        isPaused: false,
        remainingSeconds: 100,
        totalSeconds: 1500,
      });
      usePomodoroStore.getState().reset();
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(25 * 60);
      expect(state.totalSeconds).toBe(25 * 60);
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(false);
    });

    it('should reset to short_break duration when in short_break', () => {
      usePomodoroStore.setState({ phase: 'short_break', remainingSeconds: 100 });
      usePomodoroStore.getState().reset();
      expect(usePomodoroStore.getState().remainingSeconds).toBe(5 * 60);
    });
  });

  // ── updateSettings ────────────────────────────────────────

  describe('updateSettings', () => {
    it('should merge settings and update timer when not running (no active preset)', () => {
      // 无活动预设时，时长由 settings 驱动
      usePomodoroStore.setState({ activePreset: null });
      usePomodoroStore.getState().updateSettings({ workDuration: 30 });
      const state = usePomodoroStore.getState();
      expect(state.settings.workDuration).toBe(30);
      expect(state.remainingSeconds).toBe(30 * 60);
      expect(state.totalSeconds).toBe(30 * 60);
    });

    it('should use preset duration when active preset exists', () => {
      // 有活动预设时，时长由预设驱动（25min），不随 settings.workDuration 变化
      usePomodoroStore.getState().updateSettings({ workDuration: 30 });
      const state = usePomodoroStore.getState();
      expect(state.settings.workDuration).toBe(30);
      expect(state.remainingSeconds).toBe(25 * 60); // STUDY_PRESET.workDuration
    });

    it('should NOT update timer when running', () => {
      usePomodoroStore.setState({ isRunning: true, remainingSeconds: 500 });
      usePomodoroStore.getState().updateSettings({ workDuration: 30 });
      const state = usePomodoroStore.getState();
      expect(state.settings.workDuration).toBe(30);
      expect(state.remainingSeconds).toBe(500); // unchanged
    });

    it('should NOT update timer when paused', () => {
      usePomodoroStore.setState({ isPaused: true, remainingSeconds: 300 });
      usePomodoroStore.getState().updateSettings({ workDuration: 30 });
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(300); // unchanged
    });
  });

  // ── completedCount reset after long_break ─────────────────

  describe('completedCount reset after long_break', () => {
    /** Helper: fast-forward through one complete phase (tick until remainingSeconds <= 1 then tick once more) */
    const completePhase = () => {
      // 快进需同步推进墙钟锚点：endAt 置为已过期，模拟墙钟也已走完
      // （真实运行中 remaining=1 时墙钟必然同步归零；不同步会触发"锚点未归零等待"）
      usePomodoroStore.setState({ remainingSeconds: 1, isRunning: true, endAt: Date.now() - 1 });
      usePomodoroStore.getState().tick();
    };

    it('should reset completedCount to 0 after long_break ends (tick)', () => {
      // Start at completedCount=3 (about to do 4th work → long_break)
      usePomodoroStore.setState({ phase: 'work', completedCount: 3, isRunning: true, remainingSeconds: 1 });
      usePomodoroStore.getState().tick(); // work → long_break, completedCount=4
      expect(usePomodoroStore.getState().phase).toBe('long_break');
      expect(usePomodoroStore.getState().completedCount).toBe(4);

      // Complete long_break
      completePhase(); // long_break → work, completedCount should reset to 0
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.completedCount).toBe(0);
    });

    it('should correctly trigger long_break again in the second cycle (full two-round)', () => {
      // Simulate: completedCount=3, work phase ending → long_break
      usePomodoroStore.setState({ phase: 'work', completedCount: 3, isRunning: true, remainingSeconds: 1 });
      usePomodoroStore.getState().tick(); // → long_break, count=4
      completePhase(); // long_break → work, count=0

      // Now do 3 more work phases (count goes 0→1→2→3)
      for (let i = 0; i < 3; i++) {
        completePhase(); // work → short_break
        completePhase(); // short_break → work
      }
      expect(usePomodoroStore.getState().completedCount).toBe(3);
      expect(usePomodoroStore.getState().phase).toBe('work');

      // 4th work in new cycle → long_break
      completePhase();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('long_break');
      expect(state.completedCount).toBe(4);
    });

    it('should reset completedCount to 0 when skipping long_break', () => {
      usePomodoroStore.setState({ phase: 'long_break', completedCount: 4 });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.completedCount).toBe(0);
    });

    it('should have correct phase sequence for 8 consecutive pomodoros (2 full cycles)', () => {
      const phases: string[] = [];
      usePomodoroStore.setState({ phase: 'work', completedCount: 0, isRunning: true });

      for (let i = 0; i < 8; i++) {
        completePhase(); // work → break
        phases.push(usePomodoroStore.getState().phase);
        completePhase(); // break → work
        phases.push(usePomodoroStore.getState().phase);
      }

      // Expected pattern: for every 4th work, long_break; otherwise short_break
      // After work 1: short_break, work
      // After work 2: short_break, work
      // After work 3: short_break, work
      // After work 4: long_break, work (count resets to 0)
      // After work 5: short_break, work
      // After work 6: short_break, work
      // After work 7: short_break, work
      // After work 8: long_break, work (count resets to 0)
      const expected = [
        'short_break', 'work',
        'short_break', 'work',
        'short_break', 'work',
        'long_break', 'work',
        'short_break', 'work',
        'short_break', 'work',
        'short_break', 'work',
        'long_break', 'work',
      ];
      expect(phases).toEqual(expected);
      expect(usePomodoroStore.getState().completedCount).toBe(0);
    });
  });

  // ── 预设切换派生 mode（setMode 兼容层已移除，语义由 setPreset 承载）──

  describe('setPreset mode derivation', () => {
    it('should derive mode from silent preset when switching preset', () => {
      usePomodoroStore.setState({ presets: [CLASS_PRESET, STUDY_PRESET], activePreset: STUDY_PRESET });
      usePomodoroStore.getState().setPreset('preset-class');
      expect(usePomodoroStore.getState().mode).toBe('class');
      expect(usePomodoroStore.getState().activePreset?.id).toBe('preset-class');
    });

    it('should reset completedCount when switching preset', () => {
      // 上课模式累计了 7 个番茄后切到自习预设，计数应归零
      usePomodoroStore.setState({ presets: [CLASS_PRESET, STUDY_PRESET], mode: 'class', activePreset: CLASS_PRESET, completedCount: 7 });
      usePomodoroStore.getState().setPreset('preset-study');
      expect(usePomodoroStore.getState().completedCount).toBe(0);
    });

    it('should NOT reset completedCount when setting the same preset', () => {
      usePomodoroStore.setState({ presets: [CLASS_PRESET, STUDY_PRESET], mode: 'self_study', activePreset: STUDY_PRESET, completedCount: 2 });
      usePomodoroStore.getState().setPreset('preset-study');
      expect(usePomodoroStore.getState().completedCount).toBe(2);
    });
  });

  // ── class mode completedCount ────────────────────────────

  describe('class mode completedCount', () => {
    const completeWorkPhase = () => {
      usePomodoroStore.setState({ phase: 'work', remainingSeconds: 1, isRunning: true });
      usePomodoroStore.getState().tick(); // work → short_break
      usePomodoroStore.setState({ remainingSeconds: 1, isRunning: true });
      usePomodoroStore.getState().tick(); // short_break → work
    };

    it('should never enter long_break in class mode', () => {
      usePomodoroStore.setState({
        mode: 'class', activePreset: CLASS_PRESET, phase: 'work', completedCount: 3,
        isRunning: true, remainingSeconds: 1,
      });
      usePomodoroStore.getState().tick();
      expect(usePomodoroStore.getState().phase).toBe('short_break');
    });

    it('should wrap completedCount within longBreakInterval in class mode (no unbounded growth)', () => {
      // 回归：上课模式无长休导致计数永不归零、一直累加（实测 9/4）
      usePomodoroStore.setState({ mode: 'class', activePreset: CLASS_PRESET, completedCount: 0 });
      for (let i = 0; i < 9; i++) completeWorkPhase();
      const count = usePomodoroStore.getState().completedCount;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(4);
    });

    it('class 模式 skip work 也计入周期计数（+1）', () => {
      usePomodoroStore.setState({ mode: 'class', activePreset: CLASS_PRESET, phase: 'work', completedCount: 4 });
      usePomodoroStore.getState().skip();
      expect(usePomodoroStore.getState().completedCount).toBe(5);
    });
  });

  // ── 迷你潜水（startMiniDive）───────────────────────────────

  describe('startMiniDive — 首潜 3 分钟体验', () => {
    it('应设置 180 秒计时器并立即开始运行', () => {
      usePomodoroStore.getState().startMiniDive();
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(180);
      expect(state.totalSeconds).toBe(180);
      expect(state.isRunning).toBe(true);
      expect(state.isPaused).toBe(false);
      expect(state.isMiniDive).toBe(true);
      expect(state.phase).toBe('work');
      expect(state.currentGoal).toBe('首潜 · 3 分钟体验');
    });

    it('迷你潜水完成后应清除 isMiniDive 标记', () => {
      usePomodoroStore.setState({
        isRunning: true, remainingSeconds: 1, phase: 'work',
        completedCount: 0, isMiniDive: true,
        activePreset: STUDY_PRESET,
      });
      usePomodoroStore.getState().tick();
      // 阶段切换后 isMiniDive 应重置
      expect(usePomodoroStore.getState().isMiniDive).toBe(false);
    });
  });

  // ── 沉浸专注模式 ─────────────────────────────────────────────

  describe('沉浸专注模式（enterImmersive / exitImmersive）', () => {
    it('enterImmersive 应设置 isImmersive=true', () => {
      usePomodoroStore.getState().enterImmersive();
      expect(usePomodoroStore.getState().isImmersive).toBe(true);
    });

    it('exitImmersive 应暂停计时器并标记 wasImmersive', () => {
      usePomodoroStore.setState({ isRunning: true, isImmersive: true });
      usePomodoroStore.getState().exitImmersive();
      const state = usePomodoroStore.getState();
      expect(state.isImmersive).toBe(false);
      expect(state.wasImmersive).toBe(true);
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(true);
      // 动作信号应为 exit_immersive
      expect(state.lastAction).toBe('exit_immersive');
    });

    it('resume 不再自动重入沉浸模式（尊重用户对沉浸模式的选择）', () => {
      usePomodoroStore.setState({
        isRunning: false, isPaused: true,
        isImmersive: false, wasImmersive: true,
        sessionStartTime: null,
      });
      usePomodoroStore.getState().resume();
      const state = usePomodoroStore.getState();
      expect(state.isRunning).toBe(true);
      expect(state.isImmersive).toBe(false);
      expect(state.wasImmersive).toBe(false);
    });
  });

  // ── AI 推荐集成 ────────────────────────────────────────────────

  describe('AI 推荐集成（setAIRecommendation）', () => {
    it('应存储 AI 推荐的工作时长和理由', () => {
      usePomodoroStore.getState().setAIRecommendation(30, '基于过去 7 天的学习数据分析');
      const state = usePomodoroStore.getState();
      expect(state.aiRecommendedDuration).toBe(30);
      expect(state.aiReasoning).toBe('基于过去 7 天的学习数据分析');
    });

    it('重复调用应覆盖旧推荐值', () => {
      usePomodoroStore.getState().setAIRecommendation(25, '初始推荐');
      usePomodoroStore.getState().setAIRecommendation(35, '更新推荐');
      const state = usePomodoroStore.getState();
      expect(state.aiRecommendedDuration).toBe(35);
      expect(state.aiReasoning).toBe('更新推荐');
    });
  });

  // ── 当前目标（setCurrentGoal） ──────────────────────────────────

  describe('setCurrentGoal — 设置当前番茄目标', () => {
    it('应正确设置目标文字', () => {
      usePomodoroStore.getState().setCurrentGoal('复习 FSRS 算法');
      expect(usePomodoroStore.getState().currentGoal).toBe('复习 FSRS 算法');
    });

    it('应支持清空目标（设为 null）', () => {
      usePomodoroStore.getState().setCurrentGoal('某目标');
      usePomodoroStore.getState().setCurrentGoal(null);
      expect(usePomodoroStore.getState().currentGoal).toBeNull();
    });
  });

  // ── 动作信号（lastAction / lastActionCounter）─────────────────

  describe('动作信号（lastAction / lastActionCounter）', () => {
    it('start 应发出 start 信号并递增 counter', () => {
      const beforeCounter = usePomodoroStore.getState().lastActionCounter;
      usePomodoroStore.getState().start();
      const state = usePomodoroStore.getState();
      expect(state.lastAction).toBe('start');
      expect(state.lastActionCounter).toBe(beforeCounter + 1);
    });

    it('pause 应发出 pause 信号', () => {
      usePomodoroStore.getState().start();
      const counter = usePomodoroStore.getState().lastActionCounter;
      usePomodoroStore.getState().pause();
      const state = usePomodoroStore.getState();
      expect(state.lastAction).toBe('pause');
      expect(state.lastActionCounter).toBe(counter + 1);
    });

    it('phase_complete 时 lastCompletedPhase 应记录完成的阶段', () => {
      usePomodoroStore.setState({
        isRunning: true, remainingSeconds: 1, phase: 'work', completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.lastAction).toBe('phase_complete');
      expect(state.lastCompletedPhase).toBe('work');
    });

    it('长休结束时 isCycleComplete 应为 true', () => {
      usePomodoroStore.setState({
        isRunning: true, remainingSeconds: 1, phase: 'long_break', completedCount: 4,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.lastCompletedPhase).toBe('long_break');
      expect(state.isCycleComplete).toBe(true);
    });
  });

  // ── showCompletionOverlay（v0.29 庆祝覆盖层）───────────────────

  describe('showCompletionOverlay — 深潜完成庆祝', () => {
    it('工作阶段完成时应显示庆祝覆盖层', () => {
      usePomodoroStore.setState({
        isRunning: true, remainingSeconds: 1, phase: 'work', completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      expect(usePomodoroStore.getState().showCompletionOverlay).toBe(true);
    });

    it('dismissCompletionOverlay 应关闭覆盖层', () => {
      usePomodoroStore.setState({ showCompletionOverlay: true });
      usePomodoroStore.getState().dismissCompletionOverlay();
      expect(usePomodoroStore.getState().showCompletionOverlay).toBe(false);
    });

    it('休息阶段完成时不应触发庆祝覆盖层', () => {
      usePomodoroStore.setState({
        isRunning: true, remainingSeconds: 1, phase: 'short_break', completedCount: 1,
        showCompletionOverlay: false,
      });
      usePomodoroStore.getState().tick();
      expect(usePomodoroStore.getState().showCompletionOverlay).toBe(false);
    });
  });

  // ── setPreset（预设切换）────────────────────────────────────────

  describe('setPreset — 预设切换', () => {
    it('切换预设应重置计数并回到 work 阶段', () => {
      usePomodoroStore.setState({
        presets: [CLASS_PRESET, STUDY_PRESET],
        activePreset: STUDY_PRESET,
        completedCount: 3,
        phase: 'short_break',
      });
      usePomodoroStore.getState().setPreset('preset-class');
      const state = usePomodoroStore.getState();
      expect(state.activePreset?.id).toBe('preset-class');
      expect(state.completedCount).toBe(0);
      expect(state.phase).toBe('work');
    });

    it('切换到相同预设应无任何操作', () => {
      usePomodoroStore.setState({ activePreset: STUDY_PRESET, completedCount: 2 });
      usePomodoroStore.getState().setPreset('preset-study');
      // completedCount 不变说明没有重新切换
      expect(usePomodoroStore.getState().completedCount).toBe(2);
    });

    it('运行中切换预设应重置阶段时长与墙钟截止点（落库时长与实际计时一致）', () => {
      usePomodoroStore.setState({
        presets: [CLASS_PRESET, STUDY_PRESET],
        activePreset: STUDY_PRESET,
        isRunning: true,
        remainingSeconds: 600, totalSeconds: 1500,
      });
      usePomodoroStore.getState().setPreset('preset-class');
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(45 * 60);
      expect(state.totalSeconds).toBe(45 * 60);
      expect(state.endAt).not.toBeNull();
      expect(state.completedCount).toBe(0);
      expect(state.phase).toBe('work');
    });
  });

  // ── updatePreset（编辑预设：活动预设计时空闲时同步刷新时长）─────────────────

  describe('updatePreset — 编辑活动预设', () => {
    it('计时空闲时编辑活动预设应刷新当前阶段时长（表盘立即反映新时长）', async () => {
      usePomodoroStore.setState({ activePreset: STUDY_PRESET, remainingSeconds: 25 * 60, totalSeconds: 25 * 60 });
      await usePomodoroStore.getState().updatePreset('preset-study', { workDuration: 30 });
      const state = usePomodoroStore.getState();
      expect(state.activePreset?.workDuration).toBe(30);
      expect(state.remainingSeconds).toBe(30 * 60);
      expect(state.totalSeconds).toBe(30 * 60);
    });

    it('编辑非活动预设不应触碰当前计时时长', async () => {
      usePomodoroStore.setState({ activePreset: STUDY_PRESET, remainingSeconds: 25 * 60, totalSeconds: 25 * 60 });
      await usePomodoroStore.getState().updatePreset('preset-class', { workDuration: 40 });
      expect(usePomodoroStore.getState().remainingSeconds).toBe(25 * 60);
    });

    it('运行/暂停中编辑活动预设不打断计时，阶段完成后才按新时长生效', async () => {
      usePomodoroStore.setState({
        activePreset: STUDY_PRESET, isRunning: true,
        remainingSeconds: 600, totalSeconds: 25 * 60,
      });
      await usePomodoroStore.getState().updatePreset('preset-study', { workDuration: 30 });
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(600);
      expect(state.totalSeconds).toBe(25 * 60);
      expect(state.isRunning).toBe(true);
    });

    it('编辑 silent 字段应同步派生 mode（class/self_study 兼容层一致）', async () => {
      usePomodoroStore.setState({ activePreset: STUDY_PRESET });
      await usePomodoroStore.getState().updatePreset('preset-study', { silent: true });
      expect(usePomodoroStore.getState().mode).toBe('class');
    });
  });

  // ── deletePreset（删除活动预设：空闲开启新周期，运行中不打断）────────────────

  describe('deletePreset — 删除活动预设', () => {
    it('计时空闲时删除活动预设应回退第一个并重置新周期时长', async () => {
      usePomodoroStore.setState({
        presets: [CLASS_PRESET, STUDY_PRESET],
        activePreset: STUDY_PRESET,
        phase: 'short_break',
        remainingSeconds: 5 * 60, totalSeconds: 5 * 60,
        completedCount: 2,
      });
      await usePomodoroStore.getState().deletePreset('preset-study');
      const state = usePomodoroStore.getState();
      expect(state.activePreset?.id).toBe('preset-class');
      expect(state.phase).toBe('work');
      expect(state.completedCount).toBe(0);
      // 回退预设 work 时长（45min 上课）同步到表盘
      expect(state.remainingSeconds).toBe(45 * 60);
      expect(state.totalSeconds).toBe(45 * 60);
    });

    it('运行中删除活动预设不应打断当前计时（回退预设仅生效于下一阶段）', async () => {
      usePomodoroStore.setState({
        presets: [CLASS_PRESET, STUDY_PRESET],
        activePreset: STUDY_PRESET,
        isRunning: true,
        phase: 'work',
        remainingSeconds: 600, totalSeconds: 25 * 60,
        endAt: Date.now() + 600 * 1000,
        completedCount: 1,
      });
      await usePomodoroStore.getState().deletePreset('preset-study');
      const state = usePomodoroStore.getState();
      expect(state.activePreset?.id).toBe('preset-class');
      // 当前阶段不被重置：剩余秒数/阶段/计数/运行状态原样保留
      expect(state.remainingSeconds).toBe(600);
      expect(state.phase).toBe('work');
      expect(state.completedCount).toBe(1);
      expect(state.isRunning).toBe(true);
    });
  });

  // ── tick 墙钟锚点路径（准点完成：锚点未归零不提前完成）─────────────────────

  describe('tick — 墙钟锚点准点完成', () => {
    it('remaining=1 且墙钟未归零时吸附等待，不提前完成阶段', () => {
      // 递减模型已到 1，但墙钟还剩约 2s：应吸附到 2 而非直接完成
      usePomodoroStore.setState({
        isRunning: true,
        phase: 'work',
        remainingSeconds: 1,
        endAt: Date.now() + 2000,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.remainingSeconds).toBe(2);
    });

    it('remaining=1 且墙钟已归零时立即完成阶段', () => {
      usePomodoroStore.setState({
        isRunning: true,
        phase: 'work',
        remainingSeconds: 1,
        endAt: Date.now() - 100, // 已过期
        completedCount: 0,
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('short_break');
      expect(state.completedCount).toBe(1);
    });
  });

  // ── isArmed — Chronos 激活状态（沉睡↔呼吸）──────────────────────────────

  describe('isArmed — Chronos 激活状态', () => {
    it('awaken() 应沉睡→呼吸（isArmed=true）且启动 30s 倒计时', () => {
      usePomodoroStore.getState().awaken();
      const state = usePomodoroStore.getState();
      expect(state.isArmed).toBe(true);
      expect(state.isRunning).toBe(true);
      expect(state.remainingSeconds).toBe(30);
    });

    it('reset() 应清除激活标记回沉睡', () => {
      usePomodoroStore.setState({ isArmed: true });
      usePomodoroStore.getState().reset();
      expect(usePomodoroStore.getState().isArmed).toBe(false);
    });

    it('start() 应进入激活态', () => {
      usePomodoroStore.getState().start();
      expect(usePomodoroStore.getState().isArmed).toBe(true);
    });

    it('skip() 应保持激活态（仍在流中）', () => {
      usePomodoroStore.setState({ isArmed: true, phase: 'work' });
      usePomodoroStore.getState().skip();
      expect(usePomodoroStore.getState().isArmed).toBe(true);
    });
  });

  // ── startStepDive — 呼吸态 1 分钟迈步 ──────────────────────────────

  describe('startStepDive — 1 分钟迈步', () => {
    it('应启动 30 秒会话并进入激活态（保留已有 currentGoal，不做覆盖）', () => {
      usePomodoroStore.setState({ currentGoal: '用户输入的目标' });
      usePomodoroStore.getState().startStepDive();
      const state = usePomodoroStore.getState();
      expect(state.isRunning).toBe(true);
      expect(state.remainingSeconds).toBe(30);
      expect(state.totalSeconds).toBe(30);
      expect(state.isArmed).toBe(true);
      expect(state.isMiniDive).toBe(true); // 复用迷你会话记录链路
      expect(state.currentGoal).toBe('用户输入的目标'); // 目标弹窗输入的内容不被覆盖
    });

    it('迈步完成应无缝衔接完整专注（不进入休息，按预设时长继续）', () => {
      usePomodoroStore.setState({ phase: 'work', remainingSeconds: 1, isRunning: true, endAt: Date.now() - 1, isStepDive: true });
      usePomodoroStore.getState().tick(); // 1 分钟迈步完成
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work'); // 无缝衔接完整专注
      expect(state.isRunning).toBe(true); // 强制自动开始
      expect(state.remainingSeconds).toBe(25 * 60); // 预设 workDuration（自习 25min）
      expect(state.totalSeconds).toBe(25 * 60);
      expect(state.stepCompleted).toBe(true);
      expect(state.isStepDive).toBe(false);
      expect(state.showCompletionOverlay).toBe(false); // 迈步完成不弹庆祝层（不打断）
    });

    it('reset 应清除迈步状态与激活标记（回沉睡）', () => {
      usePomodoroStore.setState({ isArmed: true, stepCompleted: true, isStepDive: true });
      usePomodoroStore.getState().reset();
      const state = usePomodoroStore.getState();
      expect(state.stepCompleted).toBe(false);
      expect(state.isStepDive).toBe(false);
      expect(state.isArmed).toBe(false);
    });
  });

  // ── startBreathingDive — 专注→呼吸缓解 ──────────────────────────

  describe('startBreathingDive — 专注→呼吸缓解', () => {
    it('应保存原专注剩余时间并启动 30s 呼吸态', () => {
      usePomodoroStore.setState({ phase: 'work', remainingSeconds: 1200, totalSeconds: 1500, isRunning: true });
      usePomodoroStore.getState().startBreathingDive();
      const state = usePomodoroStore.getState();
      expect(state.isRunning).toBe(true);
      expect(state.remainingSeconds).toBe(30);
      expect(state.totalSeconds).toBe(30);
      expect(state.isStepDive).toBe(true);
      expect(state._breathingResumeRemaining).toBe(1200); // 保存原剩余时间
      expect(state._breathingResumeTotal).toBe(1500);
    });

    it('呼吸缓解完成应恢复原专注剩余时间且不增加计数', () => {
      usePomodoroStore.setState({
        phase: 'work', remainingSeconds: 1, totalSeconds: 30, isRunning: true,
        endAt: Date.now() - 1, isStepDive: true, completedCount: 2,
        _breathingResumeRemaining: 1200, _breathingResumeTotal: 1500,
      });
      usePomodoroStore.getState().tick(); // 呼吸缓解完成
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.remainingSeconds).toBe(1200); // 恢复原剩余
      expect(state.totalSeconds).toBe(1500); // 恢复原总时长（progress 不重置）
      expect(state.isRunning).toBe(true); // 自动恢复专注
      expect(state.completedCount).toBe(2); // 不增加计数
      expect(state._breathingResumeRemaining).toBeNull(); // 清空保存字段
      expect(state.lastAction).toBe('breathing_resume'); // 不发 phase_complete
      expect(state.showCompletionOverlay).toBe(false); // 不弹庆祝层
    });

    it('skipBreathingDive 在呼吸缓解中应恢复原专注', () => {
      usePomodoroStore.setState({
        phase: 'work', remainingSeconds: 15, totalSeconds: 30, isRunning: true,
        isStepDive: true, _breathingResumeRemaining: 900, _breathingResumeTotal: 1500,
      });
      usePomodoroStore.getState().skipBreathingDive();
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(900); // 恢复原剩余
      expect(state.totalSeconds).toBe(1500);
      expect(state.isRunning).toBe(true);
      expect(state.isStepDive).toBe(false);
      expect(state._breathingResumeRemaining).toBeNull();
    });

    it('skipBreathingDive 在迈步中应跳过仪式直接完整专注', () => {
      usePomodoroStore.setState({
        phase: 'work', remainingSeconds: 20, totalSeconds: 30, isRunning: true,
        isStepDive: true, _breathingResumeRemaining: null, _breathingResumeTotal: null,
      });
      usePomodoroStore.getState().skipBreathingDive();
      const state = usePomodoroStore.getState();
      expect(state.remainingSeconds).toBe(25 * 60); // 直接完整专注（预设 workDuration）
      expect(state.totalSeconds).toBe(25 * 60);
      expect(state.isRunning).toBe(true);
      expect(state.isStepDive).toBe(false);
    });
  });

  // ── isColdStart — 冷启动判定（沉睡点击行为分流）────────────────────

  describe('isColdStart — 冷启动判定', () => {
    it('无活动记录视为冷启动（需呼吸仪式）', () => {
      expect(isColdStart(null)).toBe(true);
    });

    it('距上次活动超过 24h 视为冷启动', () => {
      expect(isColdStart(Date.now() - 25 * 60 * 60 * 1000)).toBe(true);
    });

    it('距上次活动 1 小时内为热启动（直接迈步）', () => {
      expect(isColdStart(Date.now() - 60 * 60 * 1000)).toBe(false);
    });
  });

  // ── 静默预设音效（BUG-005 语义完整化）─────────────────────────

  describe('silent preset 音效', () => {
    it('静默预设下 start/pause 不播放启停音效', () => {
      usePomodoroStore.setState({ activePreset: CLASS_PRESET });
      usePomodoroStore.getState().start();
      usePomodoroStore.getState().pause();
      expect(soundPlayer.play).not.toHaveBeenCalled();
    });

    it('非静默预设下 start 播放启动音效', () => {
      usePomodoroStore.setState({ activePreset: STUDY_PRESET });
      usePomodoroStore.getState().start();
      expect(soundPlayer.play).toHaveBeenCalledWith('pomodoro_start');
    });
  });

  // ── abortSession（中断记录）────────────────────────────────────

  describe('abortSession — 中断记录', () => {
    it('投入 ≥30s 时落库 interrupted 记录（含实际时长与目标）', () => {
      usePomodoroStore.setState({
        phase: 'work', isRunning: true,
        sessionStartTime: Date.now() - 5 * 60 * 1000,
        totalPausedMs: 0, currentGoal: '背单词',
        activePreset: STUDY_PRESET,
      });
      usePomodoroStore.getState().abortSession();
      expect(recordSession).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(recordSession).mock.calls[0][0];
      expect(arg.interrupted).toBe(true);
      expect(arg.goal).toBe('背单词');
      expect(arg.actualDuration).toBe(300);
      expect(arg.presetId).toBe('preset-study');
    });

    it('投入 <30s 不落库（视为误触）', () => {
      usePomodoroStore.setState({
        phase: 'work', sessionStartTime: Date.now() - 10 * 1000, totalPausedMs: 0,
      });
      usePomodoroStore.getState().abortSession();
      expect(recordSession).not.toHaveBeenCalled();
    });

    it('休息阶段不落库', () => {
      usePomodoroStore.setState({ phase: 'short_break', sessionStartTime: Date.now() - 5 * 60 * 1000 });
      usePomodoroStore.getState().abortSession();
      expect(recordSession).not.toHaveBeenCalled();
    });

    it('reset 应清零周期计数并落库中断记录', () => {
      usePomodoroStore.setState({
        phase: 'work', isRunning: true, completedCount: 3,
        sessionStartTime: Date.now() - 5 * 60 * 1000, totalPausedMs: 0,
      });
      usePomodoroStore.getState().reset();
      const state = usePomodoroStore.getState();
      expect(state.completedCount).toBe(0);
      expect(recordSession).toHaveBeenCalledTimes(1);
    });

    it('skip work 阶段落库中断记录且计入周期计数（+1）', () => {
      usePomodoroStore.setState({
        phase: 'work', completedCount: 2,
        sessionStartTime: Date.now() - 5 * 60 * 1000, totalPausedMs: 0,
      });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('short_break');
      expect(state.completedCount).toBe(3); // 跳过也计入长休周期计数
      expect(recordSession).toHaveBeenCalledTimes(1);
    });
  });

  // ── 墙钟校准完成分支（BUG：autoStart 关闭时阶段被吞）────────────

  describe('墙钟校准完成分支', () => {
    it('校准完成应设置完整阶段时长（修复原实现 remainingSeconds=0 吞掉休息）', () => {
      usePomodoroStore.setState({
        isRunning: true, phase: 'short_break', remainingSeconds: 5,
        endAt: Date.now() - 1000,
        settings: { ...DEFAULT_SETTINGS, autoStartWork: false, autoStartBreak: true },
      });
      usePomodoroStore.getState().tick();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.remainingSeconds).toBe(25 * 60);
      expect(state.isRunning).toBe(false);
    });
  });

  // ── updateSettings 输入钳制 ───────────────────────────────────

  describe('updateSettings 输入钳制', () => {
    it('拒绝 0 分钟时长（防止 0 秒番茄）', () => {
      usePomodoroStore.setState({ activePreset: null, settings: DEFAULT_SETTINGS });
      usePomodoroStore.getState().updateSettings({ workDuration: 0 });
      expect(usePomodoroStore.getState().settings.workDuration).toBe(25);
    });

    it('长休间隔 0 合法（无长休语义）', () => {
      usePomodoroStore.setState({ activePreset: null, settings: DEFAULT_SETTINGS });
      usePomodoroStore.getState().updateSettings({ longBreakInterval: 0 });
      expect(usePomodoroStore.getState().settings.longBreakInterval).toBe(0);
    });
  });
});
