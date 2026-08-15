/**
 * 笔记全文惰性加载 hook（P1-1）
 * Lazy full-content loading hook (P1-1)
 *
 * @ai-context: 从 NoteEditPage 拆出。列表投影后 notes[] 不含 content（图片
 * base64 内存治理），打开笔记时按需从库取解密全文；切换笔记时重新加载。
 * 读取失败保持空内容（静默）；卸载/切换时以 cancelled 标志防竞态写入。
 * @ai-context: Extracted from NoteEditPage. Store notes[] carry no content
 * (projection, base64 memory governance); full decrypted content is fetched
 * from the DB on open and reloaded on note switch. Read failures stay silent;
 * a cancelled flag guards against stale writes on unmount/switch.
 */
import { useEffect, useState } from 'react';
import { noteStore } from '@/lib/storage';

/**
 * 按 noteId 惰性加载全文，返回内容字符串。
 * Lazy-loads full content by noteId.
 *
 * @param noteId - 当前笔记 id（null 时清空）
 * @param initialContent - 列表投影携带的初始内容（可能缺失）
 */
export function useNoteFullContent(noteId: string | null, initialContent: string | undefined): string | undefined {
  const [fullContent, setFullContent] = useState<string | undefined>(initialContent);
  useEffect(() => {
    let cancelled = false;
    if (!noteId) {
      setFullContent(undefined);
      return () => { cancelled = true; };
    }
    setFullContent(undefined);
    noteStore.getById(noteId).then((n) => {
      if (!cancelled) setFullContent(n?.content);
    }).catch(() => { /* 读取失败保持空内容 */ });
    return () => { cancelled = true; };
  }, [noteId]);
  return fullContent;
}
