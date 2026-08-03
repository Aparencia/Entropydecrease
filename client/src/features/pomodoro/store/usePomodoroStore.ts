/**
 * @ai-context: pomodoro 功能模块状态管理：usePomodoroStore。
 * v0.28 重构：mode('class'|'self_study') 泛化为 preset 驱动，
 * longBreakInterval=0 统一表达“无长休”，消除 mode==='class' 特判。
 * 预设 CRUD 委托给 ../lib/presetService.ts，本文件仅保留计时器状态机。
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { loadSettings, saveSettings, recordSession, playCompletionSound, sendNotification } from './usePomodoroPersistence';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { assistantEventBus } from '@/features/assistant/lib/eventBus';
import type { PomodoroPreset } from '@/types/models';
import {
  getAllPresets, getPresetById, createPreset as svcCreatePreset,
  updatePreset as svcUpdatePreset, deletePreset as svcDeletePreset,
  reorderPresets as svcReorderPresets, seedBuiltinPresets,
} from '../lib/presetService';

type Phase = 'work' | 'short_break' | 'long_break';
/** @deprecated 仅为兼容旧会话记录保留，新代码使用 preset */
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
  // v0.28 扩展
  activePresetId?: string;
  warningMinutes?: number;
  tickFinalEnabled?: boolean;
  completionSoundId?: string;
  warningSoundId?: string;
}

interface PomodoroState {
  phase: Phase;
  isRunning: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  /** 当前运行阶段的绝对截止时间戳（ms）——墙钟校准源，休眠唤醒/计时漂移后自愈 */
  endAt: number | null;
  completedCount: number;
  /** @deprecated 兼容层：由 activePreset 派生，下版本移除 */
  mode: Mode;
  settings: PomodoroSettings;
  // ── v0.28 预设系统 ──
  presets: PomodoroPreset[];
  activePreset: PomodoroPreset | null;
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

  /** v0.29: 深潜完成庆祝覆盖层可见性 */
  showCompletionOverlay: boolean;
  /** v0.29: 关闭完成庆祝 */
  dismissCompletionOverlay: () => void;

  start: () => void;
  /** 开始首潜 3 分钟迷你体验（新手引导专用，不改动用户设置） */
  startMiniDive: () => void;
  /** T3: 开始 5 分钟承诺深潜（拖延重启专用，最小承诺降低启动门槛） */
  startCommitDive: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  /** @deprecated 使用 setPreset 替代 */
  setMode: (mode: Mode) => void;
  setPreset: (presetId: string) => void;
  setCurrentGoal: (goal: string | null) => void;
  enterImmersive: () => void;
  exitImmersive: () => void;
  tick: () => void;
  updateSettings: (settings: Partial<PomodoroSettings>) => void;
  /** 设置 AI 推荐结果 */
  setAIRecommendation: (duration: number, reasoning: string) => void;
  initialize: () => Promise<void>;
  // ── 预设 CRUD ──
  createPreset: (data: Omit<PomodoroPreset, 'id' | 'sortOrder' | 'createdAt' | 'builtin'>) => Promise<PomodoroPreset>;
  updatePreset: (id: string, changes: Partial<Omit<PomodoroPreset, 'id' | 'builtin'>>) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  reorderPresets: (orderedIds: string[]) => Promise<void>;
}

/** 根据预设获取阶段时长（秒） */
const getPhaseDuration = (phase: Phase, preset: PomodoroPreset | null, settings: PomodoroSettings): number => {
  if (!preset) {
    // 回退到旧 settings（初始化前）
    switch (phase) {
      case 'work': return settings.workDuration * 60;
      case 'short_break': return settings.shortBreakDuration * 60;
      case 'long_break': return settings.longBreakDuration * 60;
    }
  }
  switch (phase) {
    case 'work': return preset.workDuration * 60;
    case 'short_break': return preset.shortBreakDuration * 60;
    case 'long_break': return preset.longBreakDuration * 60;
  }
};

/** 首潜迷你体验时长（3 分钟），见新手引导系统 */
export const MINI_DIVE_SECONDS = 180;

/** T3 5 分钟承诺深潜时长（拖延情绪调节：不要求完美，只要求开始） */
export const COMMIT_DIVE_SECONDS = 300;

/** 获取预设的有效 longBreakInterval（0 = 无长休） */
const getInterval = (preset: PomodoroPreset | null, settings: PomodoroSettings): number =>
  preset ? preset.longBreakInterval : settings.longBreakInterval;

const getNextPhase = (
  currentPhase: Phase,
  completedCount: number,
  longBreakInterval: number,
): Phase => {
  if (currentPhase === 'work') {
    // longBreakInterval=0 表示无长休（原上课模式），始终短休
    if (longBreakInterval === 0) return 'short_break';
    return (completedCount + 1) % longBreakInterval === 0
      ? 'long_break'
      : 'short_break';
  }
  return 'work';
};

/**
 * 计算阶段结束后的完成计数：
 * - 长休结束 → 归零（一轮完成）
 * - 工作结束 → +1；无长休模式计数达到周期上限后回绕，避免无限累加
 * - 其他阶段 → 不变
 */
