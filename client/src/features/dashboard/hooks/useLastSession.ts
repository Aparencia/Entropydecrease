/**
 * @ai-context: dashboard 功能模块 Hook：useLastSession。
 */
import { useEffect, useState } from 'react';
import { createStorage } from '@/lib/storage/storageFactory';
import type { Note } from '@/types/models';
import type { LastSessionData } from '../types';

/** 从 TipTap JSON 递归提取纯文本 */
function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractText).join('');
  }
  return '';
}

const notesStore = createStorage<Note>('notes');

/**
 * 查询最近一条笔记，返回标题 + 末尾 200 字摘录
 */
export function useLastSession(): LastSessionData | undefined {
  const [data, setData] = useState<LastSessionData | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await notesStore.getAll();
        if (cancelled || all.length === 0) return;

        // 按 createdAt 降序取第一条
        const sorted = all.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        const latest = sorted[0];
        const fullText = extractText(JSON.parse(latest.content || '{}'));
        const excerpt = fullText.length > 200
          ? fullText.slice(fullText.length - 200)
          : fullText;

        setData({
          noteTitle: latest.title || '无标题笔记',
          noteExcerpt: excerpt || '（无内容）',
          noteId: latest.id,
          studiedAt: new Date(latest.updatedAt).toISOString(),
        });
      } catch {
        // 存储不可用时静默失败
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return data;
}
