/**
 * @ai-context: 笔记页核心动作 Hook：新建笔记/模板新建/新建分组/选中/重命名/置顶/删除 +
 * 删除目标状态 + 右键菜单分组与动作（内部复用 useNoteContextActions）。
 * 自 NotesPage.tsx 原样拆出；newFolderName 输入值与播客触发经 options 注入。
 * @ai-context: Core note-actions hook (create/select/rename/pin/delete + context
 * menu via useNoteContextActions) extracted verbatim from NotesPage.tsx.
 * The new-folder input value and podcast trigger are injected via options.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { Note } from '@/types/models';
import { useNoteStore } from '../store/useNoteStore';
import type { NoteTemplate } from '../components/TemplateSelector';
import { useNoteContextActions } from './useNoteContextActions';

interface UseNoteActionsOptions {
  /** 当前新建文件夹输入值（handleCreateFolder 使用） */
  newFolderName: string;
  /** 新建文件夹成功后清空输入并收起输入框 */
  onNewFolderCreated: () => void;
  /** 复制笔记（useNoteFileActions 提供） */
  onDuplicate: (note: Note) => void;
  /** 导出笔记为 Markdown（useNoteFileActions 提供） */
  onExport: (note: Note) => void;
  /** 播客触发：设置 topic/showPodcast 并调用 generatePodcast */
  onPodcast: (topic: string) => void;
}

export function useNoteActions({ newFolderName, onNewFolderCreated, onDuplicate, onExport, onPodcast }: UseNoteActionsOptions) {
  const selectedFolderId = useNoteStore((s) => s.selectedFolderId);
  const createNote = useNoteStore((s) => s.createNote);
  const createFolder = useNoteStore((s) => s.createFolder);
  const updateFolder = useNoteStore((s) => s.updateFolder);
  const selectNote = useNoteStore((s) => s.selectNote);
  const createFromTemplate = useNoteStore((s) => s.createFromTemplate);
  const togglePin = useNoteStore((s) => s.togglePin);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleTemplateSelect = async (tpl: NoteTemplate) => {
    const id = await createFromTemplate(tpl, selectedFolderId ?? undefined);
    selectNote(id); navigate(`/notes/${id}`);
  };
  const handleCreateNote = async () => {
    const id = await createNote({ title: '新笔记', template: 'blank', folderId: selectedFolderId ?? undefined });
    selectNote(id); navigate(`/notes/${id}`);
  };
  const handleCreateFolder = async () => {
    if (newFolderName.trim()) { await createFolder(newFolderName.trim()); onNewFolderCreated(); }
  };
  const handleSelectNote = useCallback((noteId: string) => { selectNote(noteId); navigate(`/notes/${noteId}`); }, [selectNote, navigate]);
  const handleRenameFolder = useCallback(async (id: string, newName: string) => {
    await updateFolder(id, { name: newName });
  }, [updateFolder]);

  const handleTogglePin = useCallback((noteId: string) => { togglePin(noteId); toast({ type: 'success', message: '已更新置顶状态' }); }, [togglePin, toast]);
  const handleDeleteNote = useCallback((id: string) => { setDeleteTargetId(id); }, []);
  const handleConfirmDelete = useCallback(async () => {
    if (deleteTargetId) { await deleteNote(deleteTargetId); soundPlayer.play('feedback_delete'); toast({ type: 'success', message: '笔记已删除', silent: true }); }
    setDeleteTargetId(null);
  }, [deleteTargetId, deleteNote, toast]);

  // 右键菜单动作（打开/置顶/复制/导出/保质期/AI 摘要/闪卡/播客/删除）
  const { ctxMenuGroups, handleCtxMenuSelect } = useNoteContextActions({
    onOpen: handleSelectNote,
    onTogglePin: handleTogglePin,
    onDuplicate,
    onExport,
    onDelete: handleDeleteNote,
    onPodcast,
  });

  return {
    deleteTargetId, setDeleteTargetId,
    handleTemplateSelect, handleCreateNote, handleCreateFolder,
    handleSelectNote, handleRenameFolder, handleTogglePin, handleConfirmDelete,
    ctxMenuGroups, handleCtxMenuSelect,
  };
}