const getNextCount = (
  phase: Phase,
  completedCount: number,
  longBreakInterval: number,
): number => {
  if (phase === 'long_break') return 0;
  if (phase !== 'work') return completedCount;
  // 无长休模式：回绕计数（用固定 4 作为显示上限）
  if (longBreakInterval === 0) return (completedCount % 4) + 1;
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
    endAt: null,
    completedCount: 0,
    mode: 'self_study',
    settings: defaultSettings,
    presets: [],
    activePreset: null,
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
    showCompletionOverlay: false,

    initialize: async () => {
      const saved = await loadSettings();
      const merged = saved ? { ...defaultSettings, ...saved } : defaultSettings;

      // 种子化预设（首次启动时创建内置预设）
      const presets = await seedBuiltinPresets(merged as Parameters<typeof seedBuiltinPresets>[0]);

      // 恢复上次选中的预设
      let activePreset: PomodoroPreset | null = null;
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
        lastAction: 'start' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
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
        lastAction: 'start' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
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
        lastAction: 'start' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
      }));
      soundPlayer.play('pomodoro_start');
    },

    pause: () => {
      set((s) => ({
        isRunning: false, isPaused: true, endAt: null,
        lastAction: 'pause' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
      }));
      soundPlayer.play('pomodoro_pause');
    },

    resume: () => {
      const { sessionStartTime, wasImmersive } = get();
      set((s) => ({
        isRunning: true,
        isPaused: false,
        // 恢复运行重设墙钟截止点（暂停期间时间不计入）
        endAt: Date.now() + s.remainingSeconds * 1000,
        // 如果 sessionStartTime 为空（重置后），重新记录
        sessionStartTime: sessionStartTime ?? Date.now(),
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
      });
    },

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

    dismissCompletionOverlay: () => set({ showCompletionOverlay: false }),

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
        isImmersive: false, wasImmersive: true, isRunning: false, isPaused: true, endAt: null,
        lastAction: 'exit_immersive' as PomodoroAction, lastActionCounter: s.lastActionCounter + 1,
      }));
    },

    tick: () => {
      const { remainingSeconds, isRunning, phase, completedCount, settings, activePreset } = get();
      if (!isRunning) return;
      const interval = getInterval(activePreset, settings);
      const isSilent = activePreset?.silent ?? false;

      if (remainingSeconds <= 1) {
        // Phase completed
        const wasRunning = isRunning;
        const newCount = getNextCount(phase, completedCount, interval);
        const nextPhase = getNextPhase(phase, completedCount, interval);
        const duration = getPhaseDuration(nextPhase, activePreset, settings);
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
            : (activePreset?.workDuration ?? settings.workDuration) * 60;
          actualDuration = sst
            ? Math.round((Date.now() - sst) / 1000)
            : plannedSeconds;
          recordSession({
            mode: activePreset?.silent ? 'class' : 'self_study',
            presetId: activePreset?.id,
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

          // @ai-context: 发射 session:end 事件——驱动 AI 学伴主动触发（专注结束关怀）
          assistantEventBus.emit('session:end', {
            currentHour: new Date().getHours(),
            sessionMinutes: Math.round((actualDuration ?? plannedSeconds) / 60),
          });
        }
        // 静默预设跳过所有提示音播放（继承 BUG-005 语义）
        if (!isSilent) {
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
          // 自动进入下一阶段时重设墙钟截止点；否则清空等待下次 start/resume
          endAt: shouldAutoStart ? Date.now() + duration * 1000 : null,
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
          // v0.29: 工作阶段完成时触发庆祝覆盖层
          showCompletionOverlay: phase === 'work' ? true : s.showCompletionOverlay,
        }));
      } else {
        let nextRemaining = remainingSeconds - 1;
        // 墙钟校准：系统休眠唤醒/setInterval 漂移后，与 endAt 误差超过 1s 时直接吸附，
        // 避免递减模型累积误差（误差 ≤1s 时保持 -1 节奏，防止 UI 跳秒）
        const { endAt } = get();
        if (endAt != null) {
          const wallRemaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
          if (Math.abs(wallRemaining - nextRemaining) > 1) {
            nextRemaining = wallRemaining;
          }
        }
        // 静默预设跳过预警和滴答音
        if (!isSilent) {
          // 预警（工作阶段）—— 支持自定义时点
          const warningSec = (settings.warningMinutes ?? 5) * 60;
          if (phase === 'work' && warningSec > 0 && nextRemaining === warningSec) {
            soundPlayer.play('pomodoro_5min_warning');
            set((s) => ({
              lastAction: 'tick_5min_warning' as PomodoroAction,
              lastActionCounter: s.lastActionCounter + 1,
            }));
          }
          // 最后 10 秒滴答（可关闭）
          if (phase === 'work' && (settings.tickFinalEnabled ?? true) && nextRemaining <= 10 && nextRemaining > 0) {
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

    // ── 预设 CRUD（委托给 presetService，同步更新 store 状态） ──
    createPreset: async (data) => {
      const preset = await svcCreatePreset(data);
      set((s) => ({ presets: [...s.presets, preset] }));
      return preset;
    },

    updatePreset: async (id, changes) => {
      await svcUpdatePreset(id, changes);
      set((s) => ({
        presets: s.presets.map(p => (p.id === id ? { ...p, ...changes } : p)),
        activePreset: s.activePreset?.id === id
          ? { ...s.activePreset, ...changes } as PomodoroPreset
          : s.activePreset,
      }));
    },

    deletePreset: async (id) => {
      await svcDeletePreset(id);
      const { activePreset, presets } = get();
      const remaining = presets.filter(p => p.id !== id);
      // 若删除的是当前活动预设，回退到第一个
      let newActive = activePreset;
      if (activePreset?.id === id) {
        newActive = remaining[0] ?? null;
        const duration = getPhaseDuration('work', newActive, get().settings);
        set({ remainingSeconds: duration, totalSeconds: duration, phase: 'work', completedCount: 0 });
      }
      set({ presets: remaining, activePreset: newActive, mode: newActive?.silent ? 'class' : 'self_study' });
    },

    reorderPresets: async (orderedIds) => {
      await svcReorderPresets(orderedIds);
      set((s) => ({
        presets: orderedIds
          .map(id => s.presets.find(p => p.id === id))
          .filter((p): p is PomodoroPreset => p != null),
      }));
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
