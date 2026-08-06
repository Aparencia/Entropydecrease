/**
 * 专注守护灵 Hook
 *
 * @ai-context: 专注守护灵（3.9）——采集窗口切换频率、键入速率、鼠标移动、
 * 应用使用、通知响应、番茄钟状态等行为信号，计算分心分数，
 * 驱动 5 级干预（L0 无 → L1 底部提示 → L2 水母提醒 → L3 全屏覆盖 → L4 建议休息）。
 * 状态由调用方持有，纯事件驱动。
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { usePomodoroPhase, usePomodoroRunning } from '@/features/pomodoro/store/usePomodoroStore';
import { wellbeingEventBus } from '@/lib/wellbeing/wellbeingEventBus';
import { useLocalStorageFlag } from '@/hooks/useLocalStorageFlag';

/** 5 级干预等级 */
export type FocusLevel = 0 | 1 | 2 | 3 | 4;

/** 评估周期（ms） */
const EVAL_INTERVAL_MS = 5_000;
/** 分心窗口（ms） */
const DISTRACTION_WINDOW_MS = 60_000;
/** 进入 L1 的分心分数阈值 */
const THRESHOLD_L1 = 15;
/** 进入 L2 的分心分数阈值 */
const THRESHOLD_L2 = 30;
/** 进入 L3 的分心分数阈值 */
const THRESHOLD_L3 = 50;
/** 进入 L4 的分心分数阈值 */
const THRESHOLD_L4 = 70;
/** 每次降级的衰减量 */
const DECAY_PER_TICK = 3;
/** 分心分数上限 */
const MAX_SCORE = 100;

interface DistractionSample {
  t: number;
  /** 窗口切换 */
  windowSwitch: boolean;
  /** 鼠标抖动（快速移动） */
  mouseJitter: boolean;
  /** 键入暂停（>2s 无击键） */
  typingPause: boolean;
}

export interface FocusGuardianState {
  /** 当前分心分数（0-100） */
  score: number;
  /** 当前干预等级 */
  level: FocusLevel;
  /** 分心事件计数（窗口切换） */
  windowSwitchCount: number;
  /** 分心事件计数（鼠标抖动） */
  mouseJitterCount: number;
  /** 分心事件计数（键入暂停） */
  typingPauseCount: number;
}

