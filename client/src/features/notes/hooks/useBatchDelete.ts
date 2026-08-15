/**
 * @ai-context: 批量删除 Hook：批量选择状态（useBatchSelection）+ 确认弹窗开关 +
 * 确认删除处理（真删除不可撤销）。自 NotesPage.tsx 原样拆出。
 * @ai-context: Batch-delete hook (selection state + confirm dialog + delete
 * handler) extracted verbatim from NotesPage.tsx.
 */
import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useBatchSelection } from '@/hooks/useBatchSelection';
import type { Note } from '@/types/models';
import { useNoteStore } from '../store/useNoteStore';

export function useBatchDelete(items: Note[]) {
  const batch = useBatchSelection<Note>({ items });
  const deleteNotesBatch = useNoteStore((s) => s.deleteNotesBatch);
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const confirm = useCallback(async () => {
    const ids = Array.from(batch.selectedIds);
    if (ids.length === 0) return;
    try {
      await deleteNotesBatch(ids);
      soundPlayer.play('feedback_delete');
      toast({ type: 'success', message: `已删除 ${ids.length} 篇笔记`, silent: true });
    } catch (err) {
      toast({ type: 'error', message: `删除失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setDeleteOpen(false);
      batch.exit();
    }
  }, [batch, deleteNotesBatch, toast]);

  return { batch, deleteOpen, setDeleteOpen, confirm };
}
