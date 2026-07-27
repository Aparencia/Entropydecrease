import { create } from 'zustand';
import { feynmanNoteStore, feynmanSummaryStore, feynmanWeakPointStore } from '@/lib/storage';
import { createWithLog, updateWithLog, deleteWithLog } from '@/lib/storage/writeWithLog';
import { db } from '@/lib/storage/database';
import type { FeynmanNote, FeynmanSummary, FeynmanWeakPoint } from '@/types/models';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';

// ── Store 内部组合视图（用于 UI 展示）─────────────────────────

export interface FeynmanNoteView {
  note: FeynmanNote;
  summary: FeynmanSummary | null;
  weakPoints: FeynmanWeakPoint[];
}

// ── Store 类型定义 ──────────────────────────────────────────

interface FeynmanState {
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

// ── 工具函数 ────────────────────────────────────────────────

/** 在 notes 数组中替换指定 id 的 note */
function patchNote(notes: FeynmanNote[], updated: FeynmanNote): FeynmanNote[] {
  return notes.map((n) => (n.id === updated.id ? updated : n));
}

// ── Store ────────────────────────────────────────────────────

export const useFeynmanStore = create<FeynmanState>((set, get) => {
  return {
    notes: [],
    summaries: {},
    weakPoints: {},
    currentNoteId: null,
    isLoading: false,
    error: null,

    // ── 会话操作 ────────────────────────────────────────────

    loadNotes: async () => {
      set({ isLoading: true });
      try {
        const all = await feynmanNoteStore.getAll();
        all.sort(
          (a: FeynmanNote, b: FeynmanNote) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        set({ notes: all, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    },

    loadNote: async (id: string) => {
      set({ isLoading: true, error: null });
      try {
        const [note, summaries, weakPoints] = await Promise.all([
          feynmanNoteStore.getById(id),
          feynmanSummaryStore.where('noteId', id),
          feynmanWeakPointStore.where('noteId', id),
        ]);

        set((state) => ({
          currentNoteId: note ? id : null,
          summaries: { ...state.summaries, [id]: summaries[0] ?? null },
          weakPoints: { ...state.weakPoints, [id]: weakPoints },
          isLoading: false,
          // 若 notes 中不含此 note，则补充进去
          notes: state.notes.some((n) => n.id === id) && note
            ? patchNote(state.notes, note)
            : note
              ? [...state.notes, note]
              : state.notes,
        }));
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error('[FeynmanStore] loadNote failed:', e);
        set({ isLoading: false, error: errorMsg });
      }
    },

    createNote: async (concept: string) => {
      const now = new Date();
      const noteData = {
        concept,
        explanation: '',
        status: 'not_started' as const,
        currentStep: 1 as const,
        createdAt: now,
        updatedAt: now,
      };
      const id = await createWithLog(feynmanNoteStore, 'feynmanNotes', noteData);
      const note: FeynmanNote = { id, ...noteData };
      set((state) => ({
        notes: [note, ...state.notes],
        summaries: { ...state.summaries, [id]: null },
        weakPoints: { ...state.weakPoints, [id]: [] },
        currentNoteId: id,
      }));
      // v1.2.0: 同步全局搜索索引
      try {
        await dexieSearchIndexer.upsert(id, 'feynman', concept, concept, now.getTime());
      } catch { /* 忽略 */ }
      return id;
    },

    updateNote: async (id: string, changes: Partial<FeynmanNote>) => {
      const current = get().notes.find((n) => n.id === id);
      if (!current) return;
      const updated: FeynmanNote = { ...current, ...changes, updatedAt: new Date() };
      await updateWithLog(feynmanNoteStore, 'feynmanNotes', id, updated);
      set((state) => ({ notes: patchNote(state.notes, updated) }));
      // v1.2.0: 同步全局搜索索引
      try {
        await dexieSearchIndexer.upsert(
          id,
          'feynman',
          updated.concept,
          `${updated.concept ?? ''} ${updated.explanation ?? ''}`.trim(),
          new Date(updated.updatedAt).getTime(),
        );
      } catch { /* 忽略 */ }
    },

    deleteNote: async (id: string) => {
      // 删除关联的 summary 和 weakPoints
      const summaries = await feynmanSummaryStore.where('noteId', id);
      const weakPoints = await feynmanWeakPointStore.where('noteId', id);

      // Bug #7: 使用 Dexie 事务包裹所有删除操作确保原子性
      await db.transaction('rw', [db.feynmanNotes, db.feynmanSummaries, db.feynmanWeakPoints, db.operationLog], async () => {
        await deleteWithLog(feynmanNoteStore, 'feynmanNotes', id);
        for (const s of summaries) {
          await deleteWithLog(feynmanSummaryStore, 'feynmanSummaries', s.id!);
        }
        for (const w of weakPoints) {
          await deleteWithLog(feynmanWeakPointStore, 'feynmanWeakPoints', w.id!);
        }
      });

      // v1.2.0: 删除搜索索引
      try { await dexieSearchIndexer.remove(id, 'feynman'); } catch { /* 忽略 */ }

      set((state) => {
        const summaries2 = { ...state.summaries };
        const weakPoints2 = { ...state.weakPoints };
        delete summaries2[id];
        delete weakPoints2[id];
        return {
          notes: state.notes.filter((n) => n.id !== id),
          summaries: summaries2,
          weakPoints: weakPoints2,
          currentNoteId: state.currentNoteId === id ? null : state.currentNoteId,
        };
      });
    },

    // ── 四步流程 ────────────────────────────────────────────

    setExplanation: async (noteId: string, explanation: string) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note) return;

      const updated: FeynmanNote = { ...note, explanation, updatedAt: new Date() };

      // 如果当前在 step 1，自动推进到 step 2
      if (note.currentStep === 1) {
        updated.currentStep = 2;
        updated.status = 'in_progress';
      }

      await updateWithLog(feynmanNoteStore, 'feynmanNotes', noteId, updated);
      set((state) => ({ notes: patchNote(state.notes, updated) }));
      // v1.2.0: 同步全局搜索索引（explanation 变更时更新）
      try {
        await dexieSearchIndexer.upsert(
          noteId,
          'feynman',
          updated.concept,
          `${updated.concept ?? ''} ${explanation}`.trim(),
          new Date(updated.updatedAt).getTime(),
        );
      } catch { /* 忽略 */ }
    },

    addWeakPoint: async (noteId: string, weakPoint: Omit<FeynmanWeakPoint, 'id' | 'noteId' | 'createdAt'>) => {
      const wpData = {
        ...weakPoint,
        noteId,
        mastered: weakPoint.mastered ?? false,
        createdAt: new Date(),
      };
      const id = await createWithLog(feynmanWeakPointStore, 'feynmanWeakPoints', wpData);
      const record: FeynmanWeakPoint = { id, ...wpData };

      soundPlayer.play('feynman_weak_point');

      set((state) => ({
        weakPoints: {
          ...state.weakPoints,
          [noteId]: [...(state.weakPoints[noteId] ?? []), record],
        },
      }));
      return id;
    },

    removeWeakPoint: async (noteId: string, weakPointId: string) => {
      await deleteWithLog(feynmanWeakPointStore, 'feynmanWeakPoints', weakPointId);
      set((state) => ({
        weakPoints: {
          ...state.weakPoints,
          [noteId]: (state.weakPoints[noteId] ?? []).filter((w) => w.id !== weakPointId),
        },
      }));
    },

    toggleWeakPointMastered: async (noteId: string, weakPointId: string) => {
      const wps = get().weakPoints[noteId] ?? [];
      const wp = wps.find((w) => w.id === weakPointId);
      if (!wp) return;

      const updated = { ...wp, mastered: !wp.mastered };
      await updateWithLog(feynmanWeakPointStore, 'feynmanWeakPoints', weakPointId, updated);

      set((state) => ({
        weakPoints: {
          ...state.weakPoints,
          [noteId]: (state.weakPoints[noteId] ?? []).map((w) =>
            w.id === weakPointId ? updated : w,
          ),
        },
      }));
    },

    setSimplifiedSummary: async (noteId: string, summary: string) => {
      const existing = get().summaries[noteId];

      if (existing) {
        // 更新已有记录
        const updated: FeynmanSummary = { ...existing, summary, updatedAt: new Date() };
        await updateWithLog(feynmanSummaryStore, 'feynmanSummaries', existing.id!, updated);
        set((state) => ({
          summaries: { ...state.summaries, [noteId]: updated },
        }));
      } else {
        // 新建记录
        const now = new Date();
        const summaryData = {
          noteId,
          summary,
          createdAt: now,
          updatedAt: now,
        };
        const id = await createWithLog(feynmanSummaryStore, 'feynmanSummaries', summaryData);
        const record: FeynmanSummary = { id, ...summaryData };
        set((state) => ({
          summaries: { ...state.summaries, [noteId]: record },
        }));
      }
    },

    advanceStep: async (noteId: string) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note) return;

      const nextStep = Math.min(note.currentStep + 1, 4) as 1 | 2 | 3 | 4;
      const updated: FeynmanNote = {
        ...note,
        currentStep: nextStep,
        updatedAt: new Date(),
      };

      // step 1 → 2：设置 in_progress
      if (note.currentStep === 1 && nextStep === 2) {
        updated.status = 'in_progress';
      }

      // 到达 step 4 且 simplifiedSummary 不为空 → 自动完成
      if (nextStep === 4) {
        const summary = get().summaries[noteId];
        if (summary && summary.summary.trim() !== '') {
          updated.status = 'completed';
          updated.completedAt = new Date();
        }
      }

      await updateWithLog(feynmanNoteStore, 'feynmanNotes', noteId, updated);
      set((state) => ({ notes: patchNote(state.notes, updated) }));
    },

    setSelfRating: async (noteId: string, rating: number) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note) return;

      const updated: FeynmanNote = { ...note, selfRating: rating, updatedAt: new Date() };
      await updateWithLog(feynmanNoteStore, 'feynmanNotes', noteId, updated);
      set((state) => ({ notes: patchNote(state.notes, updated) }));
    },

    completeNote: async (noteId: string) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note) return;

