/**
 * 知识入籍 · 安放入世界 Hook
 * Knowledge settling · place-into-world hook
 *
 * @ai-context: 阶段 A（入口问题）业务层。输入预览后的概念候选，批量
 * 建笔记（摘要正文）+ 概念卡（FSRS 初始 due=now，呈雾中轮廓）→ 写 imports
 * 记录（溯源）→ 触发 knowledge_settled 签名时刻（入籍变体：星域成片点亮）。
 * 卡片写入走 useFlashcardStore.createCard（FSRS-5 唯一数据源，不重造调度）。
 * 任何一步失败返回 Result 模式（ok:false），由页面兜底提示，不抛未捕获异常。
 *
 * @ai-context: Business layer for settling. Batch-creates notes + FSRS cards,
 * writes the imports trace record, then fires the settling signature moment.
 * Failures return a Result object instead of throwing.
 */
import { useState } from 'react';
import { useNoteStore } from '@/features/notes/store/useNoteStore';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { useWorldEvents } from '@/features/retention/store/useWorldEvents';
import type { ConceptCandidate, ImportSource } from '../types';

/** 入籍概念卡默认牌组名 / Default deck for settled concept cards */
export const SETTLING_DECK_NAME = '知识入籍';
/** 入籍笔记/卡片统一标签 / Settling tag applied to notes and cards */
export const SETTLING_TAG = '知识入籍';

/** 安放输入 / Settling input */
export interface SettleInput {
  title: string;
  source: ImportSource;
  /** 溯源标识：文件名 / URL / 粘贴来源 / Traceability key */
  rawName: string;
  concepts: ConceptCandidate[];
}

/** 安放结果（Result 模式，不抛错） / Settling result */
export interface SettleResult {
  ok: boolean;
  error?: string;
  noteIds: string[];
  cardIds: string[];
  recordId?: string;
}

/** 摘要 → TipTap doc JSON（概念笔记正文载体） / Summary to TipTap doc JSON */
export function summaryToNoteContent(summary: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: summary }] }],
  });
}

/** 复用知识入籍牌组：已存在则直接使用，否则创建 / Reuse or create the settling deck */
async function ensureSettlingDeck(): Promise<string> {
  const flashcard = useFlashcardStore.getState();
  const existing = flashcard.decks.find((d) => d.name === SETTLING_DECK_NAME);
  if (existing) return existing.id;
  await flashcard.loadDecks();
  const reloaded = useFlashcardStore.getState().decks.find((d) => d.name === SETTLING_DECK_NAME);
  if (reloaded) return reloaded.id;
  return useFlashcardStore.getState().createDeck(SETTLING_DECK_NAME);
}

/**
 * 安放一批概念：每概念 = 1 笔记 + 1 概念卡（FSRS 初始态 → 雾中轮廓）
 * 全部成功 → imports 记录 + 签名时刻；任一失败 → Result 错误，可重试
 */
export function useSettleConcepts() {
  const [isSettling, setIsSettling] = useState(false);

  const settleConcepts = async (input: SettleInput): Promise<SettleResult> => {
    if (input.concepts.length === 0) {
      return { ok: false, error: '没有可安放的概念', noteIds: [], cardIds: [] };
    }
    setIsSettling(true);
    const noteIds: string[] = [];
    const cardIds: string[] = [];
    try {
      const deckId = await ensureSettlingDeck();

      for (const c of input.concepts) {
        const noteId = await useNoteStore.getState().createNote({
          title: c.name,
          content: summaryToNoteContent(c.summary),
          template: 'blank',
          tags: [SETTLING_TAG],
          sourceRef: input.rawName,
        });
        noteIds.push(noteId);

        const cardId = await useFlashcardStore.getState().createCard({
          deckId,
          front: c.cardFront || c.name,
          back: c.cardBack || c.summary,
          type: 'basic',
          sourceNoteId: noteId,
          sourceRef: input.rawName,
          tags: [SETTLING_TAG],
        });
        cardIds.push(cardId);
      }

      // 入籍记录（imports 表，溯源；失败不阻塞安放）
      let recordId: string | undefined;
      try {
        const record = await window.electronAPI?.invoke('import:add-settling-record', {
          source: input.source,
          rawName: input.rawName,
          conceptCount: input.concepts.length,
        }) as { success?: boolean; record?: { id: string } } | undefined;
        if (record?.success && record.record) recordId = record.record.id;
      } catch { /* 记录失败仅失去溯源，卡片与笔记已入世界 */ }

      // 签名时刻·入籍变体（星域成片点亮，挂 knowledge_settled 事件语义）
      useWorldEvents.getState().emitSignatureMoment(
        input.concepts[input.concepts.length - 1]?.name ?? input.title,
        'settling',
      );

      return { ok: true, noteIds, cardIds, recordId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 部分失败：告知已安放数量，用户重试时不会误以为全部丢失
      const partial = noteIds.length > 0
        ? `（已安放 ${noteIds.length} 个概念，重试会从剩余概念继续）`
        : '';
      return { ok: false, error: `${message}${partial}`, noteIds, cardIds };
    } finally {
      setIsSettling(false);
    }
  };

  return { isSettling, settleConcepts };
}
