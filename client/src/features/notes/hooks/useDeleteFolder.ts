/**
 * @ai-context: 删除分组 Hook：确认目标/复选状态 + 递归笔记数统计 +
 * 确认删除处理（默认移回根目录，可选连同组内全部笔记删除）。自 NotesPage.tsx 原样拆出。
 * @ai-context: Delete-folder flow hook (target/checkbox state, recursive note
 * count, confirm handler) extracted verbatim from NotesPage.tsx.
 */
import { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/components/ui';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { NoteFolder } from '@/types/models';
import { useNoteStore } from '../store/useNoteStore';
import { collectFolderTreeIds } from '../lib/folderTree';

export function useDeleteFolder() {
  const folders = useNoteStore((s) => s.folders);
  const notes = useNoteStore((s) => s.notes);
  const deleteFolder = useNoteStore((s) => s.deleteFolder);
  const deleteFolderWithNotes = useNoteStore((s) => s.deleteFolderWithNotes);
  const { toast } = useToast();
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<NoteFolder | null>(null);
  const [withNotesChecked, setWithNotesChecked] = useState(false);

  // 递归统计分组树（含子孙分组）下的笔记数，供弹窗文案与复选框展示
  // （必须在 confirm 之前声明——后者依赖它，TDZ 防护）
  const noteCount = useMemo(() => {
    if (!deleteFolderTarget) return 0;
    const treeIds = collectFolderTreeIds(folders, deleteFolderTarget.id);
    return notes.filter((n) => n.folderId && treeIds.includes(n.folderId)).length;
  }, [deleteFolderTarget, folders, notes]);

  const confirm = useCallback(async () => {
    if (!deleteFolderTarget) return;
    try {
      if (withNotesChecked) {
        await deleteFolderWithNotes(deleteFolderTarget.id);
        soundPlayer.play('feedback_delete');
        toast({ type: 'success', message: `分组「${deleteFolderTarget.name}」及其 ${noteCount} 篇笔记已删除`, silent: true });
      } else {
        await deleteFolder(deleteFolderTarget.id);
        soundPlayer.play('feedback_delete');
        toast({ type: 'success', message: `分组「${deleteFolderTarget.name}」已删除，组内笔记已移至全部笔记`, silent: true });
      }
    } catch (err) {
      toast({ type: 'error', message: `删除失败：${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setDeleteFolderTarget(null);
      setWithNotesChecked(false);
    }
  }, [deleteFolderTarget, deleteFolder, deleteFolderWithNotes, withNotesChecked, noteCount, toast]);

  return {
    deleteFolderTarget, setDeleteFolderTarget,
    withNotesChecked, setWithNotesChecked,
    noteCount, confirm,
  };
}
