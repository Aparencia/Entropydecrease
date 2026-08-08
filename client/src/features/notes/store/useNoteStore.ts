import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { noteStore, noteFolderStore } from '@/lib/storage';
import { createWithLog, updateWithLog, deleteWithLog } from '@/lib/storage/writeWithLog';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';
import type { SearchResultItem } from '@/lib/search/types';
import type { Note, NoteFolder, SearchEntityType } from '@/types/models';
import { createTodoTemplateContent, createEmptyTodoTemplate } from '../lib/todoTemplate';
import { createDefaultMindmap } from '../lib/mindmap/mindmapOps';
import { noteContentToPlainText } from '../lib/mindmap/mindmapText';
import { recomputeLinks, removeLinks } from '../lib/links/noteLinkStore';
import { collectFolderTreeIds } from '../lib/folderTree';
import { extractNoteText } from '../lib/extractNoteText';
import type { TodoItem } from '../lib/todoTemplate';

interface NoteState {
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

const sortNotes = (notes: Note[]): Note[] => {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
};

const TEMPLATE_CONTENT: Record<Note['template'], string> = {
  outline: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '大纲笔记' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '一、' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '二、' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '三、' }] },
    ],
  }),
  cornell: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '康奈尔笔记' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '线索栏' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '关键词 / 问题' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '笔记栏' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '主要内容记录' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '总结栏' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '归纳总结' }] },
    ],
  }),
  qa: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '问答笔记' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Q1' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A1' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Q2' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A2' }] },
    ],
  }),
  /** 思维导图模板：创建时由 createFromTemplate 调 createDefaultMindmap 动态生成（全新节点 id），此处仅占位 */
  mindmap: '',
  free: '',
  'qa-grid': JSON.stringify({
    rows: [],
  }),
  timeline: JSON.stringify({
    events: [],
  }),
  blank: '',
  video: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '视频笔记' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '在此记录视频学习内容，可使用时间戳标记关联视频进度。' }] },
    ],
  }),
  /** v0.11.0: 待办笔记模板占位内容（实际创建时由 createTodoNote 动态生成） */
  todo: createEmptyTodoTemplate(),
};

const TEMPLATE_TITLES: Record<Note['template'], string> = {
  outline: '大纲笔记',
  cornell: '康奈尔笔记',
  qa: '问答笔记',
  mindmap: '思维导图笔记',
  free: '自由笔记',
  'qa-grid': '问答网格',
  timeline: '时间线笔记',
  blank: '空白笔记',
  video: '视频笔记',
  /** v0.11.0 */
  todo: '待办笔记',
};

