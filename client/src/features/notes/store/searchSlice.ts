/**
 * 笔记状态仓库 — 搜索 / 筛选 slice
 * Note store — search & filter slice
 *
 * @ai-context: 从 useNoteStore 拆出。searchNotes 走 Dexie 全文索引 + BM25 评分
 * （v0.9.0），失败静默清空结果；getFilteredNotes 为计算属性，按文件夹/搜索/
 * 标签/模板四级过滤后统一排序（置顶优先 + 更新时间倒序）。
 * @ai-context: Extracted from useNoteStore. Full-text search delegates to the
 * Dexie index with BM25 scoring; getFilteredNotes applies folder/query/tag/
 * template filters then sorts.
 */
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';
import { extractNoteText } from '../lib/extractNoteText';
import { sortNotes } from '../lib/noteSort';
import type { NoteSlice, NoteState } from './noteStoreTypes';

type SearchSliceActions = Pick<NoteState,
  | 'setSearchQuery' | 'searchNotes' | 'setSelectedEntityTypes'
  | 'toggleTag' | 'clearTagFilter' | 'toggleTemplate' | 'getFilteredNotes'
>;

export const createSearchSlice: NoteSlice<SearchSliceActions> = (set, get) => ({
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
});
