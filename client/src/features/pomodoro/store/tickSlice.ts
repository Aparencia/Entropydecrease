/**
 * 番茄钟状态仓库 — tick slice（秒级状态机，含阶段完成副作用）
 * Pomodoro tick slice — per-second state machine with completion side effects
 *
 * @ai-context: 拆分自 usePomodoroStore，tick 逻辑逐字保留（行为不变）。
 * 墙钟校准：与 endAt 误差 >1s 吸附，≤1s 保持 -1 节奏防跳秒；校准后 ≤0
 * 直接完成（避免 00:00 停摆）。完成副作用：recordSession 落库→成就检查→
 * 珊瑚种植→session:end 事件；静默预设跳过全部提示音（BUG-005 语义）。
 * @ai-context: Verbatim extraction of the tick machine. Wall-clock snap via
 * endAt; completion side effects chain: session record → achievements →
 * coral planting → session:end event; silent presets skip all sounds.
 */
import {
  MINI_DIVE_SECONDS, computeActualDuration, getInterval, getNextCount, getNextPhase, getPhaseDuration,
  type Phase, type PomodoroSettings, type PomodoroSlice, type PomodoroState,
} from './pomodoroStoreTypes';
import { recordSession, playCompletionSound, sendNotification } from './usePomodoroPersistence';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { assistantEventBus } from '@/features/assistant/lib/eventBus';

/** 工作阶段完成后的世界数据回路（会话落库 + 成就 + 珊瑚 + 事件） */
function finalizeWorkPhase(get: () => PomodoroState): number | null {
  const { sessionStartTime: sst, isMiniDive, totalPausedMs, currentGoal, activePreset, settings } = get();
  // 迷你潜水按实际 180s 记录，避免污染效率统计（首潜决策：计入成就）
  const plannedSeconds = isMiniDive
    ? MINI_DIVE_SECONDS
    : (activePreset?.workDuration ?? settings.workDuration) * 60;
  // 实际投入时长（排除暂停），无会话起点时回退计划时长
  const actualDuration = sst != null
    ? (computeActualDuration(sst, totalPausedMs) ?? plannedSeconds)
    : plannedSeconds;
  recordSession({
    mode: activePreset?.silent ? 'class' : 'self_study',
    presetId: activePreset?.id,
    duration: plannedSeconds,
    actualDuration,
    completedAt: new Date(),
    interrupted: false,
    goal: currentGoal ?? undefined,
  }).then(() => {
    // 触发成就检查（动态 import 避免循环依赖）
    import('@/lib/achievements/evaluator').then(({ checkAchievements }) => {
      checkAchievements({ type: 'pomodoro_completed' }).then((unlocked) => {
        unlocked.forEach(a => {
          window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: a }));
        });
      }).catch((err) => {
        // 成就检查失败：本次不触发成就事件（侧效应，debug 级留痕）
        console.debug('[tickSlice] checkAchievements failed', err);
      });
    }).catch((err) => {
      console.debug('[tickSlice] achievements evaluator load failed', err);
    });
  }).catch((err) => {
    console.debug('[tickSlice] session log write failed', err);
  });

  // 宪法第六条世界数据回路：深潜完成=种下珊瑚（沉积地层+1，世界生长）。
  // 动态 import 避免模块循环；plantCoral 内部受留存开关控制，失败静默降级
  import('@/features/retention/store/useEcosystemStore').then(({ useEcosystemStore }) => {
    const minutes = Math.max(1, Math.round((actualDuration ?? plannedSeconds) / 60));
    useEcosystemStore.getState().plantCoral(minutes, 'pomodoro', `dive-${Date.now()}`).catch((err) => {
      console.debug('[tickSlice] plantCoral failed', err);
    });
  }).catch((err) => {
    console.debug('[tickSlice] ecosystem store load failed', err);
  });

  // 宪法第六条世界数据回路·花园侧：深潜完成=播下一颗种子（专注花园）。
  // 动态 import 避免模块循环；失败静默降级，不影响番茄钟主流程
  import('@/features/garden/lib/gardenStore').then(({ useGardenStore }) => {
    const minutes = Math.max(1, Math.round((actualDuration ?? plannedSeconds) / 60));
    useGardenStore.getState().addPlant({
      sourceSessionId: `dive-${Date.now()}`,
      focusMinutes: minutes,
    });
  }).catch((err) => {
    console.debug('[tickSlice] garden store load failed', err);
  });

  // @ai-context: 发射 session:end 事件——驱动 AI 学伴主动触发（专注结束关怀）
  assistantEventBus.emit('session:end', {
    currentHour: new Date().getHours(),
    sessionMinutes: Math.round((actualDuration ?? plannedSeconds) / 60),
  });

  // @ai-context: 社交接力上报（轻事件）——存在活跃接力配对时向搭档上报
  // 一次完成事件（只含分钟数，无内容）。动态 import + fire-and-forget：
  // 任何失败静默，绝不阻塞番茄钟主流程。
  import('@/features/social/lib/relayNotify').then(({ notifyRelayComplete }) => {
    notifyRelayComplete((actualDuration ?? plannedSeconds) / 60).catch((err) => {
      console.debug('[tickSlice] notifyRelayComplete failed', err);
    });
  }).catch((err) => {
    console.debug('[tickSlice] relayNotify load failed', err);
  });

  return actualDuration;
}

