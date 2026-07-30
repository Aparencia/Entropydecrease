/**
 * 费曼状态仓库 — 类型定义与共享工具
 *
 * @ai-context: 从 useFeynmanStore 拆出。FeynmanState 为全 store 契约，
 * slice（noteSlice/stepSlice）各实现其子集；summaries/weakPoints 均为
 * noteId 索引的字典结构。
 */
import type { StateCreator } from 'zustand';
import type { FeynmanNote, FeynmanSummary, FeynmanWeakPoint } from '@/types/models';

// ── Store 内部组合视图（用于 UI 展示）─────────────────────────

export interface FeynmanNoteView {
  note: FeynmanNote;
  summary: FeynmanSummary | null;
  weakPoints: FeynmanWeakPoint[];
}

// ── Store 类型定义 ──────────────────────────────────────────

export interface FeynmanState {
  // 数据
  notes: FeynmanNote[];
  summaries: Record<string, FeynmanSummary | null>;        // noteId → summary
  weakPoints: Record<string, FeynmanWeakPoint[]>;          // noteId → weakPoints[]
  currentNoteId: string | null;
  isLoading: boolean;
  error: string | null;

  // 会话操作
  loadNotes: () => Promise<void>;
  loadNote: (id: string) => Promise<void>;
  createNote: (concept: string) => Promise<string>;
  updateNote: (id: string, changes: Partial<FeynmanNote>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  // 四步流程
  setExplanation: (noteId: string, explanation: string) => Promise<void>;
  addWeakPoint: (noteId: string, weakPoint: Omit<FeynmanWeakPoint, 'id' | 'noteId' | 'createdAt'>) => Promise<string>;
  removeWeakPoint: (noteId: string, weakPointId: string) => Promise<void>;
  toggleWeakPointMastered: (noteId: string, weakPointId: string) => Promise<void>;
  setSimplifiedSummary: (noteId: string, summary: string) => Promise<void>;
  advanceStep: (noteId: string) => Promise<void>;
  setSelfRating: (noteId: string, rating: number) => Promise<void>;
  completeNote: (noteId: string) => Promise<void>;

  // 批量加载
  loadWeakPointsForNotes: (noteIds: string[]) => Promise<void>;

  // 闪卡转化
  convertWeakPointsToFlashcards: (noteId: string, weakPointIds: string[], targetDeckId: string) => Promise<void>;

  // 统计
  getStats: () => { total: number; completed: number; weakPointsCount: number };

  // 便捷 getter
  getCurrentView: () => FeynmanNoteView | null;
}

/** slice 创建函数类型（全 state 可见，实现自身子集） */
export type FeynmanSlice<T> = StateCreator<FeynmanState, [], [], T>;

// ── 工具函数 ────────────────────────────────────────────────

/** 在 notes 数组中替换指定 id 的 note */
export function patchNote(notes: FeynmanNote[], updated: FeynmanNote): FeynmanNote[] {
  return notes.map((n) => (n.id === updated.id ? updated : n));
}
