/**
 * 数字养生守门人 Hook
 *
 * @ai-context: 数字养生守门人（3.10）——5 条守护规则评估：
 * 1. 连续使用 2h 提醒休息
 * 2. 夜间 22:00 后护眼模式
 * 3. 周末推荐离线活动
 * 4. 番茄钟间隙强制远眺
 * 5. 久坐提醒站立
 * 渐进式执行：L1 建议 → L2 界面变暗 → L3 弹出休息活动 → L4 锁定 5 分钟
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePomodoroPhase, usePomodoroRunning } from '@/features/pomodoro/store/usePomodoroStore';
import { wellbeingEventBus } from '@/lib/wellbeing/wellbeingEventBus';
import { useLocalStorageFlag } from '@/hooks/useLocalStorageFlag';

export type EnforcementLevel = 0 | 1 | 2 | 3 | 4;

export interface DigitalWellbeingState {
  /** 连续使用分钟数 */
  continuousMinutes: number;
  /** 当前执行等级 */
  enforcementLevel: EnforcementLevel;
  /** 活跃规则列表 */
  activeRules: string[];
  /** 护眼模式启用 */
  eyeCareMode: boolean;
  /** 是否显示休息活动 */
  showRestActivity: boolean;
  /** 是否锁定 */
  isLocked: boolean;
  /** 久坐提醒显示 */
  showStandReminder: boolean;
}

/** 评估周期（ms） */
const WELLBEING_EVAL_MS = 30_000;
/** 连续使用阈值（分钟） */
const CONTINUOUS_THRESHOLD = 120;
/** 夜晚开始小时 */
const NIGHT_HOUR = 22;
/** 久坐阈值（分钟） */
const STAND_THRESHOLD = 45;

const REST_ACTIVITIES = [
  { id: 'stretch', label: '站立拉伸', emoji: '🧘', duration: 120 },
  { id: 'look-far', label: '远眺 20 秒', emoji: '🌳', duration: 20 },
  { id: 'breathe', label: '深呼吸 4-7-8', emoji: '🌬️', duration: 60 },
  { id: 'walk', label: '散步 5 分钟', emoji: '🚶', duration: 300 },
];

