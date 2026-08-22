/**
 * noteTree.ts — 笔记页树形合并的纯函数（v0.11.5 Task 12）。
 *
 * @ai-context: 将 groups + notes 组合为 TreeEntry[]；过滤态（keyword/tagFilter
 *              非空）退化为平铺单 all 列表。
 */
import type { Note, NoteGroup } from "../types";

/** 排序模式 */
export type SortMode = "updated-desc" | "pin-first" | "created-desc";

/** 组树节点（可展开——组头 + 组内笔记叶子） */
export interface GroupTreeEntry {
  kind: "group";
  group: NoteGroup;
  notes: Note[];
  expanded: boolean;
}

/** 全部笔记根节点（平铺所有笔记） */
export interface AllNotesTreeEntry {
  kind: "all";
  notes: Note[];
}

export type TreeEntry = GroupTreeEntry | AllNotesTreeEntry;

/** 默认排序比较（updated-desc 降序） */
function sortNotes(notes: Note[], mode: SortMode): Note[] {
  const sorted = [...notes];
  sorted.sort((a, b) => {
    if (mode === "pin-first") {
      if (a.pin !== b.pin) return b.pin - a.pin;
      return b.updated_at - a.updated_at;
    }
    if (mode === "created-desc") return b.created_at - a.created_at;
    return b.updated_at - a.updated_at;
  });
  return sorted;
}

/**
 * 将 groups + notes 组合为树条目数组。
 *
 * @param groups      所有笔记组
 * @param notes       客户端已过滤的笔记列表（组过滤已在客户端生效）
 * @param expandedGroupId  当前展开的组 id（null=无展开）
 * @param keyword     搜索关键词（非空=过滤态→平铺）
 * @param tagFilter   标签过滤（非空=过滤态→平铺）
 * @param sortMode    排序模式
 */
export function buildTree(
  groups: NoteGroup[],
  notes: Note[],
  expandedGroupId: number | null,
  keyword: string,
  tagFilter: string | null,
  sortMode: SortMode,
): TreeEntry[] {
  const entries: TreeEntry[] = [];

  // 过滤态 → 退化为平铺单 all 列表
  if (keyword !== "" || tagFilter !== null) {
    entries.push({ kind: "all", notes: sortNotes(notes, sortMode) });
    return entries;
  }

  // 组节点
  for (const g of groups) {
    const groupNotes = sortNotes(
      notes.filter((n) => n.group_id === g.id),
      sortMode,
    );
    entries.push({
      kind: "group",
      group: g,
      notes: groupNotes,
      expanded: expandedGroupId === g.id,
    });
  }

  // 未归组笔记并入 all 根
  const ungrouped = sortNotes(
    notes.filter((n) => !n.group_id),
    sortMode,
  );
  if (ungrouped.length > 0) {
    entries.push({ kind: "all", notes: ungrouped });
  }

  return entries;
}