/**
 * 学习会话纯函数测试
 *
 * @ai-context: 覆盖 sessionMath（洗牌/黄金错误压缩/去重/会话组装）——
 * 从 useStudySessionStore 拆出的纯函数层（R3 拆分后新增，补足覆盖率）。
 * 纯函数测试，无 storage/network 依赖（countReviewsToday 依赖 storage，
 * 本文件不测该异步查询）。
 * @ai-context: Pure-function tests for session-math helpers extracted from
 * useStudySessionStore; no storage or network involved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shuffle, compressForGoldenError, dedupeCards, buildSessionCards } from './sessionMath';
import * as schedulingFactory from '@/lib/schedulingFactory';
import type { Flashcard } from '@/types/models';

const DAY_MS = 24 * 60 * 60 * 1000;

function card(over: Partial<Flashcard> & { id: string; dueDate: Date }): Flashcard {
  return {
    deckId: 'd1',
    front: '问题',
    back: '答案',
    type: 'basic',
    easeFactor: 2.5,
    interval: 10,
    repetitions: 3,
    lapses: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    order: 0,
    ...over,
  };
}

describe('shuffle', () => {
  it('should keep same elements (permutation)', () => {
    // Arrange
    const arr = [1, 2, 3, 4, 5];
    // Act
    const result = shuffle(arr);
    // Assert：元素集合不变、原数组不被修改
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });

  it('should return empty for empty input', () => {
    // Arrange/Act/Assert
    expect(shuffle([])).toEqual([]);
  });

  it('should return copy (not same reference)', () => {
    // Arrange
    const arr = [1, 2, 3];
    // Act
    const result = shuffle(arr);
    // Assert
    expect(result).not.toBe(arr);
  });
});

describe('compressForGoldenError', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  it('should cap interval to 1 day', () => {
    // Arrange：调度给出 30 天间隔
    const due = new Date(now.getTime() + 30 * DAY_MS);
    // Act
    const r = compressForGoldenError(due, 30, now);
    // Assert：interval 封顶 1
    expect(r.interval).toBe(1);
    expect(r.dueDate.getTime()).toBeLessThanOrEqual(now.getTime() + DAY_MS);
  });

  it('should keep short interval unchanged', () => {
    // Arrange：间隔已 ≤1 天
    const due = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    // Act
    const r = compressForGoldenError(due, 0, now);
    // Assert：原样保留（dueDate 未超过 maxDue，interval 取 min）
    expect(r.interval).toBe(0);
    expect(r.dueDate).toEqual(due);
  });
});

describe('dedupeCards', () => {
  it('should remove duplicate ids', () => {
    // Arrange
    const a = card({ id: 'a', dueDate: new Date(0) });
    const b = card({ id: 'b', dueDate: new Date(0) });
    // Act
    const r = dedupeCards([a, b, a]);
    // Assert
    expect(r.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('should respect inherited ids (due list exclusion)', () => {
    // Arrange：inheritIds 含 a（已在到期列表）
    const a = card({ id: 'a', dueDate: new Date(0) });
    const b = card({ id: 'b', dueDate: new Date(0) });
    // Act
    const r = dedupeCards([a, b], new Set(['a']));
    // Assert：a 被继承集合排除
    expect(r.map((c) => c.id)).toEqual(['b']);
  });
});

describe('buildSessionCards', () => {
  const now = new Date('2026-08-15T12:00:00Z');
  const dueOld = (id: string) => card({ id, dueDate: new Date(now.getTime() - DAY_MS) });
  const brandNew = (id: string) => card({ id, dueDate: now, repetitions: 0 });

  beforeEach(() => {
    // 默认限额（与 schedulingFactory 默认一致）：每日复习 80、新卡 20、会话 20
    vi.spyOn(schedulingFactory, 'getMaxReviewsPerDay').mockReturnValue(80);
    vi.spyOn(schedulingFactory, 'getMaxNewCardsPerDay').mockReturnValue(20);
    vi.spyOn(schedulingFactory, 'getMaxSessionCards').mockReturnValue(20);
  });

  it('should return empty when daily review quota exhausted', () => {
    // Arrange：今日已复习 80（额度用尽）
    const cards = [dueOld('a')];
    // Act
    const r = buildSessionCards({ allCards: cards, reviewsToday: 80, newCardsStartedToday: 0, now });
    // Assert
    expect(r).toEqual([]);
  });

  it('should use only due cards when enough (>=10)', () => {
    // Arrange：12 张到期卡 + 1 张新卡
    const due = Array.from({ length: 12 }, (_, i) => dueOld(`d${i}`));
    const n = brandNew('n1');
    // Act
    const r = buildSessionCards({ allCards: [...due, n], reviewsToday: 0, newCardsStartedToday: 0, now });
    // Assert：只用到期卡（不含新卡）
    expect(r.length).toBe(12);
    expect(r.some((c) => c.repetitions === 0)).toBe(false);
  });

  it('should top up new cards when due cards insufficient', () => {
    // Arrange：3 张到期卡 + 5 张新卡（不足 10 阈值 → 补充新卡）
    const due = [dueOld('d1'), dueOld('d2'), dueOld('d3')];
    const news = Array.from({ length: 5 }, (_, i) => brandNew(`n${i}`));
    // Act
    const r = buildSessionCards({ allCards: [...due, ...news], reviewsToday: 0, newCardsStartedToday: 0, now });
    // Assert：到期卡 + 补充新卡（总量 min(20, 80)=8）
    expect(r.length).toBe(8);
  });

  it('should respect limit (F3 mini review)', () => {
    // Arrange：12 张到期卡，limit 5
    const due = Array.from({ length: 12 }, (_, i) => dueOld(`d${i}`));
    // Act
    const r = buildSessionCards({ allCards: due, reviewsToday: 0, newCardsStartedToday: 0, now, limit: 5 });
    // Assert
    expect(r.length).toBe(5);
  });

  it('should respect remaining new-card quota', () => {
    // Arrange：3 张到期卡 + 5 张新卡，但今日新卡额度只剩 2
    const due = [dueOld('d1'), dueOld('d2'), dueOld('d3')];
    const news = Array.from({ length: 5 }, (_, i) => brandNew(`n${i}`));
    // Act
    const r = buildSessionCards({ allCards: [...due, ...news], reviewsToday: 0, newCardsStartedToday: 18, now });
    // Assert：3 到期 + 2 新卡（额度限制）
    expect(r.length).toBe(5);
    expect(r.filter((c) => c.repetitions === 0).length).toBe(2);
  });

  it('should exclude not-yet-due cards', () => {
    // Arrange：1 张到期 + 1 张未到期 + 1 张新卡
    const future = card({ id: 'future', dueDate: new Date(now.getTime() + DAY_MS) });
    // Act
    const r = buildSessionCards({ allCards: [dueOld('due'), future, brandNew('new')], reviewsToday: 0, newCardsStartedToday: 0, now });
    // Assert：未到期卡不入选
    expect(r.some((c) => c.id === 'future')).toBe(false);
  });
});