export const useNoteStore = create<NoteState>((set, get) => {
  return {
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

    loadNotes: async () => {
      set({ isLoading: true });
      try {
        const notes = await noteStore.getAll();
        set({ notes: sortNotes(notes), isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    },

    createNote: async (data) => {
      const now = new Date();
      const content = data.content ?? '';
      const noteData = {
        title: data.title,
        content,
        template: data.template ?? 'blank',
        folderId: data.folderId,
        tags: data.tags ?? [],
        sourceRef: data.sourceRef,
        createdAt: now,
        updatedAt: now,
        wordCount: noteContentToPlainText(content).length,
        pinned: false,
      };
      const id = await createWithLog(noteStore, 'notes', noteData);
      // v0.9.0: 自动更新搜索索引
      try {
        await dexieSearchIndexer.upsert(id, 'note', data.title, noteContentToPlainText(content), now.getTime());
      } catch {
        // 索引更新失败不阻塞笔记创建
      }
      // 阶段二：重建出链索引（fire-and-forget，失败不阻塞）
      recomputeLinks(id, content).catch(() => {});
      await get().loadNotes();
      return id;
    },

    updateNote: async (id, changes) => {
      const updateData: Partial<Note> = { ...changes, updatedAt: new Date() };
      if (changes.content !== undefined) {
        updateData.wordCount = noteContentToPlainText(changes.content).length;
      }
      await updateWithLog(noteStore, 'notes', id, updateData);
      // 局部更新内存数组并重排（updatedAt 变化需重排），避免全量 loadNotes：
      // 原实现每次自动保存都从 IndexedDB 全量重载所有笔记 + 触发全页重渲染，
      // 笔记上百后打字明显卡顿（P0 性能修复）。
      const existing = get().notes.find((n) => n.id === id);
      const merged = existing ? { ...existing, ...updateData } : null;
      set((s) => ({
        notes: sortNotes(s.notes.map((n) => (n.id === id ? { ...n, ...updateData } : n))),
      }));
      // v0.9.0: 自动更新搜索索引（用内存合并结果，省去额外 getById 往返）
      try {
        if (merged) {
          const ts = updateData.updatedAt instanceof Date
            ? updateData.updatedAt.getTime()
            : new Date(updateData.updatedAt as unknown as string).getTime();
          await dexieSearchIndexer.upsert(id, 'note', merged.title, noteContentToPlainText(merged.content ?? ''), ts);
        }
      } catch {
        // 索引更新失败不阻塞笔记更新
      }
      // 阶段二：内容变更时重建出链索引
      if (changes.content !== undefined && merged) {
        recomputeLinks(id, merged.content ?? '').catch(() => {});
      }
    },

    deleteNote: async (id) => {
      await deleteWithLog(noteStore, 'notes', id);
      // v0.9.0: 删除搜索索引
      try { await dexieSearchIndexer.remove(id); } catch { /* 忽略 */ }
      // 阶段二：清理链接索引（fire-and-forget）
      removeLinks(id).catch(() => {});
      const { selectedNoteId } = get();
      if (selectedNoteId === id) {
        set({ selectedNoteId: null });
      }
      await get().loadNotes();
    },

    deleteNotesBatch: async (ids) => {
      if (ids.length === 0) return;
      // 批量删除笔记（bulkDelete 代替逐条串行，大幅减少 IndexedDB 事务开销）
      await noteStore.bulkDelete(ids);
      // 并行清理搜索索引与链接索引（fire-and-forget，失败不阻塞）
      await Promise.all([
        Promise.all(ids.map((id) => dexieSearchIndexer.remove(id).catch(() => {}))),
        Promise.all(ids.map((id) => removeLinks(id).catch(() => {}))),
      ]);
      const { selectedNoteId } = get();
      if (selectedNoteId && ids.includes(selectedNoteId)) {
        set({ selectedNoteId: null });
      }
      await get().loadNotes();
    },

    togglePin: async (id) => {
      const note = await noteStore.getById(id);
      if (note) {
        await updateWithLog(noteStore, 'notes', id, { pinned: !note.pinned, updatedAt: new Date() });
        await get().loadNotes();
      }
    },

    selectNote: (id) => {
      set({ selectedNoteId: id });
    },

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
        removeLinks(noteId).catch(() => {});
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

    setSearchQuery: (query) => {
      set({ searchQuery: query });
    },

    searchNotes: async (query, options) => {
      if (!query.trim()) {
        set({ searchResults: [], searchQuery: '' });
        return;
      }
      set({ searchQuery: query });
      try {
        const result = await dexieSearchIndexer.search({
          query,
          limit: options?.limit ?? 20,
          fuzzy: options?.fuzzy ?? false,
          entityTypes: options?.entityTypes ?? get().selectedEntityTypes,
        });
        set({ searchResults: result.items });
      } catch {
        set({ searchResults: [] });
      }
    },

    setSelectedEntityTypes: (types) => {
      set({ selectedEntityTypes: types });
    },

    toggleTag: (tag) => {
      const { selectedTags } = get();
      if (selectedTags.includes(tag)) {
        set({ selectedTags: selectedTags.filter((t) => t !== tag) });
      } else {
        set({ selectedTags: [...selectedTags, tag] });
      }
    },

    clearTagFilter: () => {
      set({ selectedTags: [] });
    },

    toggleTemplate: (template) => {
      const { selectedTemplate } = get();
      set({ selectedTemplate: selectedTemplate === template ? null : template });
    },

    addTag: async (noteId, tag) => {
      const note = await noteStore.getById(noteId);
      if (!note || note.tags.includes(tag)) return;
      const updatedTags = [...note.tags, tag];
      await updateWithLog(noteStore, 'notes', noteId, { tags: updatedTags, updatedAt: new Date() });
      await get().loadNotes();
    },

    removeTag: async (noteId, tag) => {
      const note = await noteStore.getById(noteId);
      if (!note) return;
      const updatedTags = note.tags.filter((t) => t !== tag);
      await updateWithLog(noteStore, 'notes', noteId, { tags: updatedTags, updatedAt: new Date() });
      await get().loadNotes();
    },

    getAllTags: () => {
      const { notes } = get();
      const tagSet = new Set<string>();
      for (const note of notes) {
        for (const tag of note.tags) {
          tagSet.add(tag);
        }
      }
      return Array.from(tagSet).sort();
    },

    createFromTemplate: async (template, folderId?) => {
      // 思维导图每次创建生成全新节点 id（不复用模板占位字符串）
      const content = template === 'mindmap'
        ? JSON.stringify(createDefaultMindmap())
        : TEMPLATE_CONTENT[template];
      const title = TEMPLATE_TITLES[template];
      return get().createNote({ title, content, template, folderId });
    },

    /**
     * v0.11.0: 创建待办笔记（灵感分拣桥接入口）
     * @ai-context 从 AISortPanel 转化按钮或手动新建待办时调用。
     * 副作用：写入 IndexedDB + 搜索索引，触发 loadNotes 刷新列表。
     */
    createTodoNote: async (todo, subject?) => {
      // 根据 subject 查找匹配的文件夹 ID（如果存在）
      let folderId: string | undefined;
      if (subject) {
        const { folders } = get();
        const matched = folders.find((f) => f.name === subject);
        if (matched?.id) folderId = matched.id;
      }
      const content = createTodoTemplateContent(todo);
      const title = todo.text.slice(0, 30) || '待办笔记';
      return get().createNote({ title, content, template: 'todo', folderId });
    },

    setExpiry: async (id, expiresAt) => {
      await updateWithLog(noteStore, 'notes', id, { expiresAt: expiresAt ?? undefined });
      set((s) => ({
        notes: sortNotes(s.notes.map((n) => (n.id === id ? { ...n, expiresAt: expiresAt ?? undefined } : n))),
      }));
    },

    setMood: async (id, mood) => {
      await updateWithLog(noteStore, 'notes', id, { mood: mood ?? undefined });
      set((s) => ({
        notes: sortNotes(s.notes.map((n) => (n.id === id ? { ...n, mood: mood ?? undefined } : n))),
      }));
    },

    getFilteredNotes: () => {
      const { notes, selectedFolderId, searchQuery, selectedTags, selectedTemplate } = get();
      let filtered = notes;

      if (selectedFolderId !== null) {
        filtered = filtered.filter((n) => n.folderId === selectedFolderId);
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter((n) => {
          const titleMatch = n.title.toLowerCase().includes(query);
          const contentMatch = n.content && extractNoteText(n.content).toLowerCase().includes(query);
          const tagMatch = n.tags.some((tag) => tag.toLowerCase().includes(query));
          return titleMatch || contentMatch || tagMatch;
        });
      }

      if (selectedTags.length > 0) {
        filtered = filtered.filter((n) =>
          selectedTags.some((tag) => n.tags.includes(tag)),
        );
      }

      if (selectedTemplate) {
        filtered = filtered.filter((n) => n.template === selectedTemplate);
      }

      return sortNotes(filtered);
    },
  };
});

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
