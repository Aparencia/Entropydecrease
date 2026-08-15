import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/storage/database';
import type { SortSuggestion } from '@/lib/ai/types';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';

export interface InspirationTags {
  content_nature: 'concept' | 'question' | 'inspiration' | 'todo';
  cognitive_depth: 'shallow' | 'understanding' | 'application';
  subject: string;
}

export interface InspirationItem {
  id: string;
  content: string;
  tags: InspirationTags;
  tagsManuallyEdited: boolean;
  createdAt: string;
  updatedAt: string;
  /** AI 分拣状态 */
  sortStatus?: 'pending' | 'sorting' | 'sorted' | 'confirmed' | 'transformed';
  /** AI 分拣建议结果列表 */
  sortResult?: SortSuggestion[];
}

interface InspirationState {
  items: InspirationItem[];
  loading: boolean;
  loadAll: () => Promise<void>;
  addItem: (content: string, tags: InspirationTags) => void;
  updateTags: (id: string, tags: Partial<InspirationTags>) => void;
  deleteItem: (id: string) => void;
  updateSortStatus: (id: string, status: string, result?: SortSuggestion[]) => void;
  confirmSort: (id: string, selectedCategory?: string) => void;
  batchUpdateSortStatus: (ids: string[], status: string) => void;
}

export const useInspirationStore = create<InspirationState>((set, get) => ({
  items: [],
  loading: false,

  loadAll: async () => {
    set({ loading: true });
    try {
      const all = await db.inspirations.orderBy('createdAt').reverse().toArray();
      set({ items: all as InspirationItem[], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addItem: (content, tags) => {
    const item: InspirationItem = {
      id: uuidv4(),
      content,
      tags,
      tagsManuallyEdited: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      /** @ai-context 新建灵感默认 pending，等待 AI 分拣 */
      sortStatus: 'pending',
    };
    // Optimistic update: add to state immediately
    set((s) => ({ items: [item, ...s.items] }));
    // Persist to Dexie async
    db.inspirations.add(item).then(async () => {
      // v1.2.0: 同步全局搜索索引
      try {
        await dexieSearchIndexer.upsert(
          item.id,
          'inspiration',
          content.slice(0, 60) || '灵感',
          content,
          new Date(item.createdAt).getTime(),
        );
      } catch { /* 忽略 */ }
    }).catch(() => {
      // Rollback on failure
      set((s) => ({ items: s.items.filter(i => i.id !== item.id) }));
    });
  },

  updateTags: (id, tags) => {
    const now = new Date().toISOString();
    // Optimistic update
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, tags: { ...i.tags, ...tags }, tagsManuallyEdited: true, updatedAt: now }
          : i
      ),
    }));
    // Persist to Dexie async
    db.inspirations.update(id, {
      tags: { ...get().items.find(i => i.id === id)!.tags, ...tags },
      tagsManuallyEdited: true,
      updatedAt: now,
    }).catch(() => {
      // Silent failure — UI state still consistent until next reload
    });
  },

  deleteItem: (id) => {
    // Optimistic update
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    // Persist to Dexie async
    db.inspirations.delete(id).catch(() => {
      // Silent failure
    });
    // v1.2.0: 删除搜索索引
    dexieSearchIndexer.remove(id, 'inspiration').catch((err) => {
      console.debug('[inspirationStore] search index remove failed', id, err);
    });
  },

  updateSortStatus: (id, status, result) => {
    const now = new Date().toISOString();
    const updates: Partial<InspirationItem> = {
      sortStatus: status as InspirationItem['sortStatus'],
      updatedAt: now,
    };
    if (result !== undefined) {
      updates.sortResult = result;
    }
    // Optimistic update
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    // Persist to Dexie async
    db.inspirations.update(id, updates).catch(() => {
      // Silent failure
    });
  },

  confirmSort: (id, selectedCategory) => {
    const now = new Date().toISOString();
    const item = get().items.find((i) => i.id === id);
    if (!item) return;

    let sortResult = item.sortResult;
    if (selectedCategory && sortResult) {
      sortResult = sortResult.map((s) =>
        s.category === selectedCategory ? { ...s } : s
      );
    }

    const updates: Partial<InspirationItem> = {
      sortStatus: 'confirmed',
      sortResult,
      updatedAt: now,
    };
    // Optimistic update
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    // Persist to Dexie async
    db.inspirations.update(id, updates).catch(() => {
      // Silent failure
    });
  },

  batchUpdateSortStatus: (ids, status) => {
    const now = new Date().toISOString();
    const updates: Partial<InspirationItem> = {
      sortStatus: status as InspirationItem['sortStatus'],
      updatedAt: now,
    };
    // Optimistic update
    set((s) => ({
      items: s.items.map((i) => (ids.includes(i.id) ? { ...i, ...updates } : i)),
    }));
    // Persist to Dexie using transaction
    db.transaction('rw', db.inspirations, async () => {
      for (const id of ids) {
        await db.inspirations.update(id, updates);
      }
    }).catch(() => {
      // Silent failure
    });
  },
}));
