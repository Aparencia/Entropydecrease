/**
 * 笔记概念索引存储（Dexie 持久化）
 * Note concept index store (Dexie persistence)
 *
 * @ai-context: 存储 AI 从笔记中提取的概念实体，供费曼推荐、概念图谱等
 * 功能使用。概念由 useConceptExtractor hook 异步提取并写入。
 * @ai-context: Stores AI-extracted concept entities from notes, used by
 * Feynman recommendation, concept graph, etc.
 */
import { db } from '@/lib/storage/database';
import type { NoteConcept } from '@/types/models';

/**
 * 为某篇笔记保存概念列表（先删旧概念再批量写入，幂等）。
 * Save concept list for a note (delete-then-rewrite, idempotent).
 */
export async function saveConcepts(
  noteId: string,
  concepts: Array<{ name: string; relevance: number; context: string }>,
): Promise<void> {
  const now = new Date();
  await db.transaction('rw', db.noteConcepts, async () => {
    await db.noteConcepts.where('noteId').equals(noteId).delete();
    const rows: NoteConcept[] = concepts.map((c, i) => ({
      id: `${noteId}-concept-${i}-${Date.now()}`,
      noteId,
      name: c.name,
      relevance: c.relevance,
      context: c.context,
      createdAt: now,
      updatedAt: now,
    }));
    if (rows.length > 0) await db.noteConcepts.bulkPut(rows);
  });
}

/**
 * 获取某篇笔记的所有概念。
 * Get all concepts for a note.
 */
export async function getConcepts(noteId: string): Promise<NoteConcept[]> {
  return db.noteConcepts.where('noteId').equals(noteId).toArray();
}

/**
 * 获取所有笔记中相关度最高的概念（用于全局概念图谱）。
 * Get top concepts across all notes (for global concept graph).
 */
export async function getTopConcepts(limit = 50): Promise<NoteConcept[]> {
  return db.noteConcepts
    .orderBy('relevance')
    .reverse()
    .limit(limit)
    .toArray();
}

/**
 * 按名称搜索概念（模糊匹配，用于费曼推荐）。
 * Search concepts by name (fuzzy match, for Feynman recommendation).
 */
export async function searchConcepts(query: string): Promise<NoteConcept[]> {
  const all = await db.noteConcepts.toArray();
  const q = query.toLowerCase();
  return all
    .filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 20);
}

/**
 * 删除某篇笔记的所有概念。
 * Remove all concepts for a note.
 */
export async function removeConcepts(noteId: string): Promise<void> {
  await db.noteConcepts.where('noteId').equals(noteId).delete();
}