/**
 * 课堂笔记持久化存储
 * 将 AI 分析生成的课堂笔记保存到 IndexedDB (Dexie)
 *
 * @ai-context: 写入/删除时同步维护全局搜索索引（失败静默，搜索缺失
 * 可通过 rebuildIndex 恢复）。content 为 Markdown 而非 TipTap JSON。
 */

import { db } from './database';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';

export interface ClassroomNote {
  id: string;
  sessionId: string;
  title: string;
  content: string; // Markdown
  keyframesAnalyzed: number;
  modelUsed: string;
  sourceType: 'smart' | 'video';
  duration: number; // seconds
  createdAt: Date;
  updatedAt: Date;
}

export const classroomNoteStore = {
  async create(note: Omit<ClassroomNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record: ClassroomNote = {
      ...note,
      id,
      createdAt: now,
      updatedAt: now,
    };
    await db.classroomNotes.add(record);
    // v1.2.0: 同步全局搜索索引
    try {
      await dexieSearchIndexer.upsert(
        id,
        'classroom',
        note.title ?? '课堂笔记',
        `${note.title ?? ''} ${note.content ?? ''}`.trim(),
        now.getTime(),
      );
    } catch { /* 忽略 */ }
    return id;
  },

  async getAll(): Promise<ClassroomNote[]> {
    return db.classroomNotes.orderBy('createdAt').reverse().toArray();
  },

  async getBySessionId(sessionId: string): Promise<ClassroomNote | undefined> {
    return db.classroomNotes.where('sessionId').equals(sessionId).first();
  },

  async delete(id: string): Promise<void> {
    await db.classroomNotes.delete(id);
    // v1.2.0: 删除搜索索引
    try { await dexieSearchIndexer.remove(id, 'classroom'); } catch { /* 忽略 */ }
  },
};
