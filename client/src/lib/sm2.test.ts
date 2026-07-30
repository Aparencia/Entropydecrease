/**
 * SM-2 goldenError 系数扩展单元测试
 */
import { describe, it, expect } from 'vitest';
import { sm2, Rating, createNewCardState, calculateIntervals, type SM2CardInput } from './sm2';

describe('sm2 goldenErrorMultiplier', () => {
  const card: SM2CardInput = {
    easeFactor: 2.5,
    interval: 10,
    repetitions: 3,
    lapses: 0,
  };

  it('不传 options 时行为不变（向后兼容）', () => {
    const result = sm2(card, Rating.Good);
    const result2 = sm2(card, Rating.Good);
    // 无 options 与 options={} 结果一致
    const result3 = sm2(card, Rating.Good, {});
    expect(result.interval).toBe(result2.interval);
    expect(result.interval).toBe(result3.interval);
  });

  it('goldenErrorMultiplier=0.5 时将间隔缩短一半', () => {
    const normal = sm2(card, Rating.Good);
    const golden = sm2(card, Rating.Good, { goldenErrorMultiplier: 0.5 });
    expect(golden.interval).toBe(Math.max(1, Math.round(normal.interval * 0.5)));
    expect(golden.interval).toBeLessThan(normal.interval);
  });

  it('goldenErrorMultiplier=0 时间隔最小为 1', () => {
    const golden = sm2(card, Rating.Good, { goldenErrorMultiplier: 0 });
    expect(golden.interval).toBe(1);
  });

  it('goldenErrorMultiplier=1.0 时与不传无区别', () => {
    const normal = sm2(card, Rating.Easy);
    const golden = sm2(card, Rating.Easy, { goldenErrorMultiplier: 1.0 });
    // multiplier=1.0 不满足 <1 的条件，不应用
    expect(golden.interval).toBe(normal.interval);
  });

  it('goldenErrorMultiplier 不影响 Again 评分（间隔已是 1）', () => {
    const normal = sm2(card, Rating.Again);
    const golden = sm2(card, Rating.Again, { goldenErrorMultiplier: 0.5 });
    // Again 后间隔本来就是 1，再乘 0.5 后仍为 max(1, round(0.5))=1
    expect(normal.interval).toBe(1);
    expect(golden.interval).toBe(1);
  });

  it('goldenErrorMultiplier 不影响 EF 和 repetitions', () => {
    const normal = sm2(card, Rating.Good);
    const golden = sm2(card, Rating.Good, { goldenErrorMultiplier: 0.3 });
    // EF 和 reps 不受 multiplier 影响
    expect(golden.easeFactor).toBe(normal.easeFactor);
    expect(golden.repetitions).toBe(normal.repetitions);
    expect(golden.lapses).toBe(normal.lapses);
  });
});

describe('calculateIntervals 支持 options', () => {
  const card: SM2CardInput = {
    easeFactor: 2.5,
    interval: 10,
    repetitions: 3,
    lapses: 0,
  };

  it('传入 goldenErrorMultiplier 时所有间隔都受影响', () => {
    const normal = calculateIntervals(card);
    const golden = calculateIntervals(card, { goldenErrorMultiplier: 0.5 });
    // Good 和 Easy 的间隔应该缩短
    expect(golden.good).toBeLessThan(normal.good);
    expect(golden.easy).toBeLessThan(normal.easy);
  });
});

describe('sm2 基础行为（向后兼容）', () => {
  it('新卡片 Good 回答后间隔为 1', () => {
    const card = { easeFactor: 2.5, interval: 0, repetitions: 0, lapses: 0 };
    const result = sm2(card, Rating.Good);
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
  });

  it('第二次 Good 回答后间隔为 6', () => {
    const card = { easeFactor: 2.5, interval: 1, repetitions: 1, lapses: 0 };
    const result = sm2(card, Rating.Good);
    expect(result.repetitions).toBe(2);
    expect(result.interval).toBe(6);
  });

  it('Again 回答重置连续正确次数', () => {
    const card = { easeFactor: 2.5, interval: 10, repetitions: 5, lapses: 1 };
    const result = sm2(card, Rating.Again);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.lapses).toBe(2);
  });

  it('createNewCardState 返回正确的初始值', () => {
    const state = createNewCardState();
    expect(state.easeFactor).toBe(2.5);
    expect(state.interval).toBe(0);
    expect(state.repetitions).toBe(0);
    expect(state.lapses).toBe(0);
  });
});
