/**
 * 笔记状态仓库 — 类型定义与 slice 工具
 * Note store — type definitions and slice helper
 *
 * @ai-context: 从 useNoteStore 拆出。NoteState 为全 store 契约，slice
 * （noteSlice/folderSlice/searchSlice）各实现其子集；getFilteredNotes 为
 * 计算属性（文件夹/搜索/标签/模板四级过滤 + 排序）。
 * @ai-context: Extracted from useNoteStore. NoteState is the full store
 * contract; each slice implements its own subset.
 */
import type { StateCreator } from 'zustand';
import type { SearchResultItem } from '@/lib/search/types';
import type { Note, NoteFolder, SearchEntityType } from '@/types/models';
import type { TodoItem } from '../lib/todoTemplate';

export interface NoteState {
  // 数据
  notes: Note[];
  folders: NoteFolder[];
  isLoading: boolean;
  selectedNoteId: string | null;
  selectedFolderId: string | null;
  searchQuery: string;
  selectedTags: string[];
  /** 模板筛选：null=全部（内测反馈：卡片模板 Tag 可点击筛选） */
  selectedTemplate: Note['template'] | null;
  /** v0.9.0: 全文搜索结果 */
  searchResults: SearchResultItem[];
  /** v1.2.0: 当前搜索选中的实体类型过滤（空数组表示全部） */
  selectedEntityTypes: SearchEntityType[];

  // 笔记操作
  loadNotes: () => Promise<void>;
  createNote: (data: {
    title: string;
    content?: string;
    template?: Note['template'];
    folderId?: string;
    tags?: string[];
    /** 来源溯源（知识入籍流程写入） */
    sourceRef?: string;
  }) => Promise<string>;
  updateNote: (id: string, changes: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  /** 批量删除笔记（多选模式；逐篇清理搜索/链接索引后统一重载） */
  deleteNotesBatch: (ids: string[]) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  selectNote: (id: string | null) => void;

  // 文件夹操作
  loadFolders: () => Promise<void>;
  createFolder: (name: string, parentId?: string, color?: string) => Promise<string>;
  updateFolder: (id: string, changes: Partial<NoteFolder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  /** 删除分组树并同时删除组内全部笔记（含子孙分组，不可撤销） */
  deleteFolderWithNotes: (id: string) => Promise<void>;
  selectFolder: (id: string | null) => void;

  // 搜索
  setSearchQuery: (query: string) => void;
  /** v0.9.0: 全文搜索（基于 Dexie 索引 + BM25 评分） */
  searchNotes: (query: string, options?: { limit?: number; fuzzy?: boolean; entityTypes?: SearchEntityType[] }) => Promise<void>;
  /** v1.2.0: 设置搜索实体类型过滤 */
  setSelectedEntityTypes: (types: SearchEntityType[]) => void;

  // 标签筛选
  toggleTag: (tag: string) => void;
  clearTagFilter: () => void;
  /** 模板筛选（点击卡片模板 Tag 切换；再点取消） */
  toggleTemplate: (template: Note['template']) => void;
  getAllTags: () => string[];

  // 标签管理（单篇笔记级别）
  /** v0.9.0: 为指定笔记添加标签 */
  addTag: (noteId: string, tag: string) => Promise<void>;
  /** v0.9.0: 从指定笔记移除标签 */
  removeTag: (noteId: string, tag: string) => Promise<void>;

  // 模板
  createFromTemplate: (template: Note['template'], folderId?: string) => Promise<string>;
  /** v0.11.0: 创建待办笔记（从灵感分拣桥接） */
  createTodoNote: (todo: Omit<TodoItem, 'id'>, subject?: string) => Promise<string>;
  /** 知识半衰期：设置笔记过期时间 */
  setExpiry: (id: string, expiresAt: Date | null) => Promise<void>;
  /** 情绪锚点：设置学习情绪标记 */
  setMood: (id: string, mood: string | null) => Promise<void>;

  // 计算属性
  getFilteredNotes: () => Note[];
}

/** slice 创建函数类型（全 state 可见，实现自身子集） */
export type NoteSlice<T> = StateCreator<NoteState, [], [], T>;
