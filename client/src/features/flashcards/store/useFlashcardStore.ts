import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  flashcardDeckStore,
  flashcardStore,
  flashcardReviewStore,
} from '@/lib/storage';
import { createWithLog, updateWithLog, deleteWithLog } from '@/lib/storage/writeWithLog';
import { getScheduler } from '@/lib/schedulingFactory';
import type { Flashcard, FlashcardDeck } from '@/types/models';
import { useStudySessionStore } from './useStudySessionStore';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface DeckStats {
  total: number;
  due: number;
  newCards: number;
}

interface FlashcardState {
  // 数据
  decks: FlashcardDeck[];
  cards: Flashcard[];
  isLoading: boolean;
  selectedDeckId: string | null;

  // 牌组操作
  loadDecks: () => Promise<void>;
  createDeck: (name: string, description?: string, color?: string) => Promise<string>;
  updateDeck: (id: string, changes: Partial<FlashcardDeck>) => Promise<void>;
  renameDeck: (id: string, newName: string) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  selectDeck: (id: string | null) => void;

  // 卡片操作
  loadCards: (deckId: string) => Promise<void>;
  createCard: (
    card: Omit<
      Flashcard,
      'id' | 'easeFactor' | 'interval' | 'repetitions' | 'lapses' | 'dueDate' | 'stability' | 'difficulty' | 'createdAt' | 'updatedAt' | 'order'
    >,
  ) => Promise<string>;
  updateCard: (id: string, changes: Partial<Flashcard>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;

  // 统计
  getDeckStats: (deckId: string) => DeckStats;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFlashcardStore = create<FlashcardState>((set, get) => {
  return {
    decks: [],
    cards: [],
    isLoading: false,
    selectedDeckId: null,

    // -----------------------------------------------------------------------
    // 牌组操作
    // -----------------------------------------------------------------------

    loadDecks: async () => {
      set({ isLoading: true });
      try {
        const decks = await flashcardDeckStore.getAll();
        set({ decks, isLoading: false });
      } catch {
        set({ isLoading: false });
        throw new Error('加载牌组失败');
      }
    },

    createDeck: async (name, description, color) => {
      const now = new Date();
      const deckData = {
        name,
        description,
        color,
        createdAt: now,
        updatedAt: now,
        order: Date.now(),
      };
      const id = await createWithLog(flashcardDeckStore, 'flashcardDecks', deckData);
      // 将新牌组追加到本地状态
      const deck: FlashcardDeck = { id, ...deckData };
      set((state) => ({ decks: [...state.decks, deck] }));
      return id;
    },

    updateDeck: async (id, changes) => {
      const updatedAt = new Date();
      await updateWithLog(flashcardDeckStore, 'flashcardDecks', id, { ...changes, updatedAt });
      set((state) => ({
        decks: state.decks.map((d) =>
          d.id === id ? { ...d, ...changes, updatedAt } : d,
        ),
      }));
    },

    renameDeck: async (id, newName) => {
      const updatedAt = new Date();
      await updateWithLog(flashcardDeckStore, 'flashcardDecks', id, { name: newName, updatedAt });
      set((state) => ({
        decks: state.decks.map((d) =>
          d.id === id ? { ...d, name: newName, updatedAt } : d,
        ),
      }));
    },

    deleteDeck: async (id) => {
      // 级联删除：先删除该牌组下的所有复习记录，再删除所有卡片，最后删除牌组
      const deckCards = await flashcardStore.where('deckId', id);
      const deckReviews = await flashcardReviewStore.where('deckId', id);

      await Promise.all([
        ...deckReviews.map((r) => deleteWithLog(flashcardReviewStore, 'flashcardReviews', r.id!)),
        ...deckCards.map((c) => deleteWithLog(flashcardStore, 'flashcards', c.id!)),
      ]);
      await deleteWithLog(flashcardDeckStore, 'flashcardDecks', id);

      set((state) => ({
        decks: state.decks.filter((d) => d.id !== id),
        // 若删除的是当前选中牌组，清空选中
        selectedDeckId: state.selectedDeckId === id ? null : state.selectedDeckId,
        // 若当前展示的是被删除牌组的卡片，清空
        cards: state.selectedDeckId === id ? [] : state.cards,
      }));

      // 清理学习会话中该牌组的缓存数据
      useStudySessionStore.getState().clearDeckSession(id);
    },

    selectDeck: (id) => {
      set({ selectedDeckId: id });
    },

    // -----------------------------------------------------------------------
    // 卡片操作
    // -----------------------------------------------------------------------

    loadCards: async (deckId) => {
      set({ isLoading: true });
      try {
        const cards = await flashcardStore.where('deckId', deckId);
        set({ cards, isLoading: false });
      } catch {
        set({ isLoading: false });
        throw new Error('加载卡片失败');
      }
    },

    createCard: async (cardInput) => {
      const now = new Date();
      const initState = getScheduler().createNew();
      const cardData = {
        ...cardInput,
        easeFactor: initState.easeFactor,
        interval: initState.interval,
        repetitions: initState.repetitions,
        lapses: initState.lapses,
        dueDate: initState.dueDate,
        stability: initState.stability,
        difficulty: initState.difficulty,
        createdAt: now,
        updatedAt: now,
        order: Date.now(),
      };
      const id = await createWithLog(flashcardStore, 'flashcards', cardData);
      const card: Flashcard = { id, ...cardData };
      set((state) => ({ cards: [...state.cards, card] }));
      // v1.2.0: 同步全局搜索索引
      try {
        await dexieSearchIndexer.upsert(
          id,
          'flashcard',
          card.front?.slice(0, 60) ?? '闪卡',
          `${card.front ?? ''} ${card.back ?? ''}`.trim(),
          now.getTime(),
        );
      } catch { /* 索引更新失败不阻塞卡片创建 */ }
      return id;
    },

    updateCard: async (id, changes) => {
      const updatedAt = new Date();
      await updateWithLog(flashcardStore, 'flashcards', id, { ...changes, updatedAt });
      const updatedCard = { ...get().cards.find((c) => c.id === id), ...changes, updatedAt } as Flashcard;
      set((state) => ({
        cards: state.cards.map((c) =>
          c.id === id ? { ...c, ...changes, updatedAt } : c,
        ),
      }));
      // v1.2.0: 同步全局搜索索引
      try {
        await dexieSearchIndexer.upsert(
          id,
          'flashcard',
          updatedCard.front?.slice(0, 60) ?? '闪卡',
          `${updatedCard.front ?? ''} ${updatedCard.back ?? ''}`.trim(),
          updatedAt.getTime(),
        );
      } catch { /* 忽略 */ }
    },

    deleteCard: async (id) => {
      await deleteWithLog(flashcardStore, 'flashcards', id);
      set((state) => ({
        cards: state.cards.filter((c) => c.id !== id),
      }));
      // v1.2.0: 删除搜索索引
      try { await dexieSearchIndexer.remove(id, 'flashcard'); } catch { /* 忽略 */ }
    },

    // -----------------------------------------------------------------------
    // 统计
    // -----------------------------------------------------------------------

    getDeckStats: (deckId) => {
      const { cards } = get();
      const deckCards = cards.filter((c) => c.deckId === deckId);
      const now = new Date();

      return {
        total: deckCards.length,
        due: deckCards.filter(
          (c) => c.repetitions > 0 && new Date(c.dueDate) <= now,
        ).length,
        newCards: deckCards.filter((c) => c.repetitions === 0).length,
      };
    },
  };
});

// ---------------------------------------------------------------------------
// 选择器 Hooks
// ---------------------------------------------------------------------------

/** 仅订阅牌组列表 */
export const useFlashcardDecks = () =>
  useFlashcardStore(s => s.decks);

/** 仅订阅当前牌组的卡片 */
export const useFlashcardCards = () =>
  useFlashcardStore(s => s.cards);

/** 仅订阅加载状态 */
export const useFlashcardLoading = () =>
  useFlashcardStore(s => s.isLoading);

/** 仅订阅选中牌组 ID */
export const useFlashcardSelectedDeckId = () =>
  useFlashcardStore(s => s.selectedDeckId);

/** 牌组概览（复合，useShallow） */
export const useFlashcardDeckOverview = () =>
  useFlashcardStore(useShallow(s => ({
    decks: s.decks,
    selectedDeckId: s.selectedDeckId,
    isLoading: s.isLoading,
  })));
