/**
 * 笔记状态仓库 — 文件夹 CRUD slice
 * Note store — folder CRUD slice
 *
 * @ai-context: 从 useNoteStore 拆出。数据层 NoteFolder 支持 parentId 嵌套
 * （UI 仅渲染一级），删除必须整树处理：deleteFolder 把整树笔记移到根目录，
 * deleteFolderWithNotes 真删除整树笔记并清理搜索/链接索引，避免 parentId
 * 悬挂与孤儿笔记。
 * @ai-context: Extracted from useNoteStore. Deletion always walks the whole
 * folder subtree — either relocating its notes to root or deleting them.
 */
import { noteStore, noteFolderStore } from '@/lib/storage';
import { createWithLog, updateWithLog, deleteWithLog } from '@/lib/storage/writeWithLog';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';
import { removeLinks } from '../lib/links/noteLinkStore';
import { collectFolderTreeIds } from '../lib/folderTree';
import type { NoteSlice, NoteState } from './noteStoreTypes';

type FolderSliceActions = Pick<NoteState,
  | 'loadFolders' | 'createFolder' | 'updateFolder'
  | 'deleteFolder' | 'deleteFolderWithNotes' | 'selectFolder'
>;

export const createFolderSlice: NoteSlice<FolderSliceActions> = (set, get) => ({
  loadFolders: async () => {
    const folders = await noteFolderStore.getAll();
    set({ folders });
  },

  createFolder: async (name, parentId?, color?) => {
    const folderData = {
      name,
      parentId,
      color,
      createdAt: new Date(),
      order: Date.now(),
    };
    const id = await createWithLog(noteFolderStore, 'noteFolders', folderData);
    await get().loadFolders();
    return id;
  },

  updateFolder: async (id, changes) => {
    await updateWithLog(noteFolderStore, 'noteFolders', id, changes);
    await get().loadFolders();
  },

  deleteFolder: async (id) => {
    // 递归收集分组树（数据层支持 parentId 嵌套，UI 仅渲染一级）
    const { notes, folders, selectedFolderId } = get();
    const treeIds = collectFolderTreeIds(folders, id);
    // 整棵分组树下的笔记移到根目录（folderId 设为 undefined）
    const affected = notes.filter((n) => n.folderId && treeIds.includes(n.folderId));
    for (const note of affected) {
      if (note.id !== undefined) {
        await updateWithLog(noteStore, 'notes', note.id, { folderId: undefined });
      }
    }
    // 删除分组树（含根与全部子孙，避免 parentId 悬挂）
    for (const folderId of treeIds) {
      await deleteWithLog(noteFolderStore, 'noteFolders', folderId);
    }
    if (selectedFolderId && treeIds.includes(selectedFolderId)) {
      set({ selectedFolderId: null });
    }
    await get().loadFolders();
    await get().loadNotes();
  },

  deleteFolderWithNotes: async (id) => {
    const { notes, folders, selectedNoteId, selectedFolderId } = get();
    const treeIds = collectFolderTreeIds(folders, id);
    // 整棵分组树下的笔记全部真删除（清理搜索/链接索引）
    const noteIds = notes
      .filter((n) => n.folderId && treeIds.includes(n.folderId))
      .map((n) => n.id)
      .filter((nid): nid is string => nid !== undefined);
    for (const noteId of noteIds) {
      await deleteWithLog(noteStore, 'notes', noteId);
      try { await dexieSearchIndexer.remove(noteId); } catch { /* 忽略 */ }
      removeLinks(noteId).catch((err) => {
        console.debug('[noteStore] removeLinks failed (folder delete)', noteId, err);
      });
    }
    // 删除分组树（含根与全部子孙）
    for (const folderId of treeIds) {
      await deleteWithLog(noteFolderStore, 'noteFolders', folderId);
    }
    if (selectedNoteId && noteIds.includes(selectedNoteId)) {
      set({ selectedNoteId: null });
    }
    if (selectedFolderId && treeIds.includes(selectedFolderId)) {
      set({ selectedFolderId: null });
    }
    await get().loadFolders();
    await get().loadNotes();
  },

  selectFolder: (id) => {
    set({ selectedFolderId: id });
  },
});
