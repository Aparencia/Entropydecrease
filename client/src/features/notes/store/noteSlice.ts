/**
 * 笔记状态仓库 — 笔记 CRUD / 标签 / 模板 slice
 * Note store — note CRUD, tags, templates, expiry & mood slice
 *
 * @ai-context: 从 useNoteStore 拆出。createNote/updateNote 自动同步搜索索引
 * （updateNote 走 P0-4 5s 防抖，回调内从库取解密全文保证索引不陈旧），
 * 内容变更时重建出链索引（fire-and-forget，失败不阻塞）；createFromTemplate
 * 对 mindmap 动态生成全新节点 id（不复用模板占位串）。
 * @ai-context: Extracted from useNoteStore. Search index sync uses a 5s debounce
 * window on update; link index rebuild is fire-and-forget on content changes.
 */
import { noteStore } from '@/lib/storage';
import { createWithLog, updateWithLog, deleteWithLog } from '@/lib/storage/writeWithLog';
import { dexieSearchIndexer } from '@/lib/search/dexieSearchIndexer';
import type { Note } from '@/types/models';
import { createDefaultMindmap } from '../lib/mindmap/mindmapOps';
import { noteContentToPlainText } from '../lib/mindmap/mindmapText';
import { recomputeLinks, removeLinks } from '../lib/links/noteLinkStore';
import { createTodoTemplateContent } from '../lib/todoTemplate';
import { TEMPLATE_CONTENT, TEMPLATE_TITLES } from '../lib/templates';
import { getAllNoteMeta } from '../lib/noteProjection';
import { sortNotes } from '../lib/noteSort';
import type { NoteSlice, NoteState } from './noteStoreTypes';

/** P0-4 搜索索引防抖窗口（ms）：连续自动保存只更新一次索引，避免每秒全文分词 */
const SEARCH_INDEX_DEBOUNCE_MS = 5000;
/** 按笔记 id 挂起的索引更新定时器（updateNote 防抖用） */
const pendingSearchIndexUpdates = new Map<string, ReturnType<typeof setTimeout>>();

type NoteSliceActions = Pick<NoteState,
  | 'loadNotes' | 'createNote' | 'updateNote' | 'deleteNote' | 'deleteNotesBatch'
  | 'togglePin' | 'selectNote' | 'addTag' | 'removeTag' | 'getAllTags'
  | 'createFromTemplate' | 'createTodoNote' | 'setExpiry' | 'setMood'
>;

export const createNoteSlice: NoteSlice<NoteSliceActions> = (set, get) => ({
  loadNotes: async () => {
    set({ isLoading: true });
    try {
      // P1-1：投影查询（不含 content 全文），内存与加载耗时双降
      const notes = await getAllNoteMeta();
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
    recomputeLinks(id, content).catch((err) => {
      // 出链索引重建失败：搜索/链接跳转可能缺失该笔记的出链（后台任务，debug 级留痕）
      console.debug('[noteStore] recomputeLinks failed on create', id, err);
    });
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
    set((s) => ({
      notes: sortNotes(s.notes.map((n) => (n.id === id ? { ...n, ...updateData } : n))),
    }));
    // v0.9.0: 自动更新搜索索引 —— P0-4 防抖化：打字持续时每秒一次自动保存，
    // 全文 JSON.parse + 分词（含图笔记可达数 MB）是高频成本热点；
    // 合并为 5s 窗口一次，回调内取库中解密全文保证索引内容不陈旧
    const pendingTimer = pendingSearchIndexUpdates.get(id);
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingSearchIndexUpdates.set(id, setTimeout(async () => {
      pendingSearchIndexUpdates.delete(id);
      try {
        // P1-1：内存对象为投影（无 content），索引需从库取解密全文
        const full = await noteStore.getById(id);
        if (full) {
          const ts = full.updatedAt instanceof Date
            ? full.updatedAt.getTime()
            : new Date(full.updatedAt as unknown as string).getTime();
          await dexieSearchIndexer.upsert(id, 'note', full.title, noteContentToPlainText(full.content ?? ''), ts);
        }
      } catch {
        // 索引更新失败不阻塞笔记更新
      }
    }, SEARCH_INDEX_DEBOUNCE_MS));
    // 阶段二：内容变更时重建出链索引（投影后内存对象无 content，
    // 直接使用本次变更的全文，行为与改造前一致）
    if (changes.content !== undefined) {
      recomputeLinks(id, changes.content).catch((err) => {
        console.debug('[noteStore] recomputeLinks failed on update', id, err);
      });
    }
  },

  deleteNote: async (id) => {
    await deleteWithLog(noteStore, 'notes', id);
    // v0.9.0: 删除搜索索引
    try { await dexieSearchIndexer.remove(id); } catch { /* 忽略 */ }
    // 阶段二：清理链接索引（fire-and-forget）
    removeLinks(id).catch((err) => {
      console.debug('[noteStore] removeLinks failed on delete', id, err);
    });
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
      Promise.all(ids.map((id) => dexieSearchIndexer.remove(id).catch((err) => {
        console.debug('[noteStore] search index remove failed (batch)', id, err);
      }))),
      Promise.all(ids.map((id) => removeLinks(id).catch((err) => {
        console.debug('[noteStore] removeLinks failed (batch)', id, err);
      }))),
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
});
