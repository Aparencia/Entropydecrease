/**
 * 卡壳统计存储（Zustand + localStorage 持久化）
 * Stuck statistics store (Zustand + localStorage persistence)
 *
 * @ai-context: 记录每篇笔记/每个概念的卡壳次数、时间分布，用于在
 * NoteHealthIndicator 中展示"卡壳热力图"。数据持久化到 localStorage，
 * 非 IndexedDB，因卡壳统计为辅助数据，丢失不影响核心功能。
 * @ai-context: Tracks stuck frequency per note/concept, persisted to
 * localStorage. Used for "stuck heatmap" in NoteHealthIndicator.
 */
import { create } from 'zustand';

interface StuckRecord {
  /** 概念或笔记 id */
  id: string;
  /** 概念或笔记标题 */
  label: string;
  /** 卡壳次数 */
  count: number;
  /** 最近卡壳时间 */
  lastStuckAt: string;
  /** 卡壳时长分布（秒） */
  durations: number[];
}

interface StuckStatsState {
  /** 按概念/笔记统计的卡壳记录 */
  records: Record<string, StuckRecord>;
  /** 记录一次卡壳事件 */
  recordStuck: (id: string, label: string, durationSeconds: number) => void;
  /** 获取某笔记/概念的卡壳统计 */
  getStats: (id: string) => StuckRecord | undefined;
  /** 获取卡壳最多的前 N 个 */
  getTopStuck: (limit?: number) => StuckRecord[];
  /** 清除所有记录 */
  clearAll: () => void;
  /** 清除某条记录 */
  clearRecord: (id: string) => void;
}

const STORAGE_KEY = 'keban-stuck-stats';

function loadFromStorage(): Record<string, StuckRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveToStorage(records: Record<string, StuckRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch { /* ignore */ }
}

export const useStuckStatsStore = create<StuckStatsState>((set, get) => ({
  records: loadFromStorage(),

  recordStuck: (id, label, durationSeconds) => set((state) => {
    const existing = state.records[id];
    const updated: StuckRecord = existing
      ? {
          ...existing,
          count: existing.count + 1,
          lastStuckAt: new Date().toISOString(),
          durations: [...existing.durations.slice(-9), durationSeconds], // 保留最近 10 次
        }
      : {
          id,
          label,
          count: 1,
          lastStuckAt: new Date().toISOString(),
          durations: [durationSeconds],
        };
    const newRecords = { ...state.records, [id]: updated };
    saveToStorage(newRecords);
    return { records: newRecords };
  }),

  getStats: (id) => get().records[id],

  getTopStuck: (limit = 10) => {
    const records = Object.values(get().records);
    return records.sort((a, b) => b.count - a.count).slice(0, limit);
  },

  clearAll: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ records: {} });
  },

  clearRecord: (id) => set((state) => {
    const { [id]: _, ...rest } = state.records;
    saveToStorage(rest);
    return { records: rest };
  }),
}));