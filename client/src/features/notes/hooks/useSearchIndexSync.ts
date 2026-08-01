/**
 * 搜索索引同步 hook
 * @ai-context 监听 useNoteStore 的笔记列表变化，自动同步 Dexie 搜索索引
 *
 * 设计目标：将搜索索引更新从 useNoteStore 的 CRUD 操作中解耦，
 * 由本 hook 在组件层监听变化后统一触发，保持 store 仅负责数据操作。
 *
 * 使用方式：在笔记页面顶层组件中调用一次即可
 * <code>useSearchIndexSync()</code>
 *
 * 注意：当前版本作为基础设施提供，useNoteStore 内的内联索引调用
 * 保持不变以确保向后兼容。后续版本可移除 store 内联调用，完全依赖本 hook。
 */

import { useEffect, useRef } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';
import { noteContentToPlainText } from '../lib/mindmap/mindmapText';
import type { Note } from '@/types/models';

/**
 * 搜索索引同步 hook
 *
 * 监听笔记列表变化，检测新增/更新/删除的笔记并同步搜索索引。
 * 挂载一次即可，自动处理增量同步。
 */
export function useSearchIndexSync(): void {
  const notes = useNoteStore(s => s.notes);
  const prevNotesMapRef = useRef<Map<string, Note>>(new Map());

  useEffect(() => {
    const prevMap = prevNotesMapRef.current;
    const currentMap = new Map<string, Note>();

    // 构建当前笔记映射
    for (const note of notes) {
      if (note.id) {
        currentMap.set(note.id, note);
      }
    }

    // 检测新增和更新的笔记
    for (const [id, note] of currentMap) {
      const prev = prevMap.get(id);
      if (!prev) {
        // 新增笔记 — 同步索引
        syncUpsert(note).catch(() => {});
      } else if (
        prev.updatedAt !== note.updatedAt ||
        prev.title !== note.title ||
        prev.content !== note.content
      ) {
        // 内容或标题变更 — 更新索引
        syncUpsert(note).catch(() => {});
      }
    }

    // 检测删除的笔记
    for (const [id] of prevMap) {
      if (!currentMap.has(id)) {
        dexieSearchIndexer.remove(id).catch(() => {});
      }
    }

    // 更新引用
    prevNotesMapRef.current = currentMap;
  }, [notes]);
}

// ─────────────────────────────────────────────────────────────
// 内部辅助
// ─────────────────────────────────────────────────────────────

/** 同步单条笔记到搜索索引（导图/TipTap 统一提取纯文本，避免 JSON 噪声入索引） */
async function syncUpsert(note: Note): Promise<void> {
  const ts = note.updatedAt instanceof Date
    ? note.updatedAt.getTime()
    : new Date(note.updatedAt as unknown as string).getTime();
  await dexieSearchIndexer.upsert(note.id, 'note', note.title, noteContentToPlainText(note.content), ts);
}
