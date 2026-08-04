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
  MINI_DIVE_SECONDS, getInterval, getNextCount, getNextPhase, getPhaseDuration,
  type PomodoroSlice, type PomodoroState,
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
  const actualDuration = sst
    ? Math.round((Date.now() - sst - totalPausedMs) / 1000)
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
      });
    }).catch(() => {});
  }).catch(() => {});

  // 宪法第六条世界数据回路：深潜完成=种下珊瑚（沉积地层+1，世界生长）。
  // 动态 import 避免模块循环；plantCoral 内部受留存开关控制，失败静默降级
  import('@/features/retention/store/useEcosystemStore').then(({ useEcosystemStore }) => {
    const minutes = Math.max(1, Math.round((actualDuration ?? plannedSeconds) / 60));
    useEcosystemStore.getState().plantCoral(minutes, 'pomodoro', `dive-${Date.now()}`).catch(() => {});
  }).catch(() => {});

  // @ai-context: 发射 session:end 事件——驱动 AI 学伴主动触发（专注结束关怀）
  assistantEventBus.emit('session:end', {
    currentHour: new Date().getHours(),
    sessionMinutes: Math.round((actualDuration ?? plannedSeconds) / 60),
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
      sendNotification('又添了一段暖意', '继续深潜吧 ☕').catch(() => {});
    } else {
      sendNotification('休息结束！', '开始下一个番茄 🍅').catch(() => {});
    }
  }
}

export const createTickSlice: PomodoroSlice<{ tick: () => void }> = (set, get) => ({
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
        actualDuration = finalizeWorkPhase(get);
      }
      playPhaseFeedback(phase, isSilent, settings);

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
        totalPausedMs: 0,
        pausedAt: null,
        // 发出 phase_complete 动作信号
        lastAction: 'phase_complete',
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
      // 墙钟校准后若剩余时间 ≤ 0，立即完成（避免 UI 显示 00:00 停摆 1 秒）
      if (nextRemaining <= 0) {
        // 直接复用上面的完成逻辑
        const wasRunning = isRunning;
        const newCount = getNextCount(phase, completedCount, interval);
        const nextPhase = getNextPhase(phase, completedCount, interval);
        const duration = getPhaseDuration(nextPhase, activePreset, settings);
        const isCycleComplete = phase === 'long_break';

        let shouldAutoStart = false;
        if (nextPhase !== 'work' && settings.autoStartBreak) {
          shouldAutoStart = true;
        } else if (nextPhase === 'work' && settings.autoStartWork) {
          shouldAutoStart = true;
        }
        if (nextPhase !== 'work' && wasRunning) {
          shouldAutoStart = true;
        }

        let actualDuration: number | null = null;
        if (phase === 'work') {
          actualDuration = finalizeWorkPhase(get);
        }

        // FRONT2-M2: 墙钟校准完成分支补齐音效与通知——原实现"直接复用上面的
        // 完成逻辑"漏掉了这两块（正常分支有），休眠唤醒后的阶段
        // 完成无任何提示，用户错过阶段转换
        playPhaseFeedback(phase, isSilent, settings);

        set((s) => ({
          phase: nextPhase,
          remainingSeconds: shouldAutoStart ? duration : 0,
          totalSeconds: duration,
          completedCount: newCount,
          isRunning: shouldAutoStart,
          isPaused: !shouldAutoStart,
          endAt: shouldAutoStart ? Date.now() + duration * 1000 : null,
          isMiniDive: false,
          sessionStartTime: null,
          totalPausedMs: 0,
          pausedAt: null,
          lastAction: 'phase_complete',
          lastActionCounter: s.lastActionCounter + 1,
          lastCompletedPhase: phase,
          isCycleComplete,
          lastSessionActualDuration: actualDuration,
          showCompletionOverlay: phase === 'work' ? true : s.showCompletionOverlay,
        }));
        return;
      }
      // 静默预设跳过预警和滴答音
      if (!isSilent) {
        // 预警（工作阶段）—— 支持自定义时点
        const warningSec = (settings.warningMinutes ?? 5) * 60;
        // 使用 <= 而非严格相等，避免墙钟校准跳变时跳过预警
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
      set({ remainingSeconds: nextRemaining });
    }
  },
});
