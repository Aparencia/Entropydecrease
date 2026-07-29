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
}));

import { usePomodoroStore } from './usePomodoroStore';
import { recordSession, playCompletionSound } from './usePomodoroPersistence';

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
  remainingSeconds: 25 * 60,
  totalSeconds: 25 * 60,
  completedCount: 0,
  mode: 'self_study' as const,
  settings: DEFAULT_SETTINGS,
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
    it('should skip to next phase and increment completedCount for work', () => {
      usePomodoroStore.setState({ phase: 'work', completedCount: 0 });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('short_break');
      expect(state.completedCount).toBe(1);
      expect(state.isRunning).toBe(false);
    });

    it('should skip break without incrementing completedCount', () => {
      usePomodoroStore.setState({ phase: 'short_break', completedCount: 1 });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('work');
      expect(state.completedCount).toBe(1); // unchanged
    });

    it('should skip to long_break after 4th work phase', () => {
      usePomodoroStore.setState({ phase: 'work', completedCount: 3 });
      usePomodoroStore.getState().skip();
      const state = usePomodoroStore.getState();
      expect(state.phase).toBe('long_break');
      expect(state.completedCount).toBe(4);
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
    it('should merge settings and update timer when not running', () => {
      usePomodoroStore.getState().updateSettings({ workDuration: 30 });
      const state = usePomodoroStore.getState();
      expect(state.settings.workDuration).toBe(30);
      expect(state.remainingSeconds).toBe(30 * 60);
      expect(state.totalSeconds).toBe(30 * 60);
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
      usePomodoroStore.setState({ remainingSeconds: 1, isRunning: true });
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
      const interval = DEFAULT_SETTINGS.longBreakInterval; // 4
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

  // ── setMode ───────────────────────────────────────────────

  describe('setMode', () => {
    it('should switch mode', () => {
      usePomodoroStore.getState().setMode('class');
      expect(usePomodoroStore.getState().mode).toBe('class');
    });
  });
});
