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
    if (!clipUrl.trim()) return;
    setClipLoading(true);
    try {
      let title = '';
      let text = '';
      if (window.electronAPI?.invoke) {
        // Electron：主进程 fetch（无 CORS 限制）+ 解析
        const result = await window.electronAPI.invoke('import:fetch-url', { url: clipUrl.trim() }) as { success: boolean; content?: { title: string; text: string }; error?: string };
        if (!result.success || !result.content) {
          toast({ type: 'warning', message: result.error || '剪藏失败，请手动粘贴内容' });
          return;
        }
        title = result.content.title;
        text = result.content.text;
      } else {
        // PWA/浏览器：直接 fetch + DOMParser 提取标题与正文（受 CORS 限制，
        // 目标站点不允许跨域时抛出并降级为手动粘贴提示）
        const resp = await fetch(clipUrl.trim(), { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        title = doc.title || new URL(clipUrl.trim()).hostname;
        text = doc.body?.innerText?.trim() ?? '';
        if (!text) throw new Error('empty page');
      }
      await createNote({ title: title.slice(0, 100) || '未命名剪藏', content: text, template: 'blank', folderId: selectedFolderId ?? undefined });
      toast({ type: 'success', message: `网页已剪藏为笔记：${title.slice(0, 30)}`, silent: true });
      setClipUrl('');
    } catch {
      toast({ type: 'warning', message: '剪藏失败：该网站不允许直接抓取，请手动复制内容' });
    } finally {
      setClipLoading(false);
    }
  }, [clipUrl, createNote, selectedFolderId, toast]);

  const handleClipPdf = useCallback(async () => {
    if (!window.electronAPI?.invoke) {
      // PWA/浏览器：明确降级提示（浏览器无内置 PDF 文本解析，MVP 阶段引导桌面端导入）
      toast({ type: 'warning', message: '移动端暂不支持 PDF 直接导入，请用桌面端导入或复制文本' });
      return;
    }
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
