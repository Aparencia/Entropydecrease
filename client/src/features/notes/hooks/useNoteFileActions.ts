/**
 * @ai-context: 笔记文件操作 Hook：Markdown 导入为新笔记、复制笔记（惰性取回全文）、
 * 导出笔记为 Markdown（惰性取回全文）。自 NotesPage.tsx 原样拆出，逻辑与 Toast 行为不变。
 * @ai-context: Note file-ops hook (markdown import / duplicate / export) extracted
 * verbatim from NotesPage.tsx. Full content is lazily fetched on demand.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui';
import { noteStore } from '@/lib/storage';
import type { Note } from '@/types/models';
import { useNoteStore } from '../store/useNoteStore';
import { markdownToNoteContent, noteToMarkdown } from '../lib/markdown/noteMarkdown';

export function useNoteFileActions() {
  const createNote = useNoteStore((s) => s.createNote);
  const selectedFolderId = useNoteStore((s) => s.selectedFolderId);
  const selectNote = useNoteStore((s) => s.selectNote);
  const { toast } = useToast();
  const navigate = useNavigate();

  // 阶段四：导入 .md 文件为新笔记
  const handleImportMarkdown = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const md = await file.text();
      const content = markdownToNoteContent(md);
      const title = file.name.replace(/\.md$/i, '') || '导入笔记';
      const id = await createNote({ title, content, template: 'blank', folderId: selectedFolderId ?? undefined });
      toast({ type: 'success', message: 'Markdown 已导入' });
      selectNote(id); navigate(`/notes/${id}`);
    } catch {
      toast({ type: 'error', message: 'Markdown 导入失败' });
    }
  }, [createNote, selectedFolderId, toast, selectNote, navigate]);

  // P1-1：投影无 content 全文，复制前惰性取回（复制为显式操作，成本可接受）
  const handleDuplicateNote = useCallback(async (note: Note) => {
    const full = (await noteStore.getById(note.id))?.content ?? '';
    await createNote({ title: note.title + ' (副本)', content: full, folderId: note.folderId, tags: note.tags, template: note.template });
    toast({ type: 'success', message: '笔记已复制' });
  }, [createNote, toast]);

  // P1-1：投影无 content 全文，导出前惰性取回
  const handleExportNote = useCallback(async (note: Note) => {
    // 使用 noteToMarkdown 将 TipTap JSON 转为 Markdown（保留标题层级、列表、代码块等格式）
    const full = (await noteStore.getById(note.id))?.content ?? '';
    const md = noteToMarkdown(full);
    const text = `# ${note.title}\n\n${md}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${note.title || 'note'}-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
    toast({ type: 'success', message: '笔记已导出为 Markdown' });
  }, [toast]);

  return { handleImportMarkdown, handleDuplicateNote, handleExportNote };
}
