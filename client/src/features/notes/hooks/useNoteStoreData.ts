/**
 * @ai-context: 笔记 store 细粒度订阅 Hook：集中声明 NotesPage 所需的全部 store 状态与动作
 * （P1-5：逐字段订阅避免整 store 重渲染）。自 NotesPage.tsx 原样拆出，选择器与语义不变。
 * @ai-context: Fine-grained useNoteStore subscriptions hook extracted verbatim
 * from NotesPage.tsx. Selectors and semantics are unchanged (P1-5 per-field
 * subscription to avoid whole-store re-renders).
 */
import { useNoteStore } from '../store/useNoteStore';

export function useNoteStoreData() {
  const notes = useNoteStore((s) => s.notes);
  const folders = useNoteStore((s) => s.folders);
  const selectedFolderId = useNoteStore((s) => s.selectedFolderId);
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  const searchQuery = useNoteStore((s) => s.searchQuery);
  const selectedTags = useNoteStore((s) => s.selectedTags);
  const selectedTemplate = useNoteStore((s) => s.selectedTemplate);
  // 动作（稳定引用）
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const loadFolders = useNoteStore((s) => s.loadFolders);
  const selectNote = useNoteStore((s) => s.selectNote);
  const selectFolder = useNoteStore((s) => s.selectFolder);
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery);
  const getFilteredNotes = useNoteStore((s) => s.getFilteredNotes);
  const toggleTag = useNoteStore((s) => s.toggleTag);
  const toggleTemplate = useNoteStore((s) => s.toggleTemplate);
  const clearTagFilter = useNoteStore((s) => s.clearTagFilter);
  const getAllTags = useNoteStore((s) => s.getAllTags);

  // 响应式笔记总数（侧边栏"全部笔记"计数）
  const totalNotes = useNoteStore((s) => s.notes.length);

  return {
    notes, folders, selectedFolderId, selectedNoteId, searchQuery, selectedTags, selectedTemplate,
    loadNotes, loadFolders, selectNote, selectFolder, setSearchQuery, getFilteredNotes,
    toggleTag, toggleTemplate, clearTagFilter, getAllTags, totalNotes,
  };
}
