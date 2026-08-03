import { db } from './database';
import type { KbanDeckFile, Flashcard } from '@/types/models';

/**
 * 牌组交换模块（.kban-deck 文件的导出/导入）
 *
 * @ai-context: .kban-deck 是对外分享格式，version '1.0'/'1.1' 与文件扩展名
 * 均已随历史分享文件散布在用户侧，格式字段只可追加不可删改（v1.1 的新字段
 * 全部为可选即为此原因）。
 * @ai-context: 导入的卡片一律重置调度状态（easeFactor 2.5 / interval 0），
 * 这是产品决策——分享者的复习进度对接收者无意义。
 * @ai-context: 副作用——读写 IndexedDB（db.flashcardDecks / db.flashcards）、
 * 触发浏览器下载（downloadDeckFile）。
 */

/**
 * 导出牌组为 .kban-deck 文件结构（v1.1 增强版）
 */
export async function exportDeck(deckId: string): Promise<KbanDeckFile> {
  const deck = await db.flashcardDecks.get(deckId);
  if (!deck) throw new Error('牌组不存在');

  const cards = await db.flashcards.where('deckId').equals(deckId).toArray();

  return {
    version: '1.1',
    type: 'deck',
    exportedAt: new Date().toISOString(),
    author: 'entropydecrease-user',
    deck: {
      id: deck.id,
      name: deck.name,
      description: deck.description || '',
      createdAt: deck.createdAt.toISOString(),
      cardCount: cards.length,
    },
    cards: cards.map((card) => ({
      front: card.front,
      back: card.back,
      // Flashcard.tags 已在类型定义中声明为可选字段，直接透传即可
      tags: card.tags || [],
      type: card.type,
      sourceNoteId: card.sourceNoteId,
    })),
  };
}

/**
 * 将导出数据保存为本地文件（触发浏览器下载）
 */
export function downloadDeckFile(data: KbanDeckFile): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.deck.name}.kban-deck`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 解析 .kban-deck 文件并检测冲突（不自动写入数据库）
 */
export async function importDeck(file: File): Promise<{
  deckData: KbanDeckFile;
  hasConflict: boolean;
  existingDeckId?: string;
}> {
  const text = await file.text();
  const data: KbanDeckFile = JSON.parse(text);

  // 校验格式（兼容 v1.0 和 v1.1）
  if ((data.version !== '1.0' && data.version !== '1.1') || data.type !== 'deck') {
    throw new Error('无效的 .kban-deck 文件格式');
  }

  // 检测同名牌组冲突
  const existing = await db.flashcardDecks.where('name').equals(data.deck.name).first();
  return {
    deckData: data,
    hasConflict: !!existing,
    existingDeckId: existing?.id,
  };
}

/**
 * 由分享文件中的卡片数据构造全新 Flashcard（调度状态重置）
 *
 * @ai-context: 导入的卡片一律重置调度状态（easeFactor 2.5 / interval 0），
 * 分享者的复习进度对接收者无意义（产品决策）。
 * 导入时透传 tags 字段，若分享文件不含标签则不设置（保持 undefined）。
 */
function buildImportedCard(
  card: KbanDeckFile['cards'][number],
  deckId: string,
  now: Date,
): Flashcard {
  return {
    id: crypto.randomUUID(),
    deckId,
    front: card.front,
    back: card.back,
    type: card.type || 'basic',
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    lapses: 0,
    dueDate: now,
    createdAt: now,
    updatedAt: now,
    sourceNoteId: card.sourceNoteId,
    order: 0,
    // 透传分享文件中的卡片标签（若存在且非空则保留，否则不设置以免写入空数组）
    ...(card.tags && card.tags.length > 0 ? { tags: card.tags } : {}),
  };
}

/** 无冲突时直接创建新牌组并导入，返回新牌组 ID 和卡片数 */
export async function importDeckNew(deckData: KbanDeckFile): Promise<{ deckId: string; cardCount: number }> {
  const newDeckId = crypto.randomUUID();
  const now = new Date();
  await db.flashcardDecks.add({
    id: newDeckId,
    name: deckData.deck.name,
    description: deckData.deck.description,
    createdAt: now,
    updatedAt: now,
    order: 0,
  });
  await Promise.all(
    deckData.cards.map((card) => db.flashcards.add(buildImportedCard(card, newDeckId, now))),
  );
  return { deckId: newDeckId, cardCount: deckData.cards.length };
}

/** 覆盖：删除旧牌组及其卡片，导入新数据 */
export async function importDeckOverwrite(deckData: KbanDeckFile, existingDeckId: string): Promise<void> {
  // 删除旧卡片和旧牌组
  await db.flashcards.where('deckId').equals(existingDeckId).delete();
  await db.flashcardDecks.delete(existingDeckId);
  // 以原 ID 重新写入
  const now = new Date();
  await db.flashcardDecks.add({
    id: existingDeckId,
    name: deckData.deck.name,
    description: deckData.deck.description,
    createdAt: now,
    updatedAt: now,
    order: 0,
  });
  await Promise.all(
    deckData.cards.map((card) => db.flashcards.add(buildImportedCard(card, existingDeckId, now))),
  );
}

/** 跳过：不做任何操作 */
export async function importDeckSkip(): Promise<void> {
  // 无操作
}

/** 合并：将新卡片追加到现有牌组，返回新增卡片数 */
export async function importDeckMerge(deckData: KbanDeckFile, existingDeckId: string): Promise<number> {
  const now = new Date();
  await Promise.all(
    deckData.cards.map((card) => db.flashcards.add(buildImportedCard(card, existingDeckId, now))),
  );
  // 更新牌组的 updatedAt
  await db.flashcardDecks.update(existingDeckId, { updatedAt: now });
  return deckData.cards.length;
}
