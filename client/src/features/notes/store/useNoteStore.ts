/**
 * 笔记状态仓库（组合入口）— slice 拆分
 * Note store — composition entry after slice split
 *
 * @ai-context: 拆分自 611 行单体（R3 遗留项）：类型/契约在 noteStoreTypes，
 * 笔记 CRUD/标签/模板在 noteSlice，文件夹 CRUD 在 folderSlice，搜索/筛选在
 * searchSlice；模板常量在 lib/templates，投影查询在 lib/noteProjection，
 * 排序纯函数在 lib/noteSort。本文件仅组合 slice 与初始状态 + 选择器 hooks。
 * 旧导入路径（useNoteStore 及全部选择器）全兼容，state 字段名与 action 语义
 * 保持不变。
 * @ai-context: Split from the 611-line monolith into three store slices plus
 * lib modules. This entry composes slices, initial state and selector hooks;
 * every legacy import path and store shape is preserved.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { NoteState } from './noteStoreTypes';
import { createNoteSlice } from './noteSlice';
import { createFolderSlice } from './folderSlice';
import { createSearchSlice } from './searchSlice';

export const useNoteStore = create<NoteState>((set, get, store) => ({
  // ── 初始数据 ──
  notes: [],
  folders: [],
  isLoading: false,
  selectedNoteId: null,
  selectedFolderId: null,
  searchQuery: '',
  selectedTags: [],
  selectedTemplate: null,
  searchResults: [],
  selectedEntityTypes: [],

  // ── slices ──
  ...createNoteSlice(set, get, store),
  ...createFolderSlice(set, get, store),
  ...createSearchSlice(set, get, store),
}));

// ─── 向后兼容 re-export ──────────────────────────────────────────────────────

export type { NoteState } from './noteStoreTypes';

// ---------------------------------------------------------------------------
// 选择器 Hooks
// ---------------------------------------------------------------------------

/** 仅订阅笔记列表 */
export const useNotes = () =>
  useNoteStore(s => s.notes);

/** 仅订阅文件夹列表 */
export const useNoteFolders = () =>
  useNoteStore(s => s.folders);

/** 仅订阅加载状态 */
export const useNoteLoading = () =>
  useNoteStore(s => s.isLoading);

/** 仅订阅选中笔记 ID */
export const useNoteSelectedId = () =>
  useNoteStore(s => s.selectedNoteId);

/** 仅订阅搜索关键词 */
export const useNoteSearchQuery = () =>
  useNoteStore(s => s.searchQuery);

/** 笔记筛选状态（复合，useShallow） */
export const useNoteFilterState = () =>
  useNoteStore(useShallow(s => ({
    selectedFolderId: s.selectedFolderId,
    searchQuery: s.searchQuery,
    selectedTags: s.selectedTags,
  })));

/** 笔记上下文（列表+选中+加载，复合） */
export const useNoteContext = () =>
  useNoteStore(useShallow(s => ({
    notes: s.notes,
    selectedNoteId: s.selectedNoteId,
    isLoading: s.isLoading,
  })));