      const updated: FeynmanNote = {
        ...note,
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      };

      await updateWithLog(feynmanNoteStore, 'feynmanNotes', noteId, updated);
      set((state) => ({ notes: patchNote(state.notes, updated) }));
      soundPlayer.play('feynman_complete');
    },

    // ── 闪卡转化 ──────────────────────────────────────────────

    convertWeakPointsToFlashcards: async (noteId: string, weakPointIds: string[], targetDeckId: string) => {
      const note = get().notes.find((n) => n.id === noteId);
      if (!note) throw new Error('笔记不存在');

      const wps = get().weakPoints[noteId] ?? [];
      // 只转化指定的、未掌握的薄弱点
      const toConvert = wps.filter(
        (wp) => weakPointIds.includes(wp.id!) && !wp.mastered,
      );

      if (toConvert.length === 0) return;

      const { createCard } = useFlashcardStore.getState();

      for (const wp of toConvert) {
        await createCard({
          deckId: targetDeckId,
          front: wp.text,
          back: note.concept,
          type: 'basic',
          sourceNoteId: noteId,
        });

        // 标记为已掌握
        const updated = { ...wp, mastered: true };
        await updateWithLog(feynmanWeakPointStore, 'feynmanWeakPoints', wp.id!, updated);
      }

      // 更新本地 store 状态
      set((state) => ({
        weakPoints: {
          ...state.weakPoints,
          [noteId]: (state.weakPoints[noteId] ?? []).map((w) =>
            weakPointIds.includes(w.id!) ? { ...w, mastered: true } : w,
          ),
        },
      }));
    },

    // ── 批量加载 ──────────────────────────────────────────────

    loadWeakPointsForNotes: async (noteIds: string[]) => {
      if (noteIds.length === 0) return;
      const allWp = await feynmanWeakPointStore.getAll();
      const grouped: Record<string, FeynmanWeakPoint[]> = {};
      for (const id of noteIds) grouped[id] = [];
      for (const wp of allWp) {
        if (noteIds.includes(wp.noteId)) {
          (grouped[wp.noteId] ??= []).push(wp);
        }
      }
      set((state) => ({
        weakPoints: { ...state.weakPoints, ...grouped },
      }));
    },

    // ── 统计 ────────────────────────────────────────────────

    getStats: () => {
      const { notes, weakPoints } = get();
      const total = notes.length;
      const completed = notes.filter((n) => n.status === 'completed').length;
      const weakPointsCount = Object.values(weakPoints).reduce(
        (acc, wps) => acc + wps.filter((w) => !w.mastered).length,
        0,
      );
      return { total, completed, weakPointsCount };
    },

    // ── 便捷 getter ─────────────────────────────────────────

    getCurrentView: () => {
      const { notes, summaries, weakPoints, currentNoteId } = get();
      if (!currentNoteId) return null;
      const note = notes.find((n) => n.id === currentNoteId);
      if (!note) return null;
      return {
        note,
        summary: summaries[currentNoteId] ?? null,
        weakPoints: weakPoints[currentNoteId] ?? [],
      };
    },
  };
});
