/**
 * 费曼状态仓库 — 会话 CRUD slice
 *
 * @ai-context: 从 useFeynmanStore 拆出。会话增删改查 + 搜索索引同步
 * （create/update/setExplanation 时 upsert，delete 时 remove，索引失败
 * 静默忽略不阻塞主流程）。deleteNote 用 Dexie 事务包裹笔记/总结/薄弱点
 * 三表删除保证原子性（Bug #7 修复保留）。
 */
import { feynmanNoteStore, feynmanSummaryStore, feynmanWeakPointStore } from '@/lib/storage';
import { createWithLog, updateWithLog, deleteWithLog } from '@/lib/storage/writeWithLog';
import { db } from '@/lib/storage/database';
import type { FeynmanNote } from '@/types/models';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';
import { patchNote, type FeynmanSlice, type FeynmanState } from './feynmanStoreTypes';

type NoteSlice = Pick<FeynmanState,
  'loadNotes' | 'loadNote' | 'createNote' | 'updateNote' | 'deleteNote'
>;

export const createNoteSlice: FeynmanSlice<NoteSlice> = (set, get) => ({
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
});
