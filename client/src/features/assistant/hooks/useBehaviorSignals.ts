/**
 * 行为信号采集与评估 Hook
 * Behavior signal collection & evaluation hook
 *
 * @ai-context: A1 情绪感知与 A5 认知负荷共享的信号源——在 AssistantRoot 挂载一次。
 * 监听全局 keydown 采集击键样本，评估周期内（BEHAVIOR_EVAL_INTERVAL_MS）：
 * 裁剪滚动窗口 → 计算指标 → A1 分级评估（升级时发射 emotion:struggle）
 * 与 A5 负荷估算（新进入高负荷时发射 cognitive:overload）。
 * 合并采集避免双份监听/定时器；觉察 > 管控——只发事件，是否干预由规则层决定。
 * @ai-context: Shared signal source for A1 emotion sensing and A5 cognitive load,
 * mounted once in AssistantRoot. Listens to global keydown, and on each eval
 * tick prunes the rolling window, computes metrics, emits emotion:struggle on
 * level escalation and cognitive:overload on entering high-load state.
 */
import { useEffect, useRef } from 'react';
import { assistantEventBus } from '../lib/eventBus';
import {
  createBehaviorWindow,
  pruneWindow,
  computeMetrics,
  typingDropRatio,
  assessEmotionLevel,
  instantLoadScore,
  type BehaviorWindow,
} from '../lib/behaviorMetrics';
import { createLoadEstimator, updateLoadSmoothed, advanceLoadState, type LoadEstimatorState } from '../lib/cognitiveLoad';
import { BEHAVIOR_WINDOW_MS, BEHAVIOR_EVAL_INTERVAL_MS } from '../constants';
import type { EmotionLevel } from '../types';

/** 基线击键速率的 EMA 系数（仅用活跃窗口更新，越慢越贴合个人节奏） */
const BASELINE_EMA_ALPHA = 0.1;
/** 视为"活跃输入"的最低击键速率（次/分钟），低于此不更新基线 */
const ACTIVE_RATE_MIN = 5;

/** 判断焦点是否在可输入元素上（编辑器/输入框） */
function hasInputFocus(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

export function useBehaviorSignals(): void {
  const winRef = useRef<BehaviorWindow>(createBehaviorWindow());
  const baselineRef = useRef(0);
  const loadRef = useRef<LoadEstimatorState>(createLoadEstimator());
  const hasHistoryRef = useRef(false);
  const lastEmotionRef = useRef<EmotionLevel | null>(null);
  const lastPathRef = useRef<string>(typeof window !== 'undefined' ? window.location.pathname : '');

  useEffect(() => {
    // ── 击键采集：记录样本与最近击键时间 ──
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.hidden) return;
      const isDelete = e.key === 'Backspace' || e.key === 'Delete';
      winRef.current.keys.push({ t: Date.now(), isDelete });
      winRef.current.lastKeyAt = Date.now();
    };
    document.addEventListener('keydown', onKeyDown);

    // ── 周期评估 ──
    const timer = window.setInterval(() => {
      if (document.hidden) return; // 应用不可见时无行为信号可言
      const now = Date.now();

      // 路由切换检测：React Router pushState 不触发 popstate，按周期比对路径
      const path = window.location.pathname + window.location.search;
      if (path !== lastPathRef.current) {
        lastPathRef.current = path;
        winRef.current.routeSwitches.push(now);
      }

      const win = pruneWindow(winRef.current, now, BEHAVIOR_WINDOW_MS);
      winRef.current = win;
      const metrics = computeMetrics(win, now);

      // 基线速率：仅活跃输入时 EMA 更新（个人节奏参照）
      if (metrics.keyRatePerMin >= ACTIVE_RATE_MIN) {
        baselineRef.current = baselineRef.current === 0
          ? metrics.keyRatePerMin
          : (1 - BASELINE_EMA_ALPHA) * baselineRef.current + BASELINE_EMA_ALPHA * metrics.keyRatePerMin;
      }

      const currentHour = new Date().getHours();

      // A1：分级评估——仅在"升级"时发射，退让与冷却由引擎层负责
      const level = assessEmotionLevel({
        metrics,
        dropRatio: typingDropRatio(metrics.keyRatePerMin, baselineRef.current),
        hasInputFocus: hasInputFocus(),
      });
      if (level !== null && (lastEmotionRef.current === null || level > lastEmotionRef.current)) {
        assistantEventBus.emit('emotion:struggle', { currentHour, emotionLevel: level });
      }
      lastEmotionRef.current = level;

      // A5：负荷估算——EMA 平滑 + 迟滞，仅新进入高负荷时发射
      const instant = instantLoadScore(metrics);
      const smoothed = updateLoadSmoothed(loadRef.current, instant, hasHistoryRef.current);
      hasHistoryRef.current = true;
      const advanced = advanceLoadState(loadRef.current, smoothed);
      loadRef.current = advanced.state;
      if (advanced.justEntered) {
        assistantEventBus.emit('cognitive:overload', { currentHour, loadLevel: smoothed });
      }
    }, BEHAVIOR_EVAL_INTERVAL_MS);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearInterval(timer);
    };
  }, []);
}
