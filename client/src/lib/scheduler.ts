/**
 * 调度策略模块 — 策略模式
 *
 * 提供 SchedulingStrategy 统一接口，SM2Strategy 和 FSRSStrategy 两个实现。
 * 通过 schedulingFactory.ts 的 getScheduler() 获取当前激活的策略实例。
 */

import {
  sm2,
  createNewCardState,
  calculateIntervals,
  Rating,
  type SM2CardInput,
  type SM2Result,
  type IntervalPreview,
} from './sm2';
import {
  fsrs,
  createNewFSRSState,
  calculateFSRSIntervals,
  type FSRSCardInput,
  type FSRSResult,
} from './fsrs';

// ---------------------------------------------------------------------------
// 统一类型
// ---------------------------------------------------------------------------

/** 卡片状态输入（SM-2 与 FSRS 字段的并集） */
export type CardInput = SM2CardInput & Partial<FSRSCardInput>;

/** 调度结果（SM-2 与 FSRS 字段的并集） */
export interface ScheduleResult {
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: Date;
  lapses: number;
  /** FSRS 专属：stability（SM-2 时为 undefined） */
  stability?: number;
  /** FSRS 专属：difficulty（SM-2 时为 undefined） */
  difficulty?: number;
}

/** 间隔预览（复用 SM-2 的 IntervalPreview） */
export type { IntervalPreview };

// ---------------------------------------------------------------------------
// 策略接口
// ---------------------------------------------------------------------------

/** 调度策略接口 */
export interface SchedulingStrategy {
  /** 算法名称标识 */
  readonly name: 'sm2' | 'fsrs';
  /** 对卡片评分并计算下次复习时间 */
  review(card: CardInput, rating: Rating): ScheduleResult;
  /** 创建新卡片初始状态 */
  createNew(): ScheduleResult;
  /** 四按钮间隔预览 */
  preview(card: CardInput): IntervalPreview;
}

// ---------------------------------------------------------------------------
// SM-2 策略
// ---------------------------------------------------------------------------

export class SM2Strategy implements SchedulingStrategy {
  readonly name = 'sm2' as const;

  review(card: CardInput, rating: Rating): ScheduleResult {
    const result: SM2Result = sm2(
      {
        easeFactor: card.easeFactor,
        interval: card.interval,
        repetitions: card.repetitions,
        lapses: card.lapses,
      },
      rating,
    );
    return {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      dueDate: result.dueDate,
      lapses: result.lapses,
    };
  }

  createNew(): ScheduleResult {
    const state = createNewCardState();
    return {
      easeFactor: state.easeFactor,
      interval: state.interval,
      repetitions: state.repetitions,
      dueDate: state.dueDate,
      lapses: state.lapses,
    };
  }

  preview(card: CardInput): IntervalPreview {
    return calculateIntervals({
      easeFactor: card.easeFactor,
      interval: card.interval,
      repetitions: card.repetitions,
      lapses: card.lapses,
    });
  }
}

// ---------------------------------------------------------------------------
// FSRS 策略
// ---------------------------------------------------------------------------

export class FSRSStrategy implements SchedulingStrategy {
  readonly name = 'fsrs' as const;

  review(card: CardInput, rating: Rating): ScheduleResult {
    const result: FSRSResult = fsrs(
      {
        easeFactor: card.easeFactor,
        interval: card.interval,
        repetitions: card.repetitions,
        lapses: card.lapses,
        stability: card.stability,
        difficulty: card.difficulty,
        lastReview: card.lastReview,
      },
      rating,
    );
    return {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      dueDate: result.dueDate,
      lapses: result.lapses,
      stability: result.stability,
      difficulty: result.difficulty,
    };
  }

  createNew(): ScheduleResult {
    const state = createNewFSRSState();
    return {
      easeFactor: state.easeFactor,
      interval: state.interval,
      repetitions: state.repetitions,
      dueDate: state.dueDate,
      lapses: state.lapses,
      stability: state.stability,
      difficulty: state.difficulty,
    };
  }

  preview(card: CardInput): IntervalPreview {
    return calculateFSRSIntervals({
      easeFactor: card.easeFactor,
      interval: card.interval,
      repetitions: card.repetitions,
      lapses: card.lapses,
      stability: card.stability,
      difficulty: card.difficulty,
      lastReview: card.lastReview,
    });
  }
}
