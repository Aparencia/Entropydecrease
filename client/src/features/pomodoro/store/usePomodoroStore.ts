/**
 * @ai-context: pomodoro 功能模块状态管理：usePomodoroStore。
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { loadSettings, saveSettings, recordSession, playCompletionSound, sendNotification } from './usePomodoroPersistence';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

type Phase = 'work' | 'short_break' | 'long_break';
type Mode = 'class' | 'self_study';

/** 番茄钟动作信号类型（供 usePomodoroEffects 监听） */
export type PomodoroAction =
  | 'start'
  | 'pause'
  | 'exit_immersive'
  | 'tick_5min_warning'
  | 'tick_final'
  | 'phase_complete'
  | null;

interface PomodoroSettings {
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
  autoStartBreak: boolean;
  autoStartWork: boolean;
  soundEnabled: boolean;
  notificationEnabled: boolean;
  classDuration: number;
}

interface PomodoroState {
  phase: Phase;
  isRunning: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  completedCount: number;
  mode: Mode;
  settings: PomodoroSettings;
  /** 当前工作会话开始时间戳（ms），用于计算 actualDuration */
  sessionStartTime: number | null;
  /** 当前番茄目标文字 */
  currentGoal: string | null;
  /** 首潜迷你会话标记：3 分钟体验潜水，会话时长按实际记录而非 settings 时长 */
  isMiniDive: boolean;
  /** 是否处于沉浸专注模式 */
  isImmersive: boolean;
  /** 退出沉浸后标记，用于 resume 时自动重入 */
  wasImmersive: boolean;
  /** AI 推荐的工作时长（分钟） */
  aiRecommendedDuration?: number;
  /** AI 推荐理由文本 */
  aiReasoning?: string;

  /** 动作信号（供 usePomodoroEffects 消费） */
  lastAction: PomodoroAction;
  lastActionCounter: number;
  /** phase_complete 时附带的已完成阶段 */
  lastCompletedPhase: Phase | null;
  /** phase_complete 时是否完成整轮 */
  isCycleComplete: boolean;
  /** phase_complete 时实际持续秒数 */
  lastSessionActualDuration: number | null;

  start: () => void;
  /** 开始首潜 3 分钟迷你体验（新手引导专用，不改动用户设置） */
  startMiniDive: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  setMode: (mode: Mode) => void;
  setCurrentGoal: (goal: string | null) => void;
  enterImmersive: () => void;
  exitImmersive: () => void;
  tick: () => void;
  updateSettings: (settings: Partial<PomodoroSettings>) => void;
  /** 设置 AI 推荐结果 */
  setAIRecommendation: (duration: number, reasoning: string) => void;
  initialize: () => Promise<void>;
}

const getPhaseDuration = (phase: Phase, settings: PomodoroSettings, mode?: Mode): number => {
  switch (phase) {
    case 'work':
      return (mode === 'class' ? settings.classDuration : settings.workDuration) * 60;
    case 'short_break':
      return settings.shortBreakDuration * 60;
    case 'long_break':
      return settings.longBreakDuration * 60;
  }
};

/** 首潜迷你体验时长（3 分钟），见新手引导系统 */
export const MINI_DIVE_SECONDS = 180;

const getNextPhase = (
  currentPhase: Phase,
  completedCount: number,
  longBreakInterval: number,
  mode?: Mode,
): Phase => {
  if (currentPhase === 'work') {
    // 上课模式始终短休，不进入长休
    if (mode === 'class') return 'short_break';
    return (completedCount + 1) % longBreakInterval === 0
      ? 'long_break'
      : 'short_break';
  }
  return 'work';
};

/**
 * 计算阶段结束后的完成计数：
 * - 长休结束 → 归零（一轮完成）
 * - 工作结束 → +1；上课模式无长休，计数达到周期上限后回绕，避免无限累加
 * - 其他阶段 → 不变
 */
