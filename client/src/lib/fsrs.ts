/**
 * FSRS-5 间隔重复算法模块
 *
 * 基于 Free Spaced Repetition Scheduler v5 论文实现。
 * 与 SM-2 同构的接口设计，支持策略模式热切换。
 *
 * Rating 枚举复用 sm2.ts 中的定义：Again(0) / Hard(1) / Good(2) / Easy(3)
 */

import { Rating, type IntervalPreview } from './sm2';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** FSRS 算法所需的卡片状态输入（扩展 SM2CardInput） */
export interface FSRSCardInput {
  easeFactor: number;
  interval: number;
  repetitions: number;
  lapses?: number;
  /** FSRS stability（记忆稳定性，天） */
  stability?: number;
  /** FSRS difficulty（记忆难度，1-10） */
  difficulty?: number;
  /** 上次复习时间 */
  lastReview?: Date;
}

/** FSRS 算法计算结果 */
export interface FSRSResult {
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: Date;
  lapses: number;
  stability: number;
  difficulty: number;
}

// ---------------------------------------------------------------------------
// FSRS-5 核心参数（参考 open-spaced-repetition/fsrs-rs）
// ---------------------------------------------------------------------------

/** 初始 difficulty 按 rating 索引：D0(G) = [4.3, 3.3, 2.6, 1.0] */
const D0 = [4.3, 3.3, 2.6, 1.0];

/** 初始 stability 按 rating 索引：S0(G) = [0.4, 0.6, 2.4, 9.0] */
const S0 = [0.4, 0.6, 2.4, 9.0];

/** 目标保留率 */
const REQUESTED_RETENTION = 0.9;

/** 衰减因子 */
const DECAY = -0.5;

/**
 * FSRS-5 的 19 个核心参数 w[0]-w[18]
 * 来自 open-spaced-repetition/fsrs-rs 默认参数
 */
const W = [
  0.4872,   // w[0]  — S0 相关
  1.4003,   // w[1]  — S0 相关
  3.7145,   // w[2]  — S0 相关
  13.8206,  // w[3]  — S0 相关
  5.1618,   // w[4]  — difficulty 相关
  1.2298,   // w[5]  — difficulty 相关
  0.8975,   // w[6]  — mean reversion weight (used in difficulty update)
  0.031,    // w[7]  — mean reversion weight (used in difficulty update)
  1.6474,   // w[8]  — stability after success
  0.1712,   // w[9]  — stability after success
  1.0872,   // w[10] — stability after success
  2.105,    // w[11] — stability after failure
  0.2571,   // w[12] — stability after failure
  0.5298,   // w[13] — stability after failure
  2.0613,   // w[14] — stability after failure
  0.2,      // w[15] — hard penalty
  2.8278,   // w[16] — easy bonus
  0.7846,   // w[17] — short-term stability
  0.2,      // w[18] — short-term stability
];

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 在当前日期基础上增加指定天数，返回新 Date */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 幂遗忘曲线：R(t, S) = (1 + t / (9 * S))^(-1)
 * 给定 elapsed days 和 stability，返回检索概率
 */
function retrievability(elapsed: number, stability: number): number {
  return Math.pow(1 + elapsed / (9 * stability), -1);
}

/**
 * 给定目标保留率 R 和 stability S，计算间隔天数
 * t = 9 * S * (R^(-1) - 1) → 简化：t = 9 * S * (1/R - 1)
 */
function intervalFromStability(stability: number, retention: number): number {
  return Math.max(1, Math.round(9 * stability * (1 / retention - 1)));
}

/**
 * 计算初始 difficulty（均值回归更新）
 * D' = w[7] * (D - w[6] * (D - D0(G))) + (1 - w[7]) * D
 * 简化：D' = D - w[7] * w[6] * (D - D0(G))
 */
function updateDifficulty(oldD: number, rating: Rating): number {
  const d0 = D0[rating];
  const newD = oldD - W[7] * (oldD - d0);
  // 限制在 [1, 10]
  return Math.max(1, Math.min(10, newD));
}

/**
 * 成功复习后 stability 增长
 * S' = S * (e^(w[8]*D) * e^(w[9]*S/S0 - 1) * (e^(w[10]*(1-R)) - 1) * hardPenalty * easyBonus + 1)
 */
function stabilityAfterSuccess(
  S: number, D: number, R: number, rating: Rating,
): number {
  const hardPenalty = rating === Rating.Hard ? W[15] : 1;
  const easyBonus = rating === Rating.Easy ? W[16] : 1;

  const factor =
    Math.exp(W[8] * D) *
    Math.exp(W[9] * (S / S0[rating]) - 1) *
    (Math.exp(W[10] * (1 - R)) - 1) *
    hardPenalty *
    easyBonus;

  return Math.max(0.1, S * (factor + 1));
}

