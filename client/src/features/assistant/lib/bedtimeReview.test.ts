/**
 * Bedtime review shared logic tests
 * B2 (F3): due-card stats + mini-review target selection
 * @ai-context 睡前复习共享查询测试：到期卡过滤、牌组目标选择、失败静默降级；
 * 存储层全 Mock，绝不触碰真实 IndexedDB。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  flashcardStore: { getTable: vi.fn() },
  flashcardDeckStore: { getTable: vi.fn() },
}));

vi.mock('@/lib/storage', () => ({
  flashcardStore: mocks.flashcardStore,
  flashcardDeckStore: mocks.flashcardDeckStore,
}));

import { findDueCards, findTopDueDeck } from './bedtimeReview';

interface FakeCard {
  id: string;
  deckId: string;
  dueDate: Date;
  repetitions: number;
}

/** 保留 Dexie where/and/toArray 语义的极简内存表 mock */
function makeCardTable(rows: FakeCard[]) {
  return {
    where: (field: string) => ({
      belowOrEqual: (bound: Date) => ({
        and: (pred: (r: FakeCard) => boolean) => ({
          toArray: async () =>
            rows.filter((r) => field !== 'dueDate' || new Date(r.dueDate) <= bound).filter(pred),
        }),
      }),
    }),
    toArray: async () => rows,
  };
}

const DUE_SOON = new Date('2026-08-03T10:00:00Z');
const DUE_LATER = new Date('2026-08-10T10:00:00Z');
const NOW = new Date('2026-08-03T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flashcardStore.getTable.mockReset();
  mocks.flashcardDeckStore.getTable.mockReset();
});

describe('findDueCards', () => {
  it('should return due cards (dueDate <= now, repetitions > 0)', async () => {
    const cards: FakeCard[] = [
      { id: 'c1', deckId: 'd1', dueDate: DUE_SOON, repetitions: 2 },
      { id: 'c2', deckId: 'd1', dueDate: DUE_LATER, repetitions: 3 }, // 未到期
      { id: 'c3', deckId: 'd2', dueDate: DUE_SOON, repetitions: 0 },  // 新卡
    ];
    mocks.flashcardStore.getTable.mockReturnValue(makeCardTable(cards));

    const result = await findDueCards(NOW);
    expect(result.map((c) => c.id)).toEqual(['c1']);
  });

  it('should return empty array when no due cards', async () => {
    mocks.flashcardStore.getTable.mockReturnValue(makeCardTable([{ id: 'c2', deckId: 'd1', dueDate: DUE_LATER, repetitions: 3 }]));
    expect(await findDueCards(NOW)).toEqual([]);
  });
});

describe('findTopDueDeck', () => {
  it('should return the deck with most due cards', async () => {
    const cards: FakeCard[] = [
      { id: 'c1', deckId: 'd1', dueDate: DUE_SOON, repetitions: 1 },
      { id: 'c2', deckId: 'd1', dueDate: DUE_SOON, repetitions: 1 },
      { id: 'c3', deckId: 'd2', dueDate: DUE_SOON, repetitions: 1 },
      { id: 'c4', deckId: 'd3', dueDate: DUE_LATER, repetitions: 1 },
    ];
    mocks.flashcardStore.getTable.mockReturnValue(makeCardTable(cards));
    mocks.flashcardDeckStore.getTable.mockReturnValue(makeCardTable([
      { id: 'd1', deckId: 'd1', dueDate: DUE_LATER, repetitions: 0 },
      { id: 'd2', deckId: 'd2', dueDate: DUE_LATER, repetitions: 0 },
    ]));

    expect(await findTopDueDeck(NOW)).toBe('d1');
  });

  it('should return undefined when no decks exist', async () => {
    mocks.flashcardStore.getTable.mockReturnValue(makeCardTable([
      { id: 'c1', deckId: 'd1', dueDate: DUE_SOON, repetitions: 1 },
    ]));
    mocks.flashcardDeckStore.getTable.mockReturnValue(makeCardTable([]));
    expect(await findTopDueDeck(NOW)).toBeUndefined();
  });

  it('should return undefined when no due cards at all', async () => {
    mocks.flashcardStore.getTable.mockReturnValue(makeCardTable([
      { id: 'c4', deckId: 'd3', dueDate: DUE_LATER, repetitions: 1 },
    ]));
    mocks.flashcardDeckStore.getTable.mockReturnValue(makeCardTable([
      { id: 'd3', deckId: 'd3', dueDate: DUE_LATER, repetitions: 0 },
    ]));
    expect(await findTopDueDeck(NOW)).toBeUndefined();
  });

  it('should silently return undefined when storage query throws', async () => {
    // deck 表保持正常，确保 Promise.all 正常成立，卡片表拒绝被统一捕获
    mocks.flashcardDeckStore.getTable.mockReturnValue(makeCardTable([]));
    mocks.flashcardStore.getTable.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(await findTopDueDeck(NOW)).toBeUndefined();
  });
});