const getNextCount = (
  phase: Phase,
  completedCount: number,
  longBreakInterval: number,
  mode?: Mode,
): number => {
  if (phase === 'long_break') return 0;
  if (phase !== 'work') return completedCount;
  if (mode === 'class') return (completedCount % longBreakInterval) + 1;
  return completedCount + 1;
};

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  const defaultSettings: PomodoroSettings = {
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

  return {
    phase: 'work',
    isRunning: false,
    isPaused: false,
    remainingSeconds: defaultSettings.workDuration * 60,
    totalSeconds: defaultSettings.workDuration * 60,
    completedCount: 0,
    mode: 'self_study',
    settings: defaultSettings,
    sessionStartTime: null,
    currentGoal: null,
    isMiniDive: false,
    isImmersive: false,
    wasImmersive: false,
    aiRecommendedDuration: undefined,
    aiReasoning: undefined,
    lastAction: null,
    lastActionCounter: 0,
    lastCompletedPhase: null,
    isCycleComplete: false,
    lastSessionActualDuration: null,

    initialize: async () => {
      const saved = await loadSettings();
      if (saved) {
        // 兼容旧数据：若缺少 classDuration，补上默认值
        const merged = { ...defaultSettings, ...saved };
        const phase = get().phase;
        const mode = get().mode;
        const duration = getPhaseDuration(phase, merged, mode);
        set({
          settings: merged,
          remainingSeconds: get().isRunning || get().isPaused ? get().remainingSeconds : duration,
          totalSeconds: get().isRunning || get().isPaused ? get().totalSeconds : duration,
        });
        // 如果启用了通知，主动请求权限
        if (merged.notificationEnabled && 'Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      }
    },

    start: () => {
      set((s) => ({
        isRunning: true, isPaused: false, sessionStartTime: Date.now(),
        lastAction: 'start' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
      }));
      soundPlayer.play('pomodoro_start');
    },

    startMiniDive: () => {
      // 3 分钟真实专注：走完整 tick 链路（记会话/触发成就），duration 按 180s 如实记录
      set((s) => ({
        mode: 'self_study', phase: 'work',
        remainingSeconds: MINI_DIVE_SECONDS, totalSeconds: MINI_DIVE_SECONDS,
        isMiniDive: true, isRunning: true, isPaused: false,
        sessionStartTime: Date.now(), currentGoal: '首潜 · 3 分钟体验',
        lastAction: 'start' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
      }));
      soundPlayer.play('pomodoro_start');
    },

    pause: () => {
      set((s) => ({
        isRunning: false, isPaused: true,
        lastAction: 'pause' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
      }));
      soundPlayer.play('pomodoro_pause');
    },

    resume: () => {
      const { sessionStartTime, wasImmersive } = get();
      set({
        isRunning: true,
        isPaused: false,
        // 如果 sessionStartTime 为空（重置后），重新记录
        sessionStartTime: sessionStartTime ?? Date.now(),
        // 若上次是从沉浸模式退出的，自动重新进入沉浸
        isImmersive: wasImmersive ? true : get().isImmersive,
        wasImmersive: false,
      });
    },

    reset: () => {
      const { phase, settings, mode } = get();
      const duration = getPhaseDuration(phase, settings, mode);
      set({
        remainingSeconds: duration,
        totalSeconds: duration,
        isRunning: false,
        isPaused: false,
        sessionStartTime: null,
        wasImmersive: false,
        isMiniDive: false,
      });
    },

    skip: () => {
      const { phase, completedCount, settings, mode } = get();
      const newCount = getNextCount(phase, completedCount, settings.longBreakInterval, mode);
      const nextPhase = getNextPhase(phase, completedCount, settings.longBreakInterval, mode);
      const duration = getPhaseDuration(nextPhase, settings, mode);
      set({
        phase: nextPhase,
        remainingSeconds: duration,
        totalSeconds: duration,
        completedCount: newCount,
        isRunning: false,
        isPaused: false,
        isMiniDive: false,
      });
    },

    setMode: (mode) => {
      const { settings, phase, isRunning, isPaused, mode: prevMode } = get();
      if (mode === prevMode) return;
      // 切换模式 = 开启新周期：计数归零，避免跨模式累计（自习首轮跳到 8 的根因）
      set({ mode, completedCount: 0 });
      // 切换模式后，若计时器未运行，重置当前阶段时长
      if (!isRunning && !isPaused) {
        const duration = getPhaseDuration(phase, settings, mode);
        set({ remainingSeconds: duration, totalSeconds: duration });
      }
    },

    setCurrentGoal: (goal) => set({ currentGoal: goal }),

    setAIRecommendation: (duration, reasoning) =>
      set({ aiRecommendedDuration: duration, aiReasoning: reasoning }),

    enterImmersive: () => set({ isImmersive: true }),
    exitImmersive: () => {
      const { isRunning } = get();
      // 退出沉浸时自动暂停计时器（不等于结束专注）
      if (isRunning) {
        soundPlayer.play('pomodoro_pause');
      }
      set((s) => ({
        isImmersive: false, wasImmersive: true, isRunning: false, isPaused: true,
        lastAction: 'exit_immersive' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
      }));
    },

    tick: () => {
      const { remainingSeconds, isRunning, phase, completedCount, settings, mode } = get();
      if (!isRunning) return;

      if (remainingSeconds <= 1) {
        // Phase completed
        const wasRunning = isRunning;
        const newCount = getNextCount(phase, completedCount, settings.longBreakInterval, mode);
        const nextPhase = getNextPhase(phase, completedCount, settings.longBreakInterval, mode);
        const duration = getPhaseDuration(nextPhase, settings, mode);
        const isCycleComplete = phase === 'long_break';

        // Determine auto-start behavior
        let shouldAutoStart = false;
        if (nextPhase !== 'work' && settings.autoStartBreak) {
          shouldAutoStart = true;
        } else if (nextPhase === 'work' && settings.autoStartWork) {
          shouldAutoStart = true;
        }
        // Breaks always auto-start if timer was running
        if (nextPhase !== 'work' && wasRunning) {
          shouldAutoStart = true;
        }

        // 记录完成的番茄会话
        let actualDuration: number | null = null;
        if (phase === 'work') {
          const { sessionStartTime: sst, isMiniDive } = get();
          // 迷你潜水按实际 180s 记录，避免污染效率统计（首潜决策：计入成就）
          const plannedSeconds = isMiniDive
            ? MINI_DIVE_SECONDS
            : (mode === 'class' ? settings.classDuration : settings.workDuration) * 60;
          actualDuration = sst
            ? Math.round((Date.now() - sst) / 1000)
            : plannedSeconds;
          recordSession({
            mode: get().mode,
            duration: plannedSeconds,
            actualDuration,
            completedAt: new Date(),
            interrupted: false,
            goal: get().currentGoal ?? undefined,
          }).then(() => {
            // 触发成就检查（动态 import 避免循环依赖）
            import('@/lib/achievements/evaluator').then(({ checkAchievements }) => {
              checkAchievements({ type: 'pomodoro_completed' }).then((unlocked) => {
                unlocked.forEach(a => {
                  window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: a }));
                });
              });
            }).catch(() => {});
          }).catch(() => {});
        }
        // BUG-005 fix: 上课模式（静默模式）跳过所有提示音播放
        if (mode !== 'class') {
          // 播放提示音
          if (settings.soundEnabled) {
            playCompletionSound();
          }
          // 播放阶段完成音效
          if (phase === 'work') {
            soundPlayer.play('pomodoro_work_complete');
          } else {
            soundPlayer.play('pomodoro_break_end');
            // 长休结束 = 一整轮完成
            if (phase === 'long_break') {
              soundPlayer.play('pomodoro_complete');
            }
          }
        }
        // 发送浏览器通知
        if (settings.notificationEnabled) {
          if (phase === 'work') {
            sendNotification('又添了一段暖意', '继续深潜吧 ☕').catch(() => {});
          } else {
            sendNotification('休息结束！', '开始下一个番茄 🍅').catch(() => {});
          }
        }

        set((s) => ({
          phase: nextPhase,
          remainingSeconds: duration,
          totalSeconds: duration,
          completedCount: newCount,
          isRunning: shouldAutoStart,
          isPaused: !shouldAutoStart,
          // 迷你潜水仅限一个工作阶段，阶段切换即恢复常规节律
          isMiniDive: false,
          // 切换到新阶段时清空计时，下一个 start/resume 会重新设置
          sessionStartTime: null,
          // 发出 phase_complete 动作信号
          lastAction: 'phase_complete' as PomodoroAction,
          lastActionCounter: s.lastActionCounter + 1,
          lastCompletedPhase: phase,
          isCycleComplete,
          lastSessionActualDuration: actualDuration,
        }));
      } else {
        const nextRemaining = remainingSeconds - 1;
        // BUG-005 fix: 上课模式跳过预警和滴答音
        if (mode !== 'class') {
          // 5 分钟预警（工作阶段）
          if (phase === 'work' && nextRemaining === 300) {
            soundPlayer.play('pomodoro_5min_warning');
            set((s) => ({
              lastAction: 'tick_5min_warning' as PomodoroAction,
              lastActionCounter: s.lastActionCounter + 1,
            }));
          }
          // 最后 10 秒滴答
          if (phase === 'work' && nextRemaining <= 10 && nextRemaining > 0) {
            soundPlayer.play('pomodoro_tick_final');
            set((s) => ({
              lastAction: 'tick_final' as PomodoroAction,
              lastActionCounter: s.lastActionCounter + 1,
            }));
          }
        }
        set({ remainingSeconds: nextRemaining });
      }
    },

    updateSettings: (newSettings) => {
      const { settings, phase, isRunning, isPaused, mode } = get();
      const merged = { ...settings, ...newSettings };

      // If not running, update timer to reflect new duration
      if (!isRunning && !isPaused) {
        const duration = getPhaseDuration(phase, merged, mode);
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
  };
});

// ---------------------------------------------------------------------------
// 选择器 Hooks — 避免整 store 订阅导致不必要的重渲染
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

/** 仅订阅模式 */
export const usePomodoroMode = () =>
  usePomodoroStore(s => s.mode);

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