export function useDigitalWellbeing() {
  const phase = usePomodoroPhase();
  const isRunning = usePomodoroRunning();
  // M18: 功能开关短路——关闭时不挂载评估定时器/活动监听（零开销）
  const enabled = useLocalStorageFlag('ed-digital-wellbeing');
  const [state, setState] = useState<DigitalWellbeingState>({
    continuousMinutes: 0,
    enforcementLevel: 0,
    activeRules: [],
    eyeCareMode: false,
    showRestActivity: false,
    isLocked: false,
    showStandReminder: false,
  });
  const startTimeRef = useRef(Date.now());
  const lastActivityRef = useRef(Date.now());
  const enforcementRef = useRef<EnforcementLevel>(0);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // H1: 锁定到期时刻——用绝对时间判定是否仍在锁定期，避免 30s 评估周期内被
  // 下一次评估（enforcementLevel 已 >=4）直接清除锁定
  const lockUntilRef = useRef(0);
  const showRestActivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // M17: 连续使用提醒去重（连续 >=2h 期间只发一次，回落后复位）
  const restReminderEmittedRef = useRef(false);
  // M17: 护眼模式手动覆盖（null=自动跟随夜间；非 null=用户手动选择）
  const manualEyeCareRef = useRef<boolean | null>(null);

  // 重置连续使用计时（用户主动交互时）
  const resetContinuous = useCallback(() => {
    startTimeRef.current = Date.now();
    lastActivityRef.current = Date.now();
    setState(prev => ({
      ...prev,
      continuousMinutes: 0,
      enforcementLevel: 0,
      activeRules: [],
      showRestActivity: false,
      isLocked: false,
      showStandReminder: false,
    }));
    enforcementRef.current = 0;
    restReminderEmittedRef.current = false;
    lockUntilRef.current = 0;
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    if (showRestActivityTimerRef.current) clearTimeout(showRestActivityTimerRef.current);
  }, []);

  const dismissRestActivity = useCallback(() => {
    setState(prev => ({ ...prev, showRestActivity: false, isLocked: false }));
    lockUntilRef.current = 0;
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
  }, []);

  const dismissStandReminder = useCallback(() => {
    setState(prev => ({ ...prev, showStandReminder: false }));
  }, []);

  const toggleEyeCare = useCallback(() => {
    setState(prev => {
      // 手动覆盖自动夜间规则：切换后保持用户选择（M17）
      manualEyeCareRef.current = !prev.eyeCareMode;
      return { ...prev, eyeCareMode: !prev.eyeCareMode };
    });
  }, []);

  // 周期评估
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const hour = new Date().getHours();
      const day = new Date().getDay();
      const isWeekend = day === 0 || day === 6;
      const isNight = hour >= NIGHT_HOUR || hour < 6;
      const isBreak = phase === 'short_break' || phase === 'long_break';

      // 连续使用时间（分钟）——用户活动时重置
      const continuous = Math.floor((now - startTimeRef.current) / 60_000);
      const minutesSinceLastActivity = Math.floor((now - lastActivityRef.current) / 60_000);

      const activeRules: string[] = [];
      let enforcementLevel: EnforcementLevel = 0;
      let eyeCareMode = false;
      let showRestActivity = false;
      let isLocked = false;
      let showStandReminder = false;

      // 规则 1: 连续使用 2h 提醒（去重：连续超标期间只发一次，回落后复位）
      if (continuous >= CONTINUOUS_THRESHOLD) {
        activeRules.push('continuous_use');
        if (!restReminderEmittedRef.current) {
          restReminderEmittedRef.current = true;
          wellbeingEventBus.emit('wellbeing:rest-reminder', { minutes: continuous, hour });
        }
      } else {
        restReminderEmittedRef.current = false;
      }

      // 规则 2: 夜间护眼（自动跟随夜间，手动覆盖优先；次日白天自动关闭）
      if (isNight) {
        activeRules.push('eye_care');
        eyeCareMode = manualEyeCareRef.current ?? true;
      } else {
        // 非夜间：未手动开启时自动关闭（防护眼模式次日残留）
        eyeCareMode = manualEyeCareRef.current ?? false;
      }

      // 规则 3: 周末推荐离线
      if (isWeekend) {
        activeRules.push('weekend_offline');
        wellbeingEventBus.emit('wellbeing:offline-suggested', { hour, day });
      }

      // 规则 4: 番茄钟间隙强制远眺
      if (isBreak) {
        activeRules.push('break_look_far');
        showRestActivity = true;
      }

      // 规则 5: 久坐提醒
      if (minutesSinceLastActivity >= STAND_THRESHOLD) {
        activeRules.push('sedentary');
        showStandReminder = true;
        wellbeingEventBus.emit('wellbeing:stand-reminder', { minutes: minutesSinceLastActivity });
      }

      // 计算执行等级
      let score = 0;
      if (continuous >= CONTINUOUS_THRESHOLD) score += 20;
      if (isNight) score += 15;
      if (isBreak) score += 10;
      if (minutesSinceLastActivity >= STAND_THRESHOLD) score += 20;

      if (score >= 50) enforcementLevel = 4;
      else if (score >= 35) enforcementLevel = 3;
      else if (score >= 20) enforcementLevel = 2;
      else if (score >= 10) enforcementLevel = 1;

      // L3: 弹出休息活动（自动关闭后恢复）
      if (enforcementLevel >= 3 && !showRestActivity) {
        showRestActivity = true;
        if (showRestActivityTimerRef.current) clearTimeout(showRestActivityTimerRef.current);
        showRestActivityTimerRef.current = setTimeout(() => {
          setState(prev => ({ ...prev, showRestActivity: false }));
        }, 15_000);
      }

      // L4: 锁定 5 分钟——用绝对到期时刻判定，锁定期内不被后续评估清除（H1）
      if (enforcementLevel >= 4 && lockUntilRef.current <= now) {
        lockUntilRef.current = now + 5 * 60 * 1000;
        isLocked = true;
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
        lockTimerRef.current = setTimeout(() => {
          lockUntilRef.current = 0;
          setState(prev => ({ ...prev, isLocked: false }));
        }, 5 * 60 * 1000);
      } else if (enforcementLevel >= 4 && lockUntilRef.current > now) {
        // 仍在锁定期：保持锁定
        isLocked = true;
      }

      enforcementRef.current = enforcementLevel;

      setState(prev => ({
        ...prev,
        continuousMinutes: continuous,
        enforcementLevel,
        activeRules,
        eyeCareMode,
        showRestActivity: showRestActivity || prev.showRestActivity,
        isLocked,
        showStandReminder,
      }));
    }, WELLBEING_EVAL_MS);

    return () => clearInterval(timer);
  }, [phase, isRunning, enabled]);

  // 用户交互重置
  useEffect(() => {
    if (!enabled) return;
    const onUserActivity = () => {
      lastActivityRef.current = Date.now();
    };
    document.addEventListener('mousedown', onUserActivity);
    document.addEventListener('keydown', onUserActivity);
    return () => {
      document.removeEventListener('mousedown', onUserActivity);
      document.removeEventListener('keydown', onUserActivity);
    };
  }, [enabled]);

  return {
    ...state,
    restActivities: REST_ACTIVITIES,
    resetContinuous,
    dismissRestActivity,
    dismissStandReminder,
    toggleEyeCare,
  };
}