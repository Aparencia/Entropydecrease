/**
 * 首潜引导系统单元测试
 *
 * @ai-context: 覆盖存储迁移、种子幂等/版本追加、步骤推进纯函数。
 * 存储层全部 Mock，禁止连接真实 IndexedDB。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 存储层，阻断真实 Dexie 依赖链
vi.mock('@/lib/storage', () => ({
  db: {},
  flashcardDeckStore: {},
  flashcardStore: {},
}));

import {
  loadFirstDiveState,
  saveFirstDiveState,
  createInitialState,
  FIRST_DIVE_STORAGE_KEY,
} from './firstDiveStorage';
import { seedHandbookDeck } from './seedHandbook';
import { getCurrentStep } from './useFirstDiveStore';
import { DIVE_STEPS, orderStepsByProfile } from './diveSteps';
import { HANDBOOK_CARDS, HANDBOOK_DECK_ID, HANDBOOK_VERSION_KEY } from './handbookDeck';
import type { Flashcard, FlashcardDeck } from '@/types/models';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// firstDiveStorage
// ---------------------------------------------------------------------------

describe('firstDiveStorage', () => {
  it('should return initial landing state for fresh install', () => {
    // Act
    const state = loadFirstDiveState();
    // Assert
    expect(state.stage).toBe('landing');
    expect(state.completedSteps).toEqual([]);
  });

  it('should migrate legacy onboarding mark to done', () => {
    // Arrange：旧版引导完成标记存在
    localStorage.setItem('kb-onboarding-done', 'true');
    // Act
    const state = loadFirstDiveState();
    // Assert：老用户直接视为完成，且已回写新 key
    expect(state.stage).toBe('done');
    expect(localStorage.getItem(FIRST_DIVE_STORAGE_KEY)).toContain('"done"');
  });

  it('should fall back to defaults when persisted JSON is corrupted', () => {
    // Arrange
    localStorage.setItem(FIRST_DIVE_STORAGE_KEY, '{not-json');
    // Act
    const state = loadFirstDiveState();
    // Assert：解析失败降级为 done，不反复弹引导
    expect(state.stage).toBe('done');
  });

  it('should round-trip save and load', () => {
    // Arrange
    const saved = { ...createInitialState(), stage: 'diving' as const, completedSteps: ['pomodoro' as const] };
    // Act
    saveFirstDiveState(saved);
    const loaded = loadFirstDiveState();
    // Assert
    expect(loaded.stage).toBe('diving');
    expect(loaded.completedSteps).toEqual(['pomodoro']);
  });
});

// ---------------------------------------------------------------------------
// seedHandbookDeck
// ---------------------------------------------------------------------------

function createMockStores(existingDeck?: FlashcardDeck, existingCards: Flashcard[] = []) {
  return {
    deckStore: {
      getById: vi.fn().mockResolvedValue(existingDeck),
      create: vi.fn().mockResolvedValue(HANDBOOK_DECK_ID),
    },
    cardStore: {
      where: vi.fn().mockResolvedValue(existingCards),
      create: vi.fn().mockResolvedValue('card-id'),
    },
  };
}

const fakeDeck: FlashcardDeck = {
  id: HANDBOOK_DECK_ID, name: '潜航员手册', createdAt: new Date(), updatedAt: new Date(), order: 0,
};

describe('seedHandbookDeck', () => {
  it('should create deck and all cards on fresh install', async () => {
    // Arrange
    const { deckStore, cardStore } = createMockStores(undefined);
    // Act
    const added = await seedHandbookDeck(deckStore, cardStore);
    // Assert
    expect(deckStore.create).toHaveBeenCalledTimes(1);
    expect(cardStore.create).toHaveBeenCalledTimes(HANDBOOK_CARDS.length);
    expect(added).toBe(HANDBOOK_CARDS.length);
  });

  it('should be idempotent when deck exists and version matches', async () => {
    // Arrange：牌组已存在且版本一致
    localStorage.setItem(HANDBOOK_VERSION_KEY, '999');
    const { deckStore, cardStore } = createMockStores(fakeDeck);
    // Act
    const added = await seedHandbookDeck(deckStore, cardStore);
    // Assert：快路径，零写入
    expect(deckStore.create).not.toHaveBeenCalled();
    expect(cardStore.create).not.toHaveBeenCalled();
    expect(added).toBe(0);
  });

  it('should only append missing cards on version upgrade (protect review progress)', async () => {
    // Arrange：旧版本，已有前 3 张卡
    localStorage.setItem(HANDBOOK_VERSION_KEY, '0');
    const existing = HANDBOOK_CARDS.slice(0, 3).map((c, i) => ({
      id: `old-${i}`, deckId: HANDBOOK_DECK_ID, front: c.front, back: c.back,
      type: 'basic', easeFactor: 2.5, interval: 3, repetitions: 2, lapses: 0,
      dueDate: new Date(), createdAt: new Date(), updatedAt: new Date(), order: i,
    })) as Flashcard[];
    const { deckStore, cardStore } = createMockStores(fakeDeck, existing);
    // Act
    const added = await seedHandbookDeck(deckStore, cardStore);
    // Assert：只补缺失的卡，不重建已有卡
    expect(added).toBe(HANDBOOK_CARDS.length - 3);
    expect(deckStore.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 步骤推进纯函数
// ---------------------------------------------------------------------------

describe('dive step ordering', () => {
  it('should start from review step for memory profile', () => {
    // Act
    const ordered = orderStepsByProfile('memory');
    // Assert：背了就忘 → 从手册复习起步，且不丢步骤
    expect(ordered[0].id).toBe('review');
    expect(ordered).toHaveLength(DIVE_STEPS.length);
  });

  it('should return first uncompleted step in profile order', () => {
    // Act & Assert
    expect(getCurrentStep('focus', [])).toBe('pomodoro');
    expect(getCurrentStep('focus', ['pomodoro'])).toBe('note');
    expect(getCurrentStep('memory', [])).toBe('review');
  });

  it('should return null when all steps completed', () => {
    // Arrange
    const all = DIVE_STEPS.map((s) => s.id);
    // Act & Assert
    expect(getCurrentStep('focus', all)).toBeNull();
  });
});
