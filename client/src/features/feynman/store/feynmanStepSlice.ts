/**
 * 费曼状态仓库 — 四步流程与薄弱点 slice
 *
 * @ai-context: 从 useFeynmanStore 拆出。四步流程状态机：step1→2 自动置
 * in_progress；advanceStep 到 step4 且总结非空自动 completed。
 * convertWeakPointsToFlashcards 跨 store 调用 useFlashcardStore.createCard
 * 并将转化的薄弱点标记已掌握（front=薄弱点文本, back=概念）。
 * 音效节点：addWeakPoint / completeNote。
 */
import { feynmanNoteStore, feynmanSummaryStore, feynmanWeakPointStore } from '@/lib/storage';
import { createWithLog, updateWithLog, deleteWithLog } from '@/lib/storage/writeWithLog';
import type { FeynmanNote, FeynmanSummary, FeynmanWeakPoint } from '@/types/models';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';
import { patchNote, type FeynmanSlice, type FeynmanState } from './feynmanStoreTypes';

type StepSlice = Pick<FeynmanState,
  'setExplanation' | 'addWeakPoint' | 'removeWeakPoint' | 'toggleWeakPointMastered' |
  'setSimplifiedSummary' | 'advanceStep' | 'setSelfRating' | 'completeNote' |
  'loadWeakPointsForNotes' | 'convertWeakPointsToFlashcards' | 'getStats' | 'getCurrentView'
>;

export const createStepSlice: FeynmanSlice<StepSlice> = (set, get) => ({
  setExplanation: async (noteId: string, explanation: string) => {
    const note = get().notes.find((n) => n.id === noteId);
    if (!note) return;

    const updated: FeynmanNote = { ...note, explanation, updatedAt: new Date() };

    // FRONT2-M1: 不再在 step1 分支自动推进 currentStep——原实现此处置
    // currentStep=2，而 useFeynmanSession.handleNext 随后无条件 advanceStep
    // 再 +1（2→3），跳过 step2 讲解视图；step 推进统一由 advanceStep 完成一次

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

    // FRONT2-M7: 先批量创建卡片，全部成功后再统一标记 mastered——
    // 原实现逐条"建卡+标记"，中途失败后重试会对已建卡的薄弱点重复建卡
    const createdWpIds: string[] = [];
    try {
      for (const wp of toConvert) {
        await createCard({
          deckId: targetDeckId,
          front: wp.text,
          back: note.concept,
          type: 'basic',
          sourceNoteId: noteId,
        });
        createdWpIds.push(wp.id!);
      }
    } catch (err) {
      // 部分建卡成功时先把已成功的标记 mastered（避免重试重复建卡），再抛出
      for (const wpId of createdWpIds) {
        const wp = toConvert.find((w) => w.id === wpId);
        if (!wp) continue;
        try {
          await updateWithLog(feynmanWeakPointStore, 'feynmanWeakPoints', wpId, { ...wp, mastered: true });
        } catch {
          // 标记失败可接受：下次转换最多重复建该张卡
        }
      }
      throw err;
    }

    // 全部创建成功：统一标记已掌握（逐条容错，失败汇总提示）
    const failedMarks: string[] = [];
    for (const wp of toConvert) {
      const updated = { ...wp, mastered: true };
      try {
        await updateWithLog(feynmanWeakPointStore, 'feynmanWeakPoints', wp.id!, updated);
      } catch {
        failedMarks.push(wp.id!);
      }
    }
    if (failedMarks.length > 0) {
      throw new Error(`部分薄弱点标记失败（${failedMarks.length} 个），请重试`);
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
});
