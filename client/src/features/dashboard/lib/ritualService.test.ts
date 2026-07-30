/**
 * ritualService 测试 / Tests for ritual side-effect service
 *
 * @ai-context: 覆盖 T-A1-03——掌握标记闭环：模糊/未掌握生成复习卡、
 * 幂等不重复、已掌握不生成、存储失败静默降级。存储与闪卡 store 全部
 * Mock，绝不触碰真实 IndexedDB（测试规范 §7）。
 * @ai-context: Covers T-A1-03 review-card closure: creation for
 * fuzzy/unmastered, same-day idempotency, silent degradation. All
 * storage fully mocked — never touches real IndexedDB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LastSessionData, RitualOutcome } from '../types';

const mocks = vi.hoisted(() => ({
  ritualRecordStore: {
    create: vi.fn().mockResolvedValue('rid'),
    getAll: vi.fn().mockResolvedValue([]),
  },
  flashcardStore: {
    find: vi.fn().mockResolvedValue([]),
  },
  flashcardDeckStore: {
    getAll: vi.fn().mockResolvedValue([]),
  },
  createDeck: vi.fn().mockResolvedValue('deck-1'),
  createCard: vi.fn().mockResolvedValue('card-1'),
}));

vi.mock('@/lib/storage', () => ({
  ritualRecordStore: mocks.ritualRecordStore,
  flashcardStore: mocks.flashcardStore,
  flashcardDeckStore: mocks.flashcardDeckStore,
}));

vi.mock('@/features/flashcards/store/useFlashcardStore', () => ({
  useFlashcardStore: {
    getState: () => ({ createDeck: mocks.createDeck, createCard: mocks.createCard }),
  },
}));

import { saveRitualRecord, createReviewCardIfNeeded, loadRitualRecords } from './ritualService';

const SESSION: LastSessionData = {
  noteTitle: '傅里叶变换',
  noteExcerpt: '……频域分解的核心思想',
  noteId: 'note-1',
  studiedAt: '2026-07-30T08:00:00.000Z',
};

const OUTCOME: RitualOutcome = {
  goal: { text: '搞懂卷积定理', tags: ['傅里叶变换'] },
  masteryMark: 'fuzzy',
  durationMs: 72_000,
  planVariant: 'standard',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ritualRecordStore.create.mockResolvedValue('rid');
  mocks.ritualRecordStore.getAll.mockResolvedValue([]);
  mocks.flashcardStore.find.mockResolvedValue([]);
  mocks.flashcardDeckStore.getAll.mockResolvedValue([]);
});

describe('saveRitualRecord', () => {
  it('should persist a record with outcome and session fields', async () => {
    // Act
    const id = await saveRitualRecord(OUTCOME, SESSION);

    // Assert
    expect(id).toBeDefined();
    const record = mocks.ritualRecordStore.create.mock.calls[0][0];
    expect(record.masteryMark).toBe('fuzzy');
    expect(record.noteId).toBe('note-1');
    expect(record.goalText).toBe('搞懂卷积定理');
    expect(record.goalTags).toEqual(['傅里叶变换']);
    expect(record.ritualDurationMs).toBe(72_000);
    expect(record.planVariant).toBe('standard');
  });

  it('should return undefined silently when storage fails', async () => {
    // Arrange
    mocks.ritualRecordStore.create.mockRejectedValueOnce(new Error('quota'));

    // Act & Assert — 不抛异常、不阻塞收尾
    await expect(saveRitualRecord(OUTCOME, SESSION)).resolves.toBeUndefined();
  });
});

describe('createReviewCardIfNeeded', () => {
  it('should create deck and card for fuzzy mark', async () => {
    // Act
    const created = await createReviewCardIfNeeded('fuzzy', SESSION);

    // Assert
    expect(created).toBe(true);
    expect(mocks.createDeck).toHaveBeenCalledWith('仪式复习', expect.any(String));
    expect(mocks.createCard).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 'deck-1',
        front: '回顾：傅里叶变换',
        sourceNoteId: 'note-1',
        type: 'basic',
      }),
    );
  });

  it('should reuse existing ritual deck', async () => {
    // Arrange
    mocks.flashcardDeckStore.getAll.mockResolvedValueOnce([
      { id: 'deck-x', name: '仪式复习', createdAt: new Date(), updatedAt: new Date(), order: 1 },
    ]);

    // Act
    await createReviewCardIfNeeded('unmastered', SESSION);

    // Assert
    expect(mocks.createDeck).not.toHaveBeenCalled();
    expect(mocks.createCard).toHaveBeenCalledWith(expect.objectContaining({ deckId: 'deck-x' }));
  });

  it('should be idempotent for same note on the same day', async () => {
    // Arrange — 当日已有同源卡
    mocks.flashcardStore.find.mockResolvedValueOnce([{ id: 'card-old' }]);

    // Act
    const created = await createReviewCardIfNeeded('fuzzy', SESSION);

    // Assert
    expect(created).toBe(false);
    expect(mocks.createCard).not.toHaveBeenCalled();
  });

  it('should not create for mastered / missing mark / missing session', async () => {
    // Act & Assert
    expect(await createReviewCardIfNeeded('mastered', SESSION)).toBe(false);
    expect(await createReviewCardIfNeeded(undefined, SESSION)).toBe(false);
    expect(await createReviewCardIfNeeded('fuzzy', undefined)).toBe(false);
    expect(mocks.createCard).not.toHaveBeenCalled();
  });

  it('should return false silently when card creation fails', async () => {
    // Arrange
    mocks.createCard.mockRejectedValueOnce(new Error('db down'));

    // Act & Assert
    expect(await createReviewCardIfNeeded('fuzzy', SESSION)).toBe(false);
  });
});

describe('loadRitualRecords', () => {
  it('should return empty array when storage fails', async () => {
    // Arrange
    mocks.ritualRecordStore.getAll.mockRejectedValueOnce(new Error('closed'));

    // Act & Assert
    expect(await loadRitualRecords()).toEqual([]);
  });
});
