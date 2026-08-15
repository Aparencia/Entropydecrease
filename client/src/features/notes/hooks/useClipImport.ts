/**
 * @ai-context: 剪藏（网页/PDF 导入笔记）Hook：clipUrl/clipOpen/clipLoading 状态 +
 * URL 剪藏与 PDF 解析处理（经 window.electronAPI IPC 桥）。自 NotesPage.tsx 原样拆出，
 * 逻辑与 Toast 行为完全不变。
 * @ai-context: Clip-import (web URL / PDF into notes) hook extracted verbatim
 * from NotesPage.tsx. Uses the electron API IPC bridge for fetch/parse.
 */
import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui';
import { useNoteStore } from '../store/useNoteStore';

export function useClipImport() {
  const createNote = useNoteStore((s) => s.createNote);
  const selectedFolderId = useNoteStore((s) => s.selectedFolderId);
  const { toast } = useToast();
  const [clipUrl, setClipUrl] = useState('');
  const [clipOpen, setClipOpen] = useState(false);
  const [clipLoading, setClipLoading] = useState(false);

  const handleClipUrl = useCallback(async () => {
    if (!clipUrl.trim() || !window.electronAPI?.invoke) return;
    setClipLoading(true);
    try {
      const result = await window.electronAPI.invoke('import:fetch-url', { url: clipUrl.trim() }) as { success: boolean; content?: { title: string; text: string }; error?: string };
      if (result.success && result.content) {
        const { title, text } = result.content;
        await createNote({ title: title.slice(0, 100), content: text, template: 'blank', folderId: selectedFolderId ?? undefined });
        toast({ type: 'success', message: `网页已剪藏为笔记：${title.slice(0, 30)}`, silent: true });
        setClipUrl('');
      } else {
        toast({ type: 'warning', message: result.error || '剪藏失败，请手动粘贴内容' });
      }
    } catch {
      toast({ type: 'error', message: '剪藏失败，请检查网络或手动粘贴' });
    } finally {
      setClipLoading(false);
    }
  }, [clipUrl, createNote, selectedFolderId, toast]);

  const handleClipPdf = useCallback(async () => {
    if (!window.electronAPI?.invoke) return;
    setClipLoading(true);
    try {
      const result = await window.electronAPI.invoke('import:parse-pdf') as { success: boolean; content?: { title: string; text: string }; canceled?: boolean; error?: string };
      if (result.canceled) { setClipLoading(false); return; }
      if (result.success && result.content) {
        const { title, text } = result.content;
        await createNote({ title: title.slice(0, 100), content: text, template: 'blank', folderId: selectedFolderId ?? undefined });
        toast({ type: 'success', message: `PDF 已导入为笔记：${title.slice(0, 30)}`, silent: true });
      } else {
        toast({ type: 'warning', message: result.error || 'PDF 导入失败' });
      }
    } catch {
      toast({ type: 'error', message: 'PDF 导入失败' });
    } finally {
      setClipLoading(false);
    }
  }, [createNote, selectedFolderId, toast]);

  return { clipUrl, setClipUrl, clipOpen, setClipOpen, clipLoading, handleClipUrl, handleClipPdf };
}
