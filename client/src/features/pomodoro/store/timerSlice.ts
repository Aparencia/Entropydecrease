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
import { loadSettings, loadLastSessionAt, recordSession } from './usePomodoroPersistence';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { seedBuiltinPresets } from '../lib/presetService';
import {
  COMMIT_DIVE_SECONDS, MINI_DIVE_SECONDS, STEP_DIVE_SECONDS, BREATHING_DIVE_SECONDS, computeActualMs, getPhaseDuration,
  getInterval, getNextPhase,
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

/** 中断记录最低投入时长：低于 30s 视为误触/未开始，不落库避免噪声 */
const MIN_ABORT_RECORD_MS = 30_000;

/** initialize 串行化：App 启动与设置页挂载会并发调用，共享同一 promise
 * 防止两次加载相互覆盖（dev StrictMode 下放大）。 */
let initPromise: Promise<void> | null = null;

export const createTimerSlice: PomodoroSlice<Pick<PomodoroState,
  | 'phase' | 'isRunning' | 'isPaused' | 'remainingSeconds' | 'totalSeconds'
  | 'endAt' | 'completedCount' | 'sessionStartTime' | 'pausedAt' | 'totalPausedMs'
  | 'isMiniDive' | 'isImmersive' | 'wasImmersive' | 'isArmed' | 'lastActivityAt' | 'isStepDive' | 'stepCompleted' | 'ritualSkipped'
  | '_breathingResumeRemaining' | '_breathingResumeTotal'
  | 'lastAction' | 'lastActionCounter'
  | 'lastCompletedPhase' | 'isCycleComplete' | 'lastSessionActualDuration'
  | 'showCompletionOverlay' | 'dismissCompletionOverlay' | 'initialize'
  | 'start' | 'startMiniDive' | 'startCommitDive' | 'startStepDive' | 'startBreathingDive' | 'skipBreathingDive' | 'pause' | 'resume'
  | 'reset' | 'skip' | 'awaken' | 'abortSession' | 'enterImmersive' | 'exitImmersive'
  | 'syncDisplayDuration' | 'setRitualSkipped'
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
  isArmed: false,
  lastActivityAt: null,
  isStepDive: false,
  stepCompleted: false,
  ritualSkipped: false,
  _breathingResumeRemaining: null,
  _breathingResumeTotal: null,
  lastAction: null,
  lastActionCounter: 0,
  lastCompletedPhase: null,
  isCycleComplete: false,
  lastSessionActualDuration: null,
  showCompletionOverlay: false,

  initialize: () => {
    // 串行化：并发调用共享同一 promise，避免两次加载互相覆盖
    if (!initPromise) {
      initPromise = doInitialize(set, get);
    }
    return initPromise;
  },

  start: () => {
    set((s) => ({
      isRunning: true, isPaused: false, sessionStartTime: Date.now(),
      // 墙钟截止点：tick 据此校准，避免 interval 漂移/后台节流累积误差
      endAt: Date.now() + s.remainingSeconds * 1000,
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
      totalPausedMs: 0, pausedAt: null,
      isArmed: true, // 开始即进入激活态（呼吸→专注）
      lastActivityAt: Date.now(),
    }));
    // 静默预设跳过启停音效（BUG-005 语义完整化：silent 覆盖全部番茄钟音效）
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_start');
  },

  startMiniDive: () => {
    // 3 分钟真实专注：走完整 tick 链路（记会话/触发成就），duration 按 180s 如实记录
    set((s) => ({
      mode: 'self_study', phase: 'work',
      remainingSeconds: MINI_DIVE_SECONDS, totalSeconds: MINI_DIVE_SECONDS,
      endAt: Date.now() + MINI_DIVE_SECONDS * 1000,
      isMiniDive: true, isRunning: true, isPaused: false, isArmed: true,
      sessionStartTime: Date.now(), currentGoal: '首潜 · 3 分钟体验',
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
      lastActivityAt: Date.now(),
    }));
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_start');
  },

  startCommitDive: () => {
    // T3: 5 分钟承诺深潜——复用 isMiniDive 记录链路（时长按实际记录，不走预设）
    set((s) => ({
      mode: 'self_study', phase: 'work',
      remainingSeconds: COMMIT_DIVE_SECONDS, totalSeconds: COMMIT_DIVE_SECONDS,
      endAt: Date.now() + COMMIT_DIVE_SECONDS * 1000,
      isMiniDive: true, isRunning: true, isPaused: false, isArmed: true,
      sessionStartTime: Date.now(), currentGoal: '就 5 分钟 · 随时可以停',
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
      lastActivityAt: Date.now(),
    }));
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_start');
  },

  startStepDive: () => {
    // 呼吸态 1 分钟迈步：先动起来（启动心理学）。复用 isMiniDive 记录链路，
    // 时长按实际 60s 如实记录；迈步完成置 stepCompleted（tick 完成分支）
    // 保留已有 currentGoal（目标弹窗已前置填写，此处不覆盖）
    set((s) => ({
      mode: 'self_study', phase: 'work',
      remainingSeconds: STEP_DIVE_SECONDS, totalSeconds: STEP_DIVE_SECONDS,
      endAt: Date.now() + STEP_DIVE_SECONDS * 1000,
      isMiniDive: true, isRunning: true, isPaused: false, isArmed: true,
      sessionStartTime: Date.now(),
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
      lastActivityAt: Date.now(),
      isStepDive: true, stepCompleted: false,
    }));
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_start');
  },

  /**
   * 专注→呼吸缓解：专注暂停时进入短暂呼吸态（30s），恢复呼吸后自动恢复专注。
   * 保存当前 remainingSeconds，呼吸态结束后恢复。
   */
  startBreathingDive: () => {
    const { remainingSeconds, totalSeconds } = get();
    set((s) => ({
      mode: 'self_study', phase: 'work',
      remainingSeconds: BREATHING_DIVE_SECONDS, totalSeconds: BREATHING_DIVE_SECONDS,
      endAt: Date.now() + BREATHING_DIVE_SECONDS * 1000,
      isMiniDive: true, isRunning: true, isPaused: false, isArmed: true,
      sessionStartTime: Date.now(),
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
      lastActivityAt: Date.now(),
      isStepDive: true, stepCompleted: false,
      // 保存当前专注剩余时间，呼吸态完成后恢复
      _breathingResumeRemaining: remainingSeconds,
      _breathingResumeTotal: totalSeconds,
    }));
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_start');
  },

  /**
   * 跳过当前呼吸态：
   * - 呼吸缓解（专注→呼吸）中：恢复保存的原专注剩余时间
   * - 迈步仪式中：跳过仪式直接进入完整专注
   */
  skipBreathingDive: () => {
    const { _breathingResumeRemaining, _breathingResumeTotal, activePreset, settings } = get();
    if (_breathingResumeRemaining != null) {
      // 呼吸缓解：恢复保存的专注剩余时间
      set((s) => ({
        phase: 'work',
        remainingSeconds: _breathingResumeRemaining,
        totalSeconds: _breathingResumeTotal ?? _breathingResumeRemaining,
        endAt: Date.now() + _breathingResumeRemaining * 1000,
        isRunning: true, isPaused: false,
        isMiniDive: false,
        isStepDive: false, stepCompleted: false,
        _breathingResumeRemaining: null,
        _breathingResumeTotal: null,
        lastAction: 'breathing_resume', lastActionCounter: s.lastActionCounter + 1,
      }));
      return;
    }
    // 迈步仪式：跳过仪式直接进入完整专注
    const duration = getPhaseDuration('work', activePreset, settings);
    set((s) => ({
      phase: 'work',
      remainingSeconds: duration,
      totalSeconds: duration,
      endAt: Date.now() + duration * 1000,
      isRunning: true, isPaused: false,
      isMiniDive: false,
      isStepDive: false, stepCompleted: false,
      _breathingResumeRemaining: null,
      _breathingResumeTotal: null,
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
    }));
  },

  pause: () => {
    set((s) => ({
      isRunning: false, isPaused: true, endAt: null,
      pausedAt: Date.now(),
      lastAction: 'pause', lastActionCounter: s.lastActionCounter + 1,
      lastActivityAt: Date.now(),
    }));
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_pause');
  },

  resume: () => {
    const { sessionStartTime, pausedAt, totalPausedMs } = get();
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
      // 不再自动重入沉浸模式：尊重用户选择，停留在当前视图
      isImmersive: s.isImmersive,
      wasImmersive: false,
      lastActivityAt: Date.now(),
    }));
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_start');
  },

  reset: () => {
    // 中断当前工作会话（投入 ≥30s 落库，保证效率统计完整）
    get().abortSession();
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
      // 重置 = 本轮重新开始：周期计数归零（与统计页"完成数"口径一致）
      completedCount: 0,
      // 长按中止 = 回沉睡：清除激活标记、迈步状态、跳过标记与目标
      isArmed: false,
      isStepDive: false,
      stepCompleted: false,
      ritualSkipped: false,
      currentGoal: null,
      lastActivityAt: Date.now(),
    });
  },

  skip: () => {
    const { phase, completedCount, settings, activePreset } = get();
    // 跳过工作阶段 = 中断：落库中断记录，且不增加完成计数
    // （原实现计数 +1 导致 CycleMarkers 与统计页"完成深潜"数据打架）
    if (phase === 'work') {
      get().abortSession();
    }
    const interval = getInterval(activePreset, settings);
    const nextPhase = getNextPhase(phase, completedCount, interval);
    // 仅长休跳过时计数归零（开启新一轮）；工作/短休跳过不改变计数
    const newCount = phase === 'long_break' ? 0 : completedCount;
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
      isArmed: phase === 'work', // 工作阶段跳过仍处激活流，休息阶段跳过回沉睡
      lastActivityAt: Date.now(),
    });
  },

  /** Chronos 点击激活：沉睡→呼吸（启动 30s 倒计时，唤醒仪式） */
  awaken: () => {
    set((s) => ({
      mode: 'self_study', phase: 'work',
      remainingSeconds: STEP_DIVE_SECONDS, totalSeconds: STEP_DIVE_SECONDS,
      endAt: Date.now() + STEP_DIVE_SECONDS * 1000,
      isMiniDive: true, isRunning: true, isPaused: false, isArmed: true,
      sessionStartTime: Date.now(),
      lastAction: 'start', lastActionCounter: s.lastActionCounter + 1,
      lastActivityAt: Date.now(),
      isStepDive: true, stepCompleted: false,
    }));
    if (!get().activePreset?.silent) soundPlayer.play('pomodoro_start');
  },

  /**
   * 中断当前工作会话：投入 ≥30s 时落库 interrupted 记录（含实际专注时长与目标），
   * 供统计页与节律引擎评估真实投入；低于阈值视为误触不记录。
   */
  abortSession: () => {
    const { phase, sessionStartTime, totalPausedMs, currentGoal, activePreset, settings } = get();
    if (phase !== 'work' || sessionStartTime == null) return;
    const actualMs = computeActualMs(sessionStartTime, totalPausedMs) ?? 0;
    if (actualMs < MIN_ABORT_RECORD_MS) return;
    const plannedSeconds = (activePreset?.workDuration ?? settings.workDuration) * 60;
    recordSession({
      mode: activePreset?.silent ? 'class' : 'self_study',
      presetId: activePreset?.id,
      duration: plannedSeconds,
      actualDuration: Math.round(actualMs / 1000),
      completedAt: new Date(),
      interrupted: true,
      goal: currentGoal ?? undefined,
    }).catch(() => {});
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

  /**
   * 统一时长同步入口（settingsSlice.updateSettings / presetSlice.updatePreset /
   * deletePreset 共用）：计时空闲时按当前 activePreset/settings 刷新当前阶段的
   * remainingSeconds/totalSeconds，保证参数变更立即反映到 UI 表盘；
   * 运行/暂停中不打断计时（阶段完成后由 tick 自然按新参数进入下一阶段）。
   */
  syncDisplayDuration: () => {
    const { phase, activePreset, settings, isRunning, isPaused } = get();
    if (isRunning || isPaused) return;
    const duration = getPhaseDuration(phase, activePreset, settings);
    set({ remainingSeconds: duration, totalSeconds: duration });
  },

  /** 设置跳过呼吸仪式标记（跳过呼吸态后首次专注不计入番茄计数） */
  setRitualSkipped: (v) => {
    set({ ritualSkipped: v });
  },
});

/**
 * 实际初始化逻辑：加载设置 → 种子化内置预设 → 恢复活动预设 → 请求通知权限。
 * 由 initialize 包装为串行 promise（App 启动与设置页挂载并发调用时只执行一次）。
 */
async function doInitialize(
  set: (fn: PomodoroState | Partial<PomodoroState> | ((s: PomodoroState) => Partial<PomodoroState>)) => void,
  get: () => PomodoroState,
): Promise<void> {
  const saved = await loadSettings();
  const merged = saved ? { ...defaultSettings, ...saved } : defaultSettings;

  // 回填最近会话时间（Chronos 冷启动判定数据源；无记录 = 冷启动）
  const lastActivityAt = await loadLastSessionAt();

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
    lastActivityAt,
    remainingSeconds: get().isRunning || get().isPaused ? get().remainingSeconds : duration,
    totalSeconds: get().isRunning || get().isPaused ? get().totalSeconds : duration,
  });
  // 如果启用了通知，主动请求权限
  if (merged.notificationEnabled && 'Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}
