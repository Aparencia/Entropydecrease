/**
 * 行为信号指标计算（纯函数）
 * Behavior signal metrics computation (pure functions)
 *
 * @ai-context: 从原始行为信号（击键、删除、路由切换时间戳）计算滚动窗口指标，
 * 供 A1 情绪感知与 A5 认知负荷共用。无副作用、无存储访问，可安全单元测试。
 * @ai-context: Computes rolling-window metrics from raw behavior signals
 * (keystrokes, deletions, route-switch timestamps), shared by A1 emotion
 * sensing and A5 cognitive load. Side-effect free and unit-testable.
 */
import type { EmotionLevel } from '../types';
import {
  TYPING_DROP_RATIO,
  DELETE_KEY_RATIO,
  STAGNATION_THRESHOLD_MS,
  EDIT_BURST_RATIO,
  SWITCH_BURST_COUNT,
} from '../constants';

/** 单次击键样本 */
export interface KeySample {
  /** 时间戳（ms） */
  t: number;
  /** 是否为删除类按键（Backspace/Delete） */
  isDelete: boolean;
}

/** 滚动行为窗口（调用方持有，本模块只读/返回新值） */
export interface BehaviorWindow {
  keys: KeySample[];
  /** 路由切换时间戳列表 */
  routeSwitches: number[];
  /** 最近一次击键时间（null = 窗口内无击键） */
  lastKeyAt: number | null;
}

/** 窗口指标快照 */
export interface BehaviorMetrics {
  /** 窗口内击键速率（次/分钟） */
  keyRatePerMin: number;
  /** 删除键占总击键比例（0-1） */
  deleteRatio: number;
  /** 距最近一次击键的时长（ms）；无击键为 Infinity */
  silenceMs: number;
  /** 编辑爆发比：相邻击键间隔 <500ms 的比例（0-1） */
  burstRatio: number;
  /** 窗口内路由切换次数 */
  switchCount: number;
}

/** 击键间隔小于此值视为"编辑爆发"（ms） */
const BURST_GAP_MS = 500;

/** 创建空行为窗口 */
export function createBehaviorWindow(): BehaviorWindow {
  return { keys: [], routeSwitches: [], lastKeyAt: null };
}

/**
 * 裁剪窗口：剔除 windowMs 之外的旧样本，返回新窗口（不改原对象）。
 */
export function pruneWindow(win: BehaviorWindow, now: number, windowMs: number): BehaviorWindow {
  const cutoff = now - windowMs;
  return {
    keys: win.keys.filter(k => k.t >= cutoff),
    routeSwitches: win.routeSwitches.filter(t => t >= cutoff),
    lastKeyAt: win.lastKeyAt,
  };
}

/**
 * 由窗口计算指标快照。
 */
export function computeMetrics(win: BehaviorWindow, now: number): BehaviorMetrics {
  const total = win.keys.length;
  const deletes = win.keys.filter(k => k.isDelete).length;

  let burstGaps = 0;
  for (let i = 1; i < total; i++) {
    if (win.keys[i].t - win.keys[i - 1].t < BURST_GAP_MS) burstGaps++;
  }
  const gapCount = Math.max(total - 1, 0);

  // 窗口实际跨度：用首个样本到 now 的时长归一化速率，避免窗口未填满时速率虚高
  const spanMs = total > 0 ? Math.max(now - win.keys[0].t, 1000) : 0;

  return {
    keyRatePerMin: total > 0 ? (total / spanMs) * 60000 : 0,
    deleteRatio: total > 0 ? deletes / total : 0,
    silenceMs: win.lastKeyAt === null ? Infinity : now - win.lastKeyAt,
    burstRatio: gapCount > 0 ? burstGaps / gapCount : 0,
    switchCount: win.routeSwitches.length,
  };
}

/**
 * 打字速度骤降比例：(baseline - current) / baseline，限定 [0,1]。
 * baseline 无效（<=0）时返回 0（无法判定骤降）。
 */
export function typingDropRatio(currentRate: number, baselineRate: number): number {
  if (baselineRate <= 0) return 0;
  return Math.min(1, Math.max(0, (baselineRate - currentRate) / baselineRate));
}

/** A1 评估入参 */
export interface EmotionAssessInput {
  metrics: BehaviorMetrics;
  /** 打字骤降比例（typingDropRatio 计算结果） */
  dropRatio: number;
  /** 应用是否处于可输入场景（焦点在编辑器/输入框） */
  hasInputFocus: boolean;
}

/**
 * A1 情绪困扰分级评估（纯函数）。
 * 分级规则（逐级升级，取最高命中级）：
 * - 3 重度：有输入焦点但长时间完全停滞（写不出）
 * - 2 中度：删除键占比过高（反复推翻自己）
 * - 1 轻度：打字速度骤降（节奏明显放缓）
 * 无命中返回 null（无需干预）。
 */
export function assessEmotionLevel(input: EmotionAssessInput): EmotionLevel | null {
  const { metrics, dropRatio, hasInputFocus } = input;
  if (!hasInputFocus) return null; // 不在输入场景，行为信号不适用
  // 停滞仅对"打过字后写不出"生效；silenceMs=Infinity（从未击键，
  // 可能只是在阅读）不构成困扰信号
  if (metrics.silenceMs !== Infinity && metrics.silenceMs >= STAGNATION_THRESHOLD_MS) return 3;
  if (metrics.deleteRatio >= DELETE_KEY_RATIO && metrics.keyRatePerMin > 0) return 2;
  if (dropRatio >= TYPING_DROP_RATIO && metrics.keyRatePerMin > 0) return 1;
  return null;
}

/**
 * A5 瞬时认知负荷原始分（0-100，纯函数）。
 * 三信号加权：高频切换（任务跳跃）+ 编辑爆发（高强度输出）+ 高删除比（反复修正）。
 * 最终平滑与迟滞由 cognitiveLoad.ts 的 EMA 模型负责。
 */
export function instantLoadScore(metrics: BehaviorMetrics): number {
  const switchScore = Math.min(1, metrics.switchCount / SWITCH_BURST_COUNT);
  const burstScore = metrics.burstRatio >= EDIT_BURST_RATIO ? 1 : metrics.burstRatio / EDIT_BURST_RATIO;
  const reviseScore = Math.min(1, metrics.deleteRatio / DELETE_KEY_RATIO);
  // 权重：切换 0.4 / 爆发 0.35 / 修正 0.25（切换是负荷外溢的最强信号）
  return Math.round((switchScore * 0.4 + burstScore * 0.35 + reviseScore * 0.25) * 100);
}