export function useFocusGuardian() {
  const phase = usePomodoroPhase();
  const isRunning = usePomodoroRunning();
  // M18: 功能开关短路——关闭时不挂载任何采集监听器/定时器（零开销）
  const enabled = useLocalStorageFlag('ed-focus-guardian');
  const [state, setState] = useState<FocusGuardianState>({
    score: 0,
    level: 0,
    windowSwitchCount: 0,
    mouseJitterCount: 0,
    typingPauseCount: 0,
  });
  const samplesRef = useRef<DistractionSample[]>([]);
  const lastKeyAtRef = useRef(Date.now());
  /** M11: 是否已检测到键入会话——未键入过不判定"键入暂停" */
  const typingSessionRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const lastMouseTimeRef = useRef(Date.now());
  const visibilityRef = useRef(document.visibilityState);
  const visibilityChangesRef = useRef(0);
  const lastVisibilityTimeRef = useRef(Date.now());
  const levelRef = useRef<FocusLevel>(0);

  // ── 窗口可见性变化 → 分心信号 ──
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      const now = Date.now();
      // 从可见→隐藏计为一次分心（切出应用）
      if (document.visibilityState === 'hidden') {
        visibilityChangesRef.current++;
        lastVisibilityTimeRef.current = now;
        samplesRef.current.push({ t: now, windowSwitch: true, mouseJitter: false, typingPause: false });
      }
      // 从隐藏→可见，记录窗口切回
      else if (visibilityRef.current === 'hidden') {
        samplesRef.current.push({ t: now, windowSwitch: true, mouseJitter: false, typingPause: false });
      }
      visibilityRef.current = document.visibilityState;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);

  // ── 鼠标移动监测 ──
  useEffect(() => {
    if (!enabled) return;
    const onMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      const dx = Math.abs(e.clientX - lastMousePosRef.current.x);
      const dy = Math.abs(e.clientY - lastMousePosRef.current.y);
      const dt = now - lastMouseTimeRef.current;

      // 快速大幅移动（>200px in <100ms）计为鼠标抖动
      if (dt < 100 && dt > 0 && (dx + dy) > 200) {
        samplesRef.current.push({ t: now, windowSwitch: false, mouseJitter: true, typingPause: false });
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      lastMouseTimeRef.current = now;
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [enabled]);

  // ── 击键监测 ──
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = () => {
      lastKeyAtRef.current = Date.now();
      // M11: 仅真实键入后才进入"键入会话"，安静阅读不会被判定为键入暂停
      typingSessionRef.current = true;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  // ── 周期评估 ──
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const cutoff = now - DISTRACTION_WINDOW_MS;

      // 裁剪滚动窗口
      samplesRef.current = samplesRef.current.filter(s => s.t > cutoff);

      // 检测键入暂停（>2s 无击键且文档可见且处于工作阶段）
      // M11: 仅当已检测到键入会话后才评分——从未键入的安静阅读不累计；
      // 记录一次暂停即结束本轮会话，避免 5s 周期内反复累计同一次暂停
      if (!document.hidden && phase === 'work' && isRunning && typingSessionRef.current) {
        if (now - lastKeyAtRef.current > 2000) {
          samplesRef.current.push({ t: now, windowSwitch: false, mouseJitter: false, typingPause: true });
          typingSessionRef.current = false;
        }
      }

      // 计算周期内分心事件数
      const windowSwitches = samplesRef.current.filter(s => s.windowSwitch).length;
      const mouseJitters = samplesRef.current.filter(s => s.mouseJitter).length;
      const typingPauses = samplesRef.current.filter(s => s.typingPause).length;

      // 新分心分数 = 加权和 + 衰减
      const rawScore = Math.min(MAX_SCORE,
        windowSwitches * 8 + mouseJitters * 3 + typingPauses * 5
      );

      setState(prev => {
        const newScore = Math.max(0, Math.min(MAX_SCORE, prev.score > rawScore
          ? prev.score - DECAY_PER_TICK  // 无新分心时衰减
          : rawScore
        ));

        // 计算新等级
        let newLevel: FocusLevel = 0;
        if (newScore >= THRESHOLD_L4) newLevel = 4;
        else if (newScore >= THRESHOLD_L3) newLevel = 3;
        else if (newScore >= THRESHOLD_L2) newLevel = 2;
        else if (newScore >= THRESHOLD_L1) newLevel = 1;

        // 等级变化时发射事件（携带分数，供番茄钟心流音乐等下游订阅）
        if (newLevel !== levelRef.current) {
          levelRef.current = newLevel;
          wellbeingEventBus.emit('focus:level-changed', { level: newLevel, score: newScore, hour: new Date().getHours() });
          if (newLevel >= 3) {
            wellbeingEventBus.emit('focus:distraction-detected', { level: newLevel });
          }
          if (newLevel >= 4) {
            wellbeingEventBus.emit('focus:break-suggested', { level: newLevel });
          }
        }

        return {
          score: newScore,
          level: newLevel,
          windowSwitchCount: windowSwitches,
          mouseJitterCount: mouseJitters,
          typingPauseCount: typingPauses,
        };
      });
    }, EVAL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [phase, isRunning, enabled]);

  const resetScore = useCallback(() => {
    setState({ score: 0, level: 0, windowSwitchCount: 0, mouseJitterCount: 0, typingPauseCount: 0 });
    samplesRef.current = [];
    levelRef.current = 0;
    // M11: 重置键入追踪——暂停判定基于的时间基准一并归零，避免残留旧击键时间
    lastKeyAtRef.current = Date.now();
    typingSessionRef.current = false;
  }, []);

  return { ...state, resetScore };
}