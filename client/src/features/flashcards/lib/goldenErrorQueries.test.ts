/**
 * 黄金错误聚合与恢复包纯函数测试
 *
 * @ai-context: 覆盖 summarizeGoldenErrors（统计聚合）与 recoveryPriority/
 * selectRecoveryCards（恢复包选择）——flashcards 模块此前零测试（2026-08 审计
 * R6），先补纯函数层（store/组件层随后）。
 * @ai-context: Pure-function tests for golden-error aggregation and recovery-pack
 * selection; no storage/network involved.
 */
import { describe, it, expect } from 'vitest';
import { summarizeGoldenErrors, type GoldenErrorRecord } from './goldenErrorQueries';
import { recoveryPriority, selectRecoveryCards, RECOVERY_PACK_SIZE } from './recoveryPack';
import type { Flashcard, FlashcardReview } from '@/types/models';

const DAY_MS = 24 * 60 * 60 * 1000;

function review(over: Partial<FlashcardReview> & { id: string; cardId: string; reviewedAt: Date }): FlashcardReview {
  return {
    deckId: 'd1',
    rating: 3,
    easeFactorBefore: 2.5,
    easeFactorAfter: 2.5,
    intervalBefore: 1,
    intervalAfter: 2,
    timeSpent: 5,
    ...over,
  } as FlashcardReview;
}

function record(over: Partial<GoldenErrorRecord> & { review: FlashcardReview }): GoldenErrorRecord {
  return {
    front: '问题',
    back: '答案',
    deckId: over.review.deckId, // 实现按 review.deckId 聚合，保持一致
    ...over,
  };
}

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

describe('summarizeGoldenErrors', () => {
  it('should aggregate total, byDeck and repeat offenders', () => {
    // Arrange：同卡两次黄金错误（重复）+ 另一卡一次
    const records = [
      record({ review: review({ id: 'r1', cardId: 'c1', deckId: 'd1', reviewedAt: new Date(1) }) }),
      record({ review: review({ id: 'r2', cardId: 'c1', deckId: 'd1', reviewedAt: new Date(2) }) }),
      record({ review: review({ id: 'r3', cardId: 'c2', deckId: 'd2', reviewedAt: new Date(3) }) }),
    ];
    // Act
    const stats = summarizeGoldenErrors(records);
    // Assert
    expect(stats.total).toBe(3);
    expect(stats.byDeck).toEqual({ d1: 2, d2: 1 });
    expect(stats.repeatOffenders).toEqual({ c1: 2 }); // c2 只出现 1 次，非顽固
  });

  it('should return empty stats for empty input', () => {
    // Arrange/Act
    const stats = summarizeGoldenErrors([]);
    // Assert
    expect(stats).toEqual({ total: 0, byDeck: {}, repeatOffenders: {} });
  });
});

describe('recoveryPriority', () => {
  it('should favor longer overdue and higher familiarity', () => {
    // Arrange：逾期 5 天 vs 逾期 10 天（同 repetitions）
    const now = Date.now();
    const c5 = card({ id: 'c5', dueDate: new Date(now - 5 * DAY_MS) });
    const c10 = card({ id: 'c10', dueDate: new Date(now - 10 * DAY_MS) });
    // Act
    const p5 = recoveryPriority(c5, now);
    const p10 = recoveryPriority(c10, now);
    // Assert：逾期翻倍 → 优先级更高
    expect(p10).toBeGreaterThan(p5);
  });

  it('should cap overdue at 30 days and familiarity at 10', () => {
    // Arrange：逾期 100 天 + repetitions 100（均超封顶）
    const now = Date.now();
    const c = card({
      id: 'c-extreme',
      dueDate: new Date(now - 100 * DAY_MS),
      repetitions: 100,
    });
    // Act
    const p = recoveryPriority(c, now);
    // Assert：30*2 + 10 = 70
    expect(p).toBe(70);
  });

  it('should treat future dueDate as zero overdue', () => {
    // Arrange：未到期卡片
    const now = Date.now();
    const c = card({ id: 'c-future', dueDate: new Date(now + 5 * DAY_MS) });
    // Act
    const p = recoveryPriority(c, now);
    // Assert：逾期 0 + familiarity
    expect(p).toBe(c.repetitions);
  });
});

describe('selectRecoveryCards', () => {
  it('should only pick due old cards (repetitions > 0)', () => {
    // Arrange
    const now = Date.now();
    const dueOld = card({ id: 'due-old', dueDate: new Date(now - 1) });
    const notDue = card({ id: 'not-due', dueDate: new Date(now + DAY_MS) });
    const newCard = card({ id: 'brand-new', dueDate: new Date(now - 1), repetitions: 0 });
    // Act
    const selected = selectRecoveryCards([dueOld, notDue, newCard], now, 10);
    // Assert：仅到期旧卡入选
    expect(selected.map((c) => c.id)).toEqual(['due-old']);
  });

  it('should sort by priority descending and respect size limit', () => {
    // Arrange：3 张到期卡，逾期不同
    const now = Date.now();
    const cards = [
      card({ id: 'low', dueDate: new Date(now - 1 * DAY_MS) }),
      card({ id: 'high', dueDate: new Date(now - 20 * DAY_MS) }),
      card({ id: 'mid', dueDate: new Date(now - 5 * DAY_MS) }),
    ];
    // Act：限 2 张
    const selected = selectRecoveryCards(cards, now, 2);
    // Assert：优先逾期最久的 2 张
    expect(selected.map((c) => c.id)).toEqual(['high', 'mid']);
  });

  it('should default to RECOVERY_PACK_SIZE limit', () => {
    // Arrange：11 张全到期旧卡
    const now = Date.now();
    const cards = Array.from({ length: 11 }, (_, i) =>
      card({ id: `c${i}`, dueDate: new Date(now - (i + 1) * DAY_MS) }),
    );
    // Act
    const selected = selectRecoveryCards(cards, now);
    // Assert
    expect(selected.length).toBe(RECOVERY_PACK_SIZE);
    expect(selected.length).toBe(10);
  });
});