/** 阶段完成提示（音效 + 浏览器通知；静默预设跳过） */
function playPhaseFeedback(phase: string, isSilent: boolean, settings: { soundEnabled: boolean; notificationEnabled: boolean }) {
  if (!isSilent) {
    if (settings.soundEnabled) {
      playCompletionSound();
    }
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
  if (settings.notificationEnabled) {
    if (phase === 'work') {
      sendNotification('又添了一段暖意', '继续深潜吧 ☕').catch((err) => {
        // 浏览器通知失败（权限/系统限制）：静默，debug 留痕
        console.debug('[tickSlice] work notification failed', err);
      });
    } else {
      sendNotification('休息结束！', '开始下一个番茄 🍅').catch((err) => {
        console.debug('[tickSlice] break notification failed', err);
      });
    }
  }
}

/**
 * 统一的阶段完成处理（tick 正常分支与墙钟校准分支共用，行为完全一致）
 *
 * @ai-context: 原实现两分支各写一份约 40 行重复代码，且校准分支的
 * remainingSeconds 误用 0（autoStart 关闭时休息被吞）。本函数收敛
 * 全部迁移逻辑，剩余时间一律设为新阶段完整时长。
 */
function runPhaseCompletion(
  set: (fn: (s: PomodoroState) => Partial<PomodoroState>) => void,
  get: () => PomodoroState,
): void {
  const { phase, completedCount, settings, activePreset, isRunning } = get();
  const interval = getInterval(activePreset, settings);
  const isSilent = activePreset?.silent ?? false;
  const wasRunning = isRunning;
  const isStepDive = get().isStepDive;
  const { ritualSkipped } = get();

  // 呼吸缓解（专注→呼吸）标记：呼吸态完成后恢复专注，不计数/不落库/不播完成音效
  const resumeRemaining = get()._breathingResumeRemaining;
  const resumeTotal = get()._breathingResumeTotal;
  const isBreathingResume = phase === 'work' && isStepDive && resumeRemaining != null;

  // 跳过呼吸仪式后首次专注不计入番茄计数（ritualSkipped=true 时 completedCount 不增加）；
  // 呼吸缓解恢复专注同样不增加计数（不是完成的番茄）
  const newCount = isBreathingResume || ritualSkipped
    ? completedCount
    : getNextCount(phase, completedCount, interval);
  // 仪式计数标记用完即清（首次专注完成后恢复计数）
  const clearRitualSkipped = ritualSkipped;
  let nextPhase = getNextPhase(phase, completedCount, interval);
  let duration = getPhaseDuration(nextPhase, activePreset, settings);
  const isCycleComplete = phase === 'long_break';

  // 1 分钟迈步完成：无缝衔接完整专注（目标已在前置弹窗填写，热身即开始，不进入休息）
  if (phase === 'work' && isStepDive) {
    nextPhase = 'work';
    duration = getPhaseDuration('work', activePreset, settings);
  }

  // 呼吸缓解恢复：用保存的剩余专注时间恢复
  if (isBreathingResume) {
    nextPhase = 'work';
    duration = resumeRemaining;
  }

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
  // 迈步完成无缝衔接：强制自动进入完整专注
  if (phase === 'work' && isStepDive) {
    shouldAutoStart = true;
  }

  // 记录完成的番茄会话（呼吸缓解恢复专注不算完成，不落库）
  let actualDuration: number | null = null;
  if (phase === 'work' && !isBreathingResume) {
    actualDuration = finalizeWorkPhase(get);
  }
  // 呼吸缓解完成不播放阶段完成音效（避免误报"专注完成"）；其余阶段正常反馈
  if (!isBreathingResume) {
    playPhaseFeedback(phase, isSilent, settings);
  }

  set((s) => ({
    phase: nextPhase,
    remainingSeconds: duration,
    // 呼吸缓解恢复：totalSeconds 恢复为原专注总时长（progress 不重置）；其余阶段按新阶段时长
    totalSeconds: isBreathingResume && resumeTotal != null ? resumeTotal : duration,
    completedCount: newCount,
    isRunning: shouldAutoStart,
    isPaused: !shouldAutoStart,
    // 自动进入下一阶段时重设墙钟截止点；否则清空等待下次 start/resume
    endAt: shouldAutoStart ? Date.now() + duration * 1000 : null,
    // 迷你潜水仅限一个工作阶段，阶段切换即恢复常规节律
    isMiniDive: false,
    // 1 分钟迈步完成：置 stepCompleted（迈步完成后的呼吸态点击 = 完整专注）
    stepCompleted: phase === 'work' ? get().isStepDive : s.stepCompleted,
    isStepDive: false,
    // 跳过仪式标记：首次专注不计入计数，用完即清
    ritualSkipped: clearRitualSkipped ? false : s.ritualSkipped,
    // 切换到新阶段时清空计时，下一个 start/resume 会重新设置
    sessionStartTime: null,
    totalPausedMs: 0,
    pausedAt: null,
    // 发出动作信号：呼吸缓解恢复用 breathing_resume（不触发 phase_complete 副作用：涟漪/关键词缓存）
    lastAction: isBreathingResume ? 'breathing_resume' : 'phase_complete',
    lastActionCounter: s.lastActionCounter + 1,
    lastCompletedPhase: phase,
    isCycleComplete,
    lastSessionActualDuration: actualDuration,
    // v0.29: 工作阶段完成时触发庆祝覆盖层（1 分钟迈步完成除外——无缝衔接专注，不打断）
    showCompletionOverlay: phase === 'work' && !isStepDive ? true : s.showCompletionOverlay,
    // 清空呼吸缓解保存字段
    _breathingResumeRemaining: null,
    _breathingResumeTotal: null,
  }));
}

/**
 * 阶段内时间感知副作用：5 分钟预警与最后 10 秒滴答音（静默预设跳过）
 *
 * @ai-context: 从 tick 内联提取（递减与墙钟吸附两条路径共用）；
 * 预警用窗口判定（<=warningSec 且 >warningSec-3）而非严格相等，
 * 避免墙钟校准跳变时漏报。
 */
function emitPhaseSignals(
  get: () => PomodoroState,
  set: (fn: (s: PomodoroState) => Partial<PomodoroState>) => void,
  phase: Phase,
  nextRemaining: number,
  isSilent: boolean,
  settings: PomodoroSettings,
): void {
  if (isSilent) return;
  // 预警（工作阶段）—— 支持自定义时点
  const warningSec = (settings.warningMinutes ?? 5) * 60;
  if (phase === 'work' && warningSec > 0 && nextRemaining <= warningSec && nextRemaining > warningSec - 3) {
    soundPlayer.play('pomodoro_5min_warning');
    set((s) => ({
      lastAction: 'tick_5min_warning',
      lastActionCounter: s.lastActionCounter + 1,
    }));
  }
  // 最后 10 秒滴答（可关闭）
  if (phase === 'work' && (settings.tickFinalEnabled ?? true) && nextRemaining <= 10 && nextRemaining > 0) {
    soundPlayer.play('pomodoro_tick_final');
    set((s) => ({
      lastAction: 'tick_final',
      lastActionCounter: s.lastActionCounter + 1,
    }));
  }
}

export const createTickSlice: PomodoroSlice<{ tick: () => void }> = (set, get) => ({
  tick: () => {
    const { remainingSeconds, isRunning, phase, settings, activePreset, endAt } = get();
    if (!isRunning) return;
    const isSilent = activePreset?.silent ?? false;

    // ── 无墙钟锚点（异常/测试路径）：维持递减节奏，剩余 ≤1 即完成 ──
    if (endAt == null) {
      if (remainingSeconds <= 1) {
        runPhaseCompletion(set, get);
        return;
      }
      emitPhaseSignals(get, set, phase, remainingSeconds - 1, isSilent, settings);
      set({ remainingSeconds: remainingSeconds - 1 });
      return;
    }

    // ── 墙钟锚点路径：递减 + 校准吸附 + 准点完成 ──
    const wallRemaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));

    // 剩余 ≤1 时以墙钟为准：锚点未归零则吸附等待（避免提前完成），归零立即完成
    if (remainingSeconds <= 1) {
      if (wallRemaining > 0) {
        // 校准后同值短路：调度器终点附近密集轮询时避免多余 store 更新
        if (wallRemaining === remainingSeconds) return;
        set({ remainingSeconds: wallRemaining });
        return;
      }
      runPhaseCompletion(set, get);
      return;
    }

    let nextRemaining = remainingSeconds - 1;
    // 墙钟校准：系统休眠唤醒/setInterval 漂移后，与 endAt 误差超过 1s 时直接吸附，
    // 避免递减模型累积误差（误差 ≤1s 时保持 -1 节奏，防止 UI 跳秒）
    if (Math.abs(wallRemaining - nextRemaining) > 1) {
      nextRemaining = wallRemaining;
    }
    // 墙钟校准后若剩余时间 ≤ 0，立即完成（避免 UI 显示 00:00 停摆 1 秒）
    if (nextRemaining <= 0) {
      runPhaseCompletion(set, get);
      return;
    }
    emitPhaseSignals(get, set, phase, nextRemaining, isSilent, settings);
    set({ remainingSeconds: nextRemaining });
  },
});
