/**
 * 启动仪式副作用服务 / Side-effect service for the startup ritual
 *
 * @ai-context: 副作用隔离层——仪式记录落库（RIT-06/09 埋点）与"模糊/
 * 未掌握 → 复习卡"闭环在此实现，组件层不直接访问存储。复习卡幂等键为
 * sourceNoteId + 当日；front/back 为加密字段，幂等谓词只允许使用
 * 非加密字段（sourceNoteId/createdAt）。
 * @ai-context: Side-effect isolation layer. Persists ritual records and
 * closes the "fuzzy/unmastered -> review card" loop. Idempotency key is
 * sourceNoteId + same-day; front/back are encrypted at rest so the dedup
 * predicate must only touch plaintext fields.
 */
import { ritualRecordStore } from '@/lib/storage';
import { flashcardStore, flashcardDeckStore } from '@/lib/storage';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import type { RitualRecord, MasteryMark } from '@/types/ritual';
import type { LastSessionData, RitualOutcome } from '../types';
import { getTodayStr, shouldScheduleReviewCard } from '../utils/ritualHelpers';

/** 仪式复习卡专用牌组名（不存在时自动创建） */
const RITUAL_DECK_NAME = '仪式复习';

/**
 * 持久化一次仪式记录。
 * @returns 新记录 ID；存储不可用时静默失败返回 undefined（不阻塞仪式收尾）
 */
export async function saveRitualRecord(
  outcome: RitualOutcome,
  lastSession?: LastSessionData,
): Promise<string | undefined> {
  const record: RitualRecord = {
    id: crypto.randomUUID(),
    date: getTodayStr(),
    masteryMark: outcome.masteryMark,
    noteId: lastSession?.noteId,
    goalText: outcome.goal?.text,
    goalTags: outcome.goal?.tags ?? [],
    ritualDurationMs: outcome.durationMs,
    planVariant: outcome.planVariant,
    createdAt: new Date(),
  };
  try {
    await ritualRecordStore.create(record);
    return record.id;
  } catch {
    return undefined; // 落库失败不阻塞仪式关闭
  }
}

/**
 * 读取全部仪式记录（供目标接力查询，失败返回空数组）。
 */
export async function loadRitualRecords(): Promise<RitualRecord[]> {
  try {
    return await ritualRecordStore.getAll();
  } catch {
    return [];
  }
}

/**
 * 掌握标记为"模糊/未掌握"时生成一张复习卡进入今日队列（RIT-06）。
 * 幂等：同一 noteId 当日已生成过 ritual-review 卡则跳过（风险 R5 缓解）。
 * @returns true = 本次新安排了复习卡；false = 无需安排或已存在或失败
 */
export async function createReviewCardIfNeeded(
  mark: MasteryMark | undefined | null,
  lastSession?: LastSessionData,
): Promise<boolean> {
  if (!shouldScheduleReviewCard(mark) || !lastSession) return false;

  try {
    // 幂等检查：仅用非加密字段（front/back 加密后无法参与谓词判断）
    const today = new Date().toDateString();
    const dup = await flashcardStore.find(
      (c) =>
        c.sourceNoteId === lastSession.noteId &&
        new Date(c.createdAt).toDateString() === today,
    );
    if (dup.length > 0) return false;

    // 定位/创建"仪式复习"牌组
    const decks = await flashcardDeckStore.getAll();
    const existing = decks.find((d) => d.name === RITUAL_DECK_NAME);
    const deckId = existing
      ? existing.id
      : await useFlashcardStore.getState().createDeck(RITUAL_DECK_NAME, '启动仪式自动安排的复习卡');

    // createCard 内部由调度器初始化 dueDate=当日，天然进入今日待复习队列
    await useFlashcardStore.getState().createCard({
      deckId,
      front: `回顾：${lastSession.noteTitle}`,
      back: lastSession.noteExcerpt,
      type: 'basic',
      sourceNoteId: lastSession.noteId,
    });
    return true;
  } catch {
    return false; // 复习卡失败不阻塞仪式收尾
  }
}
