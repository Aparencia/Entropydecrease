/**
 * SM-2 间隔重复算法模块
 *
 * Rating 枚举值 0-3 对应 Again/Hard/Good/Easy
 * FlashcardReview.rating 字段使用 1-4，调用方需做 +1 映射
 *
 * @ai-context: 经典 SuperMemo SM-2 算法实现，与 fsrs.ts 通过 scheduler.ts
 * 策略模式并存。间隔上限 1825 天（5年）；Hard 惩罚 ×0.6、Easy 奖励 ×1.3
 * 为本项目自定义扩展（非原版 SM-2），修改会改变全体用户的复习节奏。
 * @ai-context: 全部为纯函数，时间基准可通过 SM2Options.now 注入（测试用），
 * 未注入时使用当前时间。无任何 I/O 副作用，可安全重构。
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 用户评分枚举：Again(0) / Hard(1) / Good(2) / Easy(3) */
export const Rating = {
  Again: 0,
  Hard: 1,
  Good: 2,
  Easy: 3,
} as const;
export type Rating = (typeof Rating)[keyof typeof Rating];

/** SM-2 算法计算结果 */
export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: Date;
  lapses: number;
}

/** SM-2 算法所需的卡片状态输入（Flashcard 兼容子集） */
export interface SM2CardInput {
  easeFactor: number;
  interval: number;
  repetitions: number;
  lapses?: number;
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 在当前日期基础上增加指定天数，返回新 Date */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** 将 Rating 枚举映射为 SM-2 原始 quality 分数 (1-5) */
function toQuality(rating: Rating): number {
  // Again→1, Hard→3, Good→4, Easy→5
  const map: Record<Rating, number> = {
    0: 1,  // Again
    1: 3,  // Hard
    2: 4,  // Good
    3: 5,  // Easy
  };
  return map[rating];
}

// ---------------------------------------------------------------------------
// 核心算法
// ---------------------------------------------------------------------------

/** SM-2 算法可选参数 */
export interface SM2Options {
  /**
   * Golden error 间隔系数
   * 当用户高自信答错时，将计算出的间隔乘以该系数（缩短复习间隔）
   * 默认 1.0（不调整），建议值 0.3-0.7
   */
  goldenErrorMultiplier?: number;
  /**
   * 时间基准注入（测试用）
   * 未指定时使用 new Date()，与 fsrs() 的 now 参数保持对称设计
   */
  now?: Date;
}

/**
 * SM-2 核心计算函数
 *
 * @param card   当前卡片的 SM-2 状态字段
 * @param rating 用户评分（Rating 枚举，0-3）
 * @param options 可选参数（如 goldenErrorMultiplier、now）
 * @returns 更新后的 SM-2 状态
 */
export function sm2(card: SM2CardInput, rating: Rating, options?: SM2Options): SM2Result {
  const q = toQuality(rating);
  const lapses = card.lapses ?? 0;

  // 更新难度因子（EF）
  let newEF =
    card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  newEF = Math.max(newEF, 1.3);

  let newInterval: number;
  let newReps: number;
  let newLapses = lapses;

  if (rating === Rating.Again) {
    // 答错：重置连续正确次数，间隔归 1 天，累计失误
    newReps = 0;
    newInterval = 1;
    newLapses += 1;
  } else if (card.repetitions === 0) {
    // 第一次正确回答
    newReps = 1;
    newInterval = 1;
  } else if (card.repetitions === 1) {
    // 第二次正确回答
    newReps = 2;
    newInterval = 6;
  } else {
    // 后续正确回答：间隔 = 上次间隔 × EF
    newReps = card.repetitions + 1;
    newInterval = Math.round(card.interval * newEF);
  }

  // Hard 惩罚：间隔缩短 40%
  if (rating === Rating.Hard) {
    newInterval = Math.max(1, Math.round(newInterval * 0.6));
  }

  // Easy 奖励：间隔延长 30%
  if (rating === Rating.Easy) {
    newInterval = Math.round(newInterval * 1.3);
  }

  // 上限 5 年（1825 天）
  newInterval = Math.min(newInterval, 1825);

  // Golden error：高自信答错时缩短间隔
  const multiplier = options?.goldenErrorMultiplier;
  // 下界取 >= 0：传 0 表示尽可能缩短，经 Math.max 收敛到最小间隔 1 天；
  // 上界仍为 < 1，因 1.0 的语义就是不调整
  if (multiplier !== undefined && multiplier >= 0 && multiplier < 1) {
    newInterval = Math.max(1, Math.round(newInterval * multiplier));
  }

  return {
    easeFactor: newEF,
    interval: newInterval,
    repetitions: newReps,
    dueDate: addDays(options?.now ?? new Date(), newInterval),
    lapses: newLapses,
  };
}

// ---------------------------------------------------------------------------
// 工厂函数
// ---------------------------------------------------------------------------

/** 创建新卡片的初始 SM-2 状态 */
export function createNewCardState(): SM2Result {
  return {
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    dueDate: new Date(),
    lapses: 0,
  };
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 四个评分对应间隔天数的预览结果（用于 UI 按钮显示） */
export interface IntervalPreview {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

/**
 * 计算四个评分各自对应的间隔天数（不修改任何状态）
 *
 * @param card 当前卡片的 SM-2 状态字段
 * @returns 四个评分对应的间隔天数
 */
export function calculateIntervals(card: SM2CardInput, options?: SM2Options): IntervalPreview {
  const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
  const results = ratings.map((r) => sm2(card, r, options));

  return {
    again: results[0].interval,
    hard: results[1].interval,
    good: results[2].interval,
    easy: results[3].interval,
  };
}
