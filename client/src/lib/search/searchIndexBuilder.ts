/**
 * 搜索索引重建 — 五表条目收集（纯数据转换）
 *
 * @ai-context: 全局统一搜索覆盖 notes/flashcards/feynmanNotes/inspirations/
 * classroomNotes 五张表；新增可搜索实体类型时在此登记收集逻辑 + 更新
 * SearchEntityType + ENTITY_LENGTH_WEIGHT，三处需同步。
 * @ai-context: 读取 db 各表（有副作用），但仅读不写；标题回退与
 * updatedAt 归一（Date/number/缺省）逻辑在此集中处理。
 */
import { db } from '../storage/database';
import { extractPlainText } from './searchScoring';
import type { SearchEntityType } from '@/types/models';

/** 重建时的标准化可索引条目 */
export interface IndexableItem {
  entityId: string;
  entityType: SearchEntityType;
  title: string;
  content: string;
  updatedAt: number;
}

/** 统一 updatedAt 归一为毫秒时间戳（兼容 Date / number / 缺省） */
function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  return new Date((value as string | number) ?? Date.now()).getTime();
}

/**
 * 收集五张业务表的全部条目，转换为标准可索引格式
 */
export async function collectIndexableItems(): Promise<IndexableItem[]> {
  const allItems: IndexableItem[] = [];

  // notes: title + content
  const notes = await db.notes.toArray();
  for (const note of notes) {
    allItems.push({
      entityId: note.id,
      entityType: 'note',
      title: note.title,
      content: extractPlainText(note.content),
      updatedAt: toMillis(note.updatedAt),
    });
  }

  // flashcards: front + back
  const flashcards = await db.flashcards.toArray();
  for (const card of flashcards) {
    allItems.push({
      entityId: card.id,
      entityType: 'flashcard',
      title: card.front?.slice(0, 60) ?? '闪卡',
      content: `${card.front ?? ''} ${card.back ?? ''}`.trim(),
      updatedAt: toMillis(card.updatedAt),
    });
  }

  // feynmanNotes: concept + explanation
  const feynmanNotes = await db.feynmanNotes.toArray();
  for (const fn of feynmanNotes) {
    allItems.push({
      entityId: fn.id,
      entityType: 'feynman',
      title: fn.concept ?? '费曼笔记',
      content: `${fn.concept ?? ''} ${fn.explanation ?? ''}`.trim(),
      updatedAt: toMillis(fn.updatedAt),
    });
  }

  // inspirations: content (标题取前 60 字)
  const inspirations = await db.inspirations.toArray();
  for (const insp of inspirations) {
    const content = insp.content ?? '';
    allItems.push({
      entityId: insp.id,
      entityType: 'inspiration',
      title: content.slice(0, 60) || '灵感',
      content,
      updatedAt: toMillis(insp.updatedAt),
    });
  }

  // classroomNotes: title + content (Markdown)
  const classroomNotes = await db.classroomNotes.toArray();
  for (const cn of classroomNotes) {
    allItems.push({
      entityId: cn.id,
      entityType: 'classroom',
      title: cn.title ?? '课堂笔记',
      content: `${cn.title ?? ''} ${cn.content ?? ''}`.trim(),
      updatedAt: toMillis(cn.updatedAt),
    });
  }

  return allItems;
}
