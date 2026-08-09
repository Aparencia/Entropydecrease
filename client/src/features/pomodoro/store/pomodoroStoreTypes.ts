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
  | 'breathing_resume'
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
  // 体验增强开关（v0.30，全部可选缺省关闭，不改变既有行为）
  breakReplayEnabled?: boolean;     // 休息记忆重放：休息时展示上次专注目标关键词
  flowMusicEnabled?: boolean;       // 心流音乐：按专注状态自动调整背景音乐
  guardianLinkEnabled?: boolean;    // 守护灵联动：按分心分数实时调节心流音乐
  autoSwitchAudioPhase?: boolean;   // 阶段音轨自动切换：休息/专注自动换音轨
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
  /**
   * Chronos 激活标记（沉睡↔呼吸区分）：false=沉睡（未激活），true=呼吸（已激活待开始）。
   * awaken() 置 true（点击激活）；reset() 清 false（长按中止回沉睡）。
   */
  isArmed: boolean;
  /**
   * 最近一次番茄活动时间戳（ms）。冷启动判定依据：
   * 距上次活动超过 COLD_START_MS（或从未活动）→ 沉睡点击先进呼吸仪式；
   * 热启动 → 沉睡点击直接开始 1 分钟迈步。
   */
  lastActivityAt: number | null;
  /** 当前会话是否为 1 分钟迈步（tick 完成时置 stepCompleted） */
  isStepDive: boolean;
  /** 1 分钟迈步已完成标记：迈步完成后的呼吸态点击 = 完整专注（目标弹窗） */
  stepCompleted: boolean;
  /** 跳过呼吸仪式标记：跳过呼吸态后首次专注不计入番茄计数（completedCount 不增加） */
  ritualSkipped: boolean;
  /** 呼吸缓解保存字段：专注→呼吸时保存的剩余专注秒数 */
  _breathingResumeRemaining: number | null;
  /** 呼吸缓解保存字段：专注→呼吸时保存的总专注秒数 */
  _breathingResumeTotal: number | null;
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
  /** 呼吸态 1 分钟迈步（启动心理学：先动起来，迈步完成回呼吸态） */
  startStepDive: () => void;
  /** 专注→呼吸缓解：暂停专注进入短暂呼吸态 */
  startBreathingDive: () => void;
  /** 跳过当前呼吸态：恢复原专注（呼吸缓解）或直接开始完整专注（迈步） */
  skipBreathingDive: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  skip: () => void;
  /** Chronos 点击激活：沉睡→呼吸（isArmed=true），不启动计时 */
  awaken: () => void;
  /** 中断当前工作会话（投入 ≥30s 时落库 interrupted 记录，不污染完成统计） */
  abortSession: () => void;
  tick: () => void;
  enterImmersive: () => void;
  exitImmersive: () => void;
  /** 切换预设（= 开启新周期：计数归零、阶段回 work、立即应用新时长） */
  setPreset: (presetId: string) => void;
  /**
   * 统一时长同步入口：计时空闲时按当前 activePreset/settings 刷新当前阶段的
   * remainingSeconds/totalSeconds（UI 表盘立即反映参数变更）。
   * 运行/暂停中不打断计时（阶段完成后自然按新参数进入下一阶段）。
   * settingsSlice.updateSettings / presetSlice.updatePreset / deletePreset 共用。
   */
  syncDisplayDuration: () => void;
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
    /** 设置跳过呼吸仪式标记 */
    setRitualSkipped: (v: boolean) => void;
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

/** 呼吸态 30 秒迈步时长（启动心理学：先动起来，30 秒即到） */
export const STEP_DIVE_SECONDS = 30;

/** 专注→呼吸缓解：专注暂停时进入的短暂呼吸时长 */
export const BREATHING_DIVE_SECONDS = 30;

/** 冷启动阈值：距上次番茄活动超过此时长（或从未活动）→ 沉睡点击先进呼吸仪式 */
export const COLD_START_MS = 24 * 60 * 60 * 1000;

/** 冷启动判定：无活动记录或距上次活动超过阈值 */
export function isColdStart(lastActivityAt: number | null): boolean {
  return lastActivityAt == null || Date.now() - lastActivityAt > COLD_START_MS;
}

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

/**
 * 计算会话实际投入毫秒数（排除暂停时间）：now - sessionStartTime - totalPausedMs。
 * sessionStartTime 为空（未开始/阶段已切换）时返回 null。
 * @ai-context: 时间感知统一事实源——abortSession 中断阈值与 finalizeWorkPhase
 * 落库时长共用，保证中断/完成统计口径一致。
 */
export function computeActualMs(
  sessionStartTime: number | null,
  totalPausedMs: number,
  now: number = Date.now(),
): number | null {
  if (sessionStartTime == null) return null;
  return now - sessionStartTime - totalPausedMs;
}

/** 实际投入秒数（round 取整），无会话起点时返回 null */
export function computeActualDuration(
  sessionStartTime: number | null,
  totalPausedMs: number,
  now: number = Date.now(),
): number | null {
  const ms = computeActualMs(sessionStartTime, totalPausedMs, now);
  return ms == null ? null : Math.round(ms / 1000);
}
