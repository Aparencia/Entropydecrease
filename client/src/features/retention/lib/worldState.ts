/**
 * 世界状态派生层（宪法 P1 · 数据接线）
 * World state derivation layer (constitution P1 · data wiring)
 *
 * @ai-context: 从留存引擎（珊瑚/发现）数据派生熵可视化单范式所需的世界信号集。
 * 纯函数、无副作用、可单测。所有输出遵循《熵可视化设计宪法》第一条映射表
 * 与第二条焦虑防线：vitality→发光体亮度、mist→混沌雾（上限 0.4）、
 * depthNorm→地质层、firefly→萤火数量、warmth→洋流温度。
 * 留存关闭时返回中性信号（第二条 §5 可关闭性：纯净亮度映射，无雾）。
 *
 * @ai-context: Derives world signals for the entropy-visualization paradigm
 * from retention engine data (corals/discoveries). Pure, testable, bounded
 * by the design constitution's mapping table and anxiety-defense limits.
 */

import type { CoralRecord } from '../types';

/** 归一化锚点（世界饱和度常量） / Normalization anchors */
export const WORLD_ANCHORS = {
  /** 地质层满饱和的累计深度（米） / Depth where strata saturate */
  DEPTH_FULL: 2000,
  /** 萤火密度满饱和的发现数 / Discoveries where firefly density saturates */
  FIREFLY_FULL: 20,
  /** 洋流温度满饱和的连击天数 / Streak days where warmth saturates */
  STREAK_FULL: 7,
  /** 混沌雾最大强度（宪法第二条 §1：≤40%） / Max mist per constitution */
  MIST_MAX: 0.4,
  /** 冷启动基底雾（宪法第七条：未点亮的混沌，非空白） / Cold-start base mist */
  MIST_COLD_START: 0.12,
  /** 冷启动世界活力中性值 / Cold-start neutral vitality */
  VITALITY_COLD_START: 0.55,
} as const;

/** 派生输入：全部来自 retention 引擎存量 / Inputs from existing retention stores */
export interface WorldSignalInput {
  corals: CoralRecord[];
  totalDepth: number;
  discoveriesCount: number;
  currentStreak: number;
  /** 留存总开关：关闭→中性信号（纯净亮度映射） / Master toggle off → neutral */
  enabled: boolean;
}

/** 世界信号集：每个字段只映射一个学习变量（宪法第一条） / One signal = one variable */
export interface WorldSignals {
  /** 世界活力 0–1：健康珊瑚占比 → 发光体亮度 / Healthy coral ratio → glow */
  vitality: number;
  /** 混沌雾强度 0–0.4：白化占比 → 遗忘（熵增） / Bleached ratio → mist */
  mist: number;
  /** 地质层规模 0–1：累计深度归一 / Cumulative depth normalized */
  depthNorm: number;
  /** 萤火密度 0–1：发现数归一 / Discovery count normalized */
  firefly: number;
  /** 洋流温度 0–1：连击归一 / Streak normalized */
  warmth: number;
  /** 留存是否开启 / Retention enabled flag */
  enabled: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * 从珊瑚种植日期派生当前连击天数 / Derive current streak from coral plant dates
 *
 * @ai-context 与 DashboardPage 的 StreakState 构建口径一致（复用珊瑚数据、
 * 无额外存储）：按日期去重倒序，从最近日期向前逐日检查，遇间隔即止。
 * 洋流休息日机制由 streakEngine 在展示层处理，此处只算原始连击。
 */
export function computeCurrentStreakFromCorals(corals: CoralRecord[]): number {
  if (corals.length === 0) return 0;
  const uniqueDays = [...new Set(
    corals.map((c) => new Date(c.plantedAt).toISOString().split('T')[0]),
  )].sort().reverse();

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]).getTime();
    const curr = new Date(uniqueDays[i]).getTime();
    if ((prev - curr) / 86_400_000 === 1) streak++;
    else break;
  }
  return streak;
}

/**
 * 派生世界信号集 / Derive the world signal set
 *
 * @ai-context 奖赏回来原则：白化珊瑚映射为"朦胧雾"而非消亡——
 * 雾永远可拨开，复习（新的种植）即恢复。无任何负向输出语义。
 */
export function deriveWorldSignals(input: WorldSignalInput): WorldSignals {
  const { corals, totalDepth, discoveriesCount, currentStreak, enabled } = input;
  const depthNorm = clamp01(totalDepth / WORLD_ANCHORS.DEPTH_FULL);
  const firefly = clamp01(discoveriesCount / WORLD_ANCHORS.FIREFLY_FULL);
  const warmth = clamp01(currentStreak / WORLD_ANCHORS.STREAK_FULL);

  // 焦虑防线 §5：用户关闭留存/混沌雾渲染 → 纯净亮度映射，无雾
  if (!enabled) {
    return { vitality: 1, mist: 0, depthNorm, firefly: 0, warmth: 0, enabled: false };
  }

  // 冷启动：未点亮的混沌世界（宪法第七条）——中性活力 + 薄雾，暗示可能性
  if (corals.length === 0) {
    return {
      vitality: WORLD_ANCHORS.VITALITY_COLD_START,
      mist: WORLD_ANCHORS.MIST_COLD_START,
      depthNorm: 0,
      firefly,
      warmth,
      enabled: true,
    };
  }

  const healthy = corals.filter((c) => c.health === 'healthy').length;
  // 白化是"暂停生长"而非消亡：占比映射为雾，上限被宪法锁死
  const bleachedRatio = 1 - healthy / corals.length;

  return {
    vitality: healthy / corals.length,
    mist: Math.min(WORLD_ANCHORS.MIST_MAX, bleachedRatio * WORLD_ANCHORS.MIST_MAX),
    depthNorm,
    firefly,
    warmth,
    enabled: true,
  };
}

/**
 * 世界活力 → 发光体辉光乘数 / Vitality → entity glow multiplier
 *
 * @ai-context 输出域 0.6–1.15：只调节明暗程度，永不低于可读下限，
 * 避免"暗淡=惩罚"的负向语义（奖赏回来原则）。
 */
export function vitalityToGlowScale(vitality: number): number {
  return 0.6 + clamp01(vitality) * 0.55;
}
