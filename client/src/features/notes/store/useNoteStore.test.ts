import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Note } from '@/types/models';

// Mock storage to isolate pure business logic
vi.mock('@/lib/storage', () => ({
  noteStore: {
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue('mock-uuid-1'),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkDelete: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockResolvedValue([]),
  },
  noteFolderStore: {
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue('mock-folder-1'),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// 绕开操作日志 / CRDT / 加密等真实写链路，直通 repo mock
vi.mock('@/lib/storage/writeWithLog', () => ({
  createWithLog: vi.fn(async (repo: { create: (d: { id: string }) => Promise<unknown> }, _t: string, data: { id?: string }) => {
    const id = data.id ?? 'mock-id';
    await repo.create({ ...data, id });
    return id;
  }),
  updateWithLog: vi.fn(async (repo: { update: (id: string, c: unknown) => Promise<unknown> }, _t: string, id: string, changes: unknown) => {
    await repo.update(id, changes);
  }),
  deleteWithLog: vi.fn(async (repo: { delete: (id: string) => Promise<unknown> }, _t: string, id: string) => {
    await repo.delete(id);
  }),
}));

vi.mock('@/lib/search/dexieSearchIndexer', () => ({
  dexieSearchIndexer: { remove: vi.fn().mockResolvedValue(undefined), upsert: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../lib/links/noteLinkStore', () => ({
  removeLinks: vi.fn().mockResolvedValue(undefined),
  recomputeLinks: vi.fn().mockResolvedValue(undefined),
}));

import { useNoteStore } from './useNoteStore';
import { noteStore, noteFolderStore } from '@/lib/storage';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';

// Helper to create a Note with sensible defaults
function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'test-id',
    title: 'Test Note',
    content: 'test content',
    template: 'blank',
    tags: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    wordCount: 12,
    pinned: false,
    ...overrides,
  };
}

const SAMPLE_NOTES: Note[] = [
  makeNote({ id: 'n1', title: 'Alpha', content: 'hello world', updatedAt: new Date('2025-01-03'), folderId: 'f1' }),
  makeNote({ id: 'n2', title: 'Beta', content: 'foo bar', updatedAt: new Date('2025-01-02'), folderId: 'f2', pinned: true }),
  makeNote({ id: 'n3', title: 'Gamma', content: 'hello foo', updatedAt: new Date('2025-01-01'), folderId: 'f1' }),
  makeNote({ id: 'n4', title: 'Delta', content: 'nothing here', updatedAt: new Date('2025-01-04') }),
];

beforeEach(() => {
  useNoteStore.setState({
    notes: SAMPLE_NOTES,
    folders: [],
    isLoading: false,
    selectedNoteId: null,
    selectedFolderId: null,
    searchQuery: '',
    selectedTemplate: null,
    selectedTags: [],
  });
});

describe('Note Store - Pure Business Logic', () => {
  // ── selectNote / selectFolder / setSearchQuery ────────────

  describe('simple setters', () => {
    it('should select a note by id', () => {
      useNoteStore.getState().selectNote('n2');
      expect(useNoteStore.getState().selectedNoteId).toBe('n2');
    });

    it('should clear selected note with null', () => {
      useNoteStore.setState({ selectedNoteId: 'n3' });
      useNoteStore.getState().selectNote(null);
      expect(useNoteStore.getState().selectedNoteId).toBeNull();
    });

    it('should select a folder by id', () => {
      useNoteStore.getState().selectFolder('f1');
      expect(useNoteStore.getState().selectedFolderId).toBe('f1');
    });

    it('should set search query', () => {
      useNoteStore.getState().setSearchQuery('hello');
      expect(useNoteStore.getState().searchQuery).toBe('hello');
    });
  });

  // ── getFilteredNotes - sort order ─────────────────────────

  describe('getFilteredNotes - sort order', () => {
    it('should return pinned notes first', () => {
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result[0].id).toBe('n2'); // Beta is pinned
    });

    it('should sort non-pinned notes by updatedAt descending', () => {
      const result = useNoteStore.getState().getFilteredNotes();
      // After pinned Beta (id=2): Delta(Jan4) > Alpha(Jan3) > Gamma(Jan1)
      expect(result[1].id).toBe('n4');
      expect(result[2].id).toBe('n1');
      expect(result[3].id).toBe('n3');
    });
  });

  // ── getFilteredNotes - folder filter ──────────────────────

  describe('getFilteredNotes - folder filter', () => {
    it('should filter notes by selectedFolderId', () => {
      useNoteStore.setState({ selectedFolderId: 'f1' });
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toEqual(['n1', 'n3']); // Alpha, Gamma in folder 1
    });

    it('should return all notes when no folder selected', () => {
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(4);
    });
  });

  // ── getFilteredNotes - search ─────────────────────────────

  describe('getFilteredNotes - search', () => {
    it('should filter by title (case-insensitive)', () => {
      useNoteStore.setState({ searchQuery: 'alpha' });
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Alpha');
    });

    it('should filter by content (case-insensitive)', () => {
      useNoteStore.setState({ searchQuery: 'HELLO' });
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(2); // Alpha ("hello world") and Gamma ("hello foo")
    });

    it('should combine folder filter and search', () => {
      useNoteStore.setState({ selectedFolderId: 'f1', searchQuery: 'hello' });
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(2); // Alpha and Gamma both in folder 1 and contain "hello"
    });

    it('should return empty when no notes match search', () => {
      useNoteStore.setState({ searchQuery: 'zzzznotfound' });
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(0);
    });

    it('should ignore whitespace-only search query', () => {
      useNoteStore.setState({ searchQuery: '   ' });
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(4);
    });
  });

  // ── deleteFolder / deleteFolderWithNotes - 递归分组树 ──────

  describe('deleteFolder - recursive folder tree', () => {
    const TREE_FOLDERS = [
      { id: 'f1', name: 'Root', createdAt: new Date('2025-01-01'), order: 1 },
      { id: 'f2', name: 'Child', parentId: 'f1', createdAt: new Date('2025-01-02'), order: 2 },
      { id: 'f3', name: 'Grandchild', parentId: 'f2', createdAt: new Date('2025-01-03'), order: 3 },
    ];
    const TREE_NOTES = [
      makeNote({ id: 'n1', folderId: 'f1' }),
      makeNote({ id: 'n2', folderId: 'f2' }),
      makeNote({ id: 'n3', folderId: 'f3' }),
      makeNote({ id: 'n4' }),
    ];

    beforeEach(() => {
      useNoteStore.setState({ notes: TREE_NOTES, folders: TREE_FOLDERS, selectedFolderId: 'f1' });
      vi.clearAllMocks();
    });

    it('仅删分组：整树分组删除，笔记移至根目录', async () => {
      await useNoteStore.getState().deleteFolder('f1');

      // 整棵分组树的笔记 folderId 全部清空（移回根目录）
      expect(noteStore.update).toHaveBeenCalledWith('n1', { folderId: undefined });
      expect(noteStore.update).toHaveBeenCalledWith('n2', { folderId: undefined });
      expect(noteStore.update).toHaveBeenCalledWith('n3', { folderId: undefined });
      // 根目录笔记不受影响
      expect(noteStore.update).not.toHaveBeenCalledWith('n4', expect.anything());
      // 分组树全部删除（根 + 全部子孙，避免 parentId 悬挂）
      expect(noteFolderStore.delete).toHaveBeenCalledWith('f1');
      expect(noteFolderStore.delete).toHaveBeenCalledWith('f2');
      expect(noteFolderStore.delete).toHaveBeenCalledWith('f3');
      // 选中的分组被清理
      expect(useNoteStore.getState().selectedFolderId).toBeNull();
    });

    it('连笔记删：整树笔记真删除并清理搜索索引', async () => {
      await useNoteStore.getState().deleteFolderWithNotes('f1');

      expect(noteStore.delete).toHaveBeenCalledWith('n1');
      expect(noteStore.delete).toHaveBeenCalledWith('n2');
      expect(noteStore.delete).toHaveBeenCalledWith('n3');
      expect(noteStore.delete).not.toHaveBeenCalledWith('n4');
      // 搜索索引逐篇清理
      expect(dexieSearchIndexer.remove).toHaveBeenCalledWith('n1');
      expect(dexieSearchIndexer.remove).toHaveBeenCalledWith('n3');
      // 分组树全部删除
      expect(noteFolderStore.delete).toHaveBeenCalledWith('f1');
      expect(noteFolderStore.delete).toHaveBeenCalledWith('f2');
      expect(noteFolderStore.delete).toHaveBeenCalledWith('f3');
    });
  });

  // ── deleteNotesBatch ────────────────────────────────────────

  describe('deleteNotesBatch', () => {
    beforeEach(() => {
      useNoteStore.setState({ notes: SAMPLE_NOTES, selectedNoteId: 'n1' });
      vi.clearAllMocks();
    });

    it('空数组直接返回', async () => {
      await useNoteStore.getState().deleteNotesBatch([]);
      expect(noteStore.bulkDelete).not.toHaveBeenCalled();
    });

    it('批量删除笔记并清理搜索索引和链接', async () => {
      await useNoteStore.getState().deleteNotesBatch(['n1', 'n3']);
      expect(noteStore.bulkDelete).toHaveBeenCalledWith(['n1', 'n3']);
      expect(dexieSearchIndexer.remove).toHaveBeenCalledWith('n1');
      expect(dexieSearchIndexer.remove).toHaveBeenCalledWith('n3');
    });

    it('删除选中笔记时清空 selectedNoteId', async () => {
      expect(useNoteStore.getState().selectedNoteId).toBe('n1');
      await useNoteStore.getState().deleteNotesBatch(['n1', 'n2']);
      expect(useNoteStore.getState().selectedNoteId).toBeNull();
    });

    it('删除非选中笔记时保留 selectedNoteId', async () => {
      await useNoteStore.getState().deleteNotesBatch(['n2']);
      expect(useNoteStore.getState().selectedNoteId).toBe('n1');
    });
  });

  // ── toggleTemplate ──────────────────────────────────────────

  describe('toggleTemplate', () => {
    // 测试隔离：store 为模块级单例，前面用例会把 selectedTemplate 置为非空，
    // 不重置则「再点取消」用例实际从非空状态开始，两次 toggle 后回到非空（污染）
    beforeEach(() => {
      useNoteStore.setState({ selectedTemplate: null });
    });

    it('初始为 null', () => {
      expect(useNoteStore.getState().selectedTemplate).toBeNull();
    });

    it('点击模板切换为选中', () => {
      useNoteStore.getState().toggleTemplate('outline');
      expect(useNoteStore.getState().selectedTemplate).toBe('outline');
    });

    it('再点同一模板取消选中（回 null）', () => {
      useNoteStore.getState().toggleTemplate('outline');
      useNoteStore.getState().toggleTemplate('outline');
      expect(useNoteStore.getState().selectedTemplate).toBeNull();
    });

    it('切换不同模板时只保留最后一个', () => {
      useNoteStore.getState().toggleTemplate('outline');
      useNoteStore.getState().toggleTemplate('cornell');
      expect(useNoteStore.getState().selectedTemplate).toBe('cornell');
    });

    it('与 getFilteredNotes 联用：按模板筛选', () => {
      useNoteStore.setState({ notes: [
        { id: 'n1', title: 'A', content: '', template: 'outline', tags: [], createdAt: new Date(), updatedAt: new Date(), wordCount: 0, pinned: false },
        { id: 'n2', title: 'B', content: '', template: 'cornell', tags: [], createdAt: new Date(), updatedAt: new Date(), wordCount: 0, pinned: false },
        { id: 'n3', title: 'C', content: '', template: 'outline', tags: [], createdAt: new Date(), updatedAt: new Date(), wordCount: 0, pinned: false },
      ] });
      useNoteStore.getState().toggleTemplate('outline');
      const result = useNoteStore.getState().getFilteredNotes();
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toEqual(['n1', 'n3']);
    });
  });
});
