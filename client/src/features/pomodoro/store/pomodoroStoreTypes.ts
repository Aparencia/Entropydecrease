/**
 * 番茄钟状态仓库 — 类型定义与共享纯函数（slice 拆分第一文件）
 * Pomodoro store types — shared types and pure helpers for slices
 *
 * @ai-context: 2026-08 拆分自 usePomodoroStore（811 行超限）。PomodoroState
 * 为全 store 契约，timerSlice/settingsSlice/presetSlice 各实现子集；
 * 阶段时长/下一阶段/计数迁移等纯函数集中于此，禁止在各 slice 内重复。
 * @ai-context: Split from the 811-line monolith; PomodoroState is the full
 * contract while slices implement subsets. Phase math stays here as pure
 * functions shared by all slices.
 */
import type { StateCreator } from 'zustand';
import type { PomodoroPreset } from '@/types/models';

export type Phase = 'work' | 'short_break' | 'long_break';
/** @deprecated 仅为兼容旧会话记录保留，新代码使用 preset */
export type Mode = 'class' | 'self_study';

/** 番茄钟动作信号类型（供 usePomodoroEffects 监听） */
export type PomodoroAction =
  | 'start'
  | 'pause'
  | 'exit_immersive'
  | 'tick_5min_warning'
  | 'tick_final'
  | 'phase_complete'
  | null;

export interface PomodoroSettings {
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

export interface PomodoroState {
  // ── 计时器状态 ──
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
  /** 当前工作会话开始时间戳（ms），用于计算 actualDuration */
  sessionStartTime: number | null;
  /** 暂停时刻时间戳（ms），用于排除暂停时间对 actualDuration 的影响 */
  pausedAt: number | null;
  /** 累计暂停时间（ms），actualDuration = (now - sessionStartTime - totalPausedMs) / 1000 */
  totalPausedMs: number;
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
  dismissCompletionOverlay: () => void;

  // ── 设置与预设状态 ──
  settings: PomodoroSettings;
  presets: PomodoroPreset[];
  activePreset: PomodoroPreset | null;

  // ── 计时器操作 ──
  start: () => void;
  /** 开始首潜 3 分钟迷你体验（新手引导专用，不改动用户设置） */
  startMiniDive: () => void;
  /** T3: 开始 5 分钟承诺深潜（拖延重启专用，最小承诺降低启动门槛） */
  startCommitDive: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  tick: () => void;
  enterImmersive: () => void;
  exitImmersive: () => void;
  /** @deprecated 使用 setPreset 替代 */
  setMode: (mode: Mode) => void;
  setPreset: (presetId: string) => void;
  setCurrentGoal: (goal: string | null) => void;
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

/** slice 创建函数类型（全 state 可见，实现自身子集） */
export type PomodoroSlice<T> = StateCreator<PomodoroState, [], [], T>;

// ── 纯函数：阶段时长与计数迁移 ─────────────────────────────

/** 根据预设获取阶段时长（秒） */
export function getPhaseDuration(phase: Phase, preset: PomodoroPreset | null, settings: PomodoroSettings): number {
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
}

/** 首潜迷你体验时长（3 分钟），见新手引导系统 */
export const MINI_DIVE_SECONDS = 180;

/** T3 5 分钟承诺深潜时长（拖延情绪调节：不要求完美，只要求开始） */
export const COMMIT_DIVE_SECONDS = 300;

/** 获取预设的有效 longBreakInterval（0 = 无长休） */
export function getInterval(preset: PomodoroPreset | null, settings: PomodoroSettings): number {
  return preset ? preset.longBreakInterval : settings.longBreakInterval;
}

export function getNextPhase(
  currentPhase: Phase,
  completedCount: number,
  longBreakInterval: number,
): Phase {
  if (currentPhase === 'work') {
    // longBreakInterval=0 表示无长休（原上课模式），始终短休
    if (longBreakInterval === 0) return 'short_break';
    return (completedCount + 1) % longBreakInterval === 0
      ? 'long_break'
      : 'short_break';
  }
  return 'work';
}

/**
 * 计算阶段结束后的完成计数：
 * - 长休结束 → 归零（一轮完成）
 * - 工作结束 → +1；无长休模式计数达到周期上限后回绕，避免无限累加
 * - 其他阶段 → 不变
 */
export function getNextCount(
  phase: Phase,
  completedCount: number,
  longBreakInterval: number,
): number {
  if (phase === 'long_break') return 0;
  if (phase !== 'work') return completedCount;
  // 无长休模式：回绕计数（用固定 4 作为显示上限）
  if (longBreakInterval === 0) return (completedCount % 4) + 1;
  return completedCount + 1;
}