/**
 * 失败复习后 stability（lapse）
 * S' = w[11] * D^(-w[12]) * ((S+1)^w[13] - 1) * e^(w[14]*(1-R))
 */
function stabilityAfterFailure(
  S: number, D: number, R: number,
): number {
  const newS =
    W[11] *
    Math.pow(D, -W[12]) *
    (Math.pow(S + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - R));
  return Math.max(0.1, Math.min(newS, S));
}

// ---------------------------------------------------------------------------
// 核心算法
// ---------------------------------------------------------------------------

/**
 * FSRS-5 核心调度函数
 *
 * @param card   当前卡片状态
 * @param rating 用户评分（Rating 枚举，0-3）
 * @param now    当前时间（默认 new Date()）
 * @returns 更新后的卡片状态
 */
export function fsrs(card: FSRSCardInput, rating: Rating, now?: Date): FSRSResult {
  const currentTime = now ?? new Date();
  const lapses = card.lapses ?? 0;

  // 惰性初始化 FSRS 参数
  let S: number;
  let D: number;

  if (card.stability != null && card.stability > 0) {
    S = card.stability;
    D = card.difficulty ?? D0[Rating.Good];
  } else {
    // 首次使用 FSRS：根据历史 interval 推算初始 stability
    if (card.interval > 0 && card.repetitions > 0) {
      // 已有 SM-2 历史：从 interval 反推 stability
      // interval ≈ 9 * S * (1/R - 1) → S = interval / (9 * (1/R - 1))
      S = card.interval / (9 * (1 / REQUESTED_RETENTION - 1));
      D = card.difficulty ?? D0[Rating.Good];
    } else {
      // 全新卡片：使用 S0
      S = S0[rating];
      D = D0[rating];

      // 全新卡片直接返回初始状态
      const interval = intervalFromStability(S, REQUESTED_RETENTION);
      return {
        easeFactor: card.easeFactor,
        interval,
        repetitions: rating === Rating.Again ? 0 : 1,
        dueDate: addDays(currentTime, interval),
        lapses,
        stability: S,
        difficulty: D,
      };
    }
  }

  // 计算自上次复习以来的经过天数
  const lastReview = card.lastReview ?? currentTime;
  const elapsedDays = Math.max(
    0,
    (currentTime.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24),
  );

  // 当前检索概率
  const R = retrievability(elapsedDays, S);

  // 更新 difficulty（均值回归）
  const newD = updateDifficulty(D, rating);

  // 计算新 stability
  let newS: number;
  let newReps: number;
  let newLapses = lapses;

  if (rating === Rating.Again) {
    // 失败：stability 衰减
    newS = stabilityAfterFailure(S, D, R);
    newReps = 0;
    newLapses += 1;
  } else {
    // 成功：stability 增长
    newS = stabilityAfterSuccess(S, D, R, rating);
    newReps = card.repetitions + 1;
  }

  // 从 stability 计算间隔天数
  const newInterval = intervalFromStability(newS, REQUESTED_RETENTION);

  // 上限 5 年（1825 天）
  const cappedInterval = Math.min(newInterval, 1825);

  return {
    easeFactor: card.easeFactor, // FSRS 不使用 easeFactor，保持兼容
    interval: cappedInterval,
    repetitions: newReps,
    dueDate: addDays(currentTime, cappedInterval),
    lapses: newLapses,
    stability: newS,
    difficulty: newD,
  };
}

// ---------------------------------------------------------------------------
// 工厂函数
// ---------------------------------------------------------------------------

/** 创建新卡片的初始 FSRS 状态 */
export function createNewFSRSState(): FSRSResult {
  return {
    easeFactor: 2.5, // 兼容 SM-2 字段
    interval: 0,
    repetitions: 0,
    dueDate: new Date(),
    lapses: 0,
    stability: 0, // 0 表示未初始化，首次复习时按 S0 赋值
    difficulty: 0, // 0 表示未初始化
  };
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 计算四个评分各自对应的间隔天数（不修改任何状态）
 */
export function calculateFSRSIntervals(card: FSRSCardInput): IntervalPreview {
  const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
  const results = ratings.map((r) => fsrs(card, r));

  return {
    again: results[0].interval,
    hard: results[1].interval,
    good: results[2].interval,
    easy: results[3].interval,
  };
}
