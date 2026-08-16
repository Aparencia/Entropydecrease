/**
 * 笔记排序纯函数：置顶优先 + 更新时间倒序
 * Note sort helper: pinned first, then updatedAt descending
 *
 * @ai-context: 从 useNoteStore 拆出的纯函数（无副作用，可独立单测）。
 * 列表展示、局部更新、筛选结果统一使用此排序，保证顺序单一事实源：
 * 置顶笔记优先，其余按 updatedAt 倒序。
 * @ai-context: Extracted from useNoteStore. Single source of truth for note
 * ordering — pinned notes first, then most recently updated.
 */
import type { Note } from '@/types/models';

export const sortNotes = (notes: Note[]): Note[] => {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
};
