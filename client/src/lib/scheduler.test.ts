/**
 * 调度策略模块单元测试
 * Unit tests for the scheduling strategy module
 *
 * @ai-context: 覆盖难度阶梯 suggestDifficultyTier 全部分支（失误降级/记忆
 * 不足/间隔升档）与 SM2/FSRS 双策略的 review/createNew/preview 三方法。
 * 底层 sm2/fsrs 已有独立测试，此处验证策略包装层透传与字段完整性。
 * @ai-context: Covers all suggestDifficultyTier branches plus the
 * SM2/FSRS strategy wrappers (review/createNew/preview). The underlying
 * algorithms have their own tests; this verifies the wrapper layer.
 */
import { describe, it, expect } from 'vitest';
import { SM2Strategy, FSRSStrategy, suggestDifficultyTier, TIER_UP_INTERVAL_DAYS, MASTER_INTERVAL_DAYS, TIER_DOWN_LAPSES } from './scheduler';
import { Rating } from './sm2';

describe('suggestDifficultyTier', () => {
  it('should force basic when lapses reach the downgrade threshold', () => {
    // Arrange：间隔很大但失误过多 → 稳定性优先
    const card = { interval: 100, repetitions: 10, lapses: TIER_DOWN_LAPSES, difficulty: 3 };
    // Act/Assert
    expect(suggestDifficultyTier(card)).toBe('basic');
    expect(suggestDifficultyTier({ ...card, lapses: 99 })).toBe('basic');
  });

  it('should force basic before 3 repetitions', () => {
    expect(suggestDifficultyTier({ interval: 100, repetitions: 2, lapses: 0, difficulty: 3 })).toBe('basic');
    expect(suggestDifficultyTier({ interval: 100, repetitions: 0, lapses: 0, difficulty: 3 })).toBe('basic');
  });

  it('should suggest master beyond the master interval', () => {
    expect(suggestDifficultyTier({ interval: MASTER_INTERVAL_DAYS + 1, repetitions: 5, lapses: 0, difficulty: 2 })).toBe('master');
  });

  it('should suggest challenge beyond the tier-up interval', () => {
    expect(suggestDifficultyTier({ interval: TIER_UP_INTERVAL_DAYS + 1, repetitions: 3, lapses: 0, difficulty: 3 })).toBe('challenge');
    expect(suggestDifficultyTier({ interval: 30, repetitions: 4, lapses: 0, difficulty: 3 })).toBe('challenge');
  });

  it('should stay basic below thresholds', () => {
    expect(suggestDifficultyTier({ interval: 1, repetitions: 3, lapses: 0, difficulty: 3 })).toBe('basic');
    expect(suggestDifficultyTier({ interval: TIER_UP_INTERVAL_DAYS, repetitions: 3, lapses: 0, difficulty: 3 })).toBe('basic');
  });

  it('should tolerate non-numeric fields via Number coercion', () => {
    // 防御分支：缺失/非法字段按 0 处理 → basic
    expect(suggestDifficultyTier({ interval: Number.NaN, repetitions: 0, lapses: 0, difficulty: 3 })).toBe('basic');
    expect(suggestDifficultyTier({} as never)).toBe('basic');
  });
});

describe('SM2Strategy', () => {
  const strategy = new SM2Strategy();

  it('should expose the sm2 name', () => {
    expect(strategy.name).toBe('sm2');
  });

  it('should review a card and produce a full schedule result', () => {
    // Arrange
    const card = { easeFactor: 2.5, interval: 10, repetitions: 2, lapses: 0 };
    // Act
    const result = strategy.review(card, Rating.Good);
    // Assert：SM-2 语义——第三次正确，间隔 = 10 × EF(2.5) = 25 天
    expect(result.interval).toBe(25);
    expect(result.repetitions).toBe(3);
    expect(result.easeFactor).toBe(2.5);
    expect(result.lapses).toBe(0);
    expect(result.dueDate).toBeInstanceOf(Date);
    expect(result.stability).toBeUndefined();
  });

  it('should reset on Again and count a lapse', () => {
    const result = strategy.review({ easeFactor: 2.5, interval: 10, repetitions: 2, lapses: 1 }, Rating.Again);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.lapses).toBe(2);
  });

  it('should create a new card state', () => {
    const state = strategy.createNew();
    expect(state).toMatchObject({ easeFactor: 2.5, interval: 0, repetitions: 0, lapses: 0 });
    expect(state.dueDate).toBeInstanceOf(Date);
  });

  it('should preview intervals for all four ratings', () => {
    const preview = strategy.preview({ easeFactor: 2.5, interval: 10, repetitions: 2, lapses: 0 });
    expect(preview.again).toBe(1);
    expect(preview.good).toBe(25);
    expect(preview.hard).toBeGreaterThanOrEqual(1);
    expect(preview.easy).toBeGreaterThanOrEqual(preview.good);
  });
});

describe('FSRSStrategy', () => {
  const strategy = new FSRSStrategy();

  it('should expose the fsrs name', () => {
    expect(strategy.name).toBe('fsrs');
  });

  it('should review a card with existing FSRS state', () => {
    // Arrange：已有 stability/difficulty 的卡片
    const card = {
      easeFactor: 2.5, interval: 10, repetitions: 2, lapses: 0,
      stability: 10, difficulty: 5, lastReview: new Date(2026, 0, 1),
    };
    // Act
    const result = strategy.review(card, Rating.Good);
    // Assert：FSRS 字段完整性
    expect(result.interval).toBeGreaterThanOrEqual(1);
    expect(result.repetitions).toBe(3);
    expect(result.stability).toBeGreaterThan(0);
    expect(result.difficulty).toBeGreaterThanOrEqual(1);
    expect(result.difficulty).toBeLessThanOrEqual(10);
    expect(result.dueDate).toBeInstanceOf(Date);
  });

  it('should lazily initialize FSRS from SM-2 history', () => {
    const result = strategy.review({ easeFactor: 2.5, interval: 10, repetitions: 2, lapses: 0 }, Rating.Good);
    expect(result.stability).toBeGreaterThan(0);
    expect(result.difficulty).toBeGreaterThan(0);
  });

  it('should create a new FSRS state', () => {
    const state = strategy.createNew();
    expect(state).toMatchObject({ interval: 0, repetitions: 0, lapses: 0, stability: 0, difficulty: 0 });
    expect(state.dueDate).toBeInstanceOf(Date);
  });

  it('should preview intervals for all four ratings', () => {
    const preview = strategy.preview({ easeFactor: 2.5, interval: 1, repetitions: 1, lapses: 0 });
    expect(preview.again).toBeGreaterThanOrEqual(1);
    expect(preview.good).toBeGreaterThanOrEqual(preview.hard);
    expect(preview.easy).toBeGreaterThanOrEqual(preview.good);
  });
});
