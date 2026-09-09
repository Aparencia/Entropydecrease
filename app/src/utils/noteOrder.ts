/**
 * 笔记排序纯函数层（REQ-315，v0.20.11 批 6）。
 *
 * @ai-context: 树视图（含未分组 none scope）的 scope 内展示序——补上「置顶」在
 *              树/手排组内不生效的缺口：组内 = 置顶区（pin=1，区内 updated_at
 *              降序）→ 手动序区（note_orders seq 升序）→ 自动区（其余按
 *              updated_at 降序，即既有后端更新时间序）。置顶区不消费 seq：
 *              置顶项位置由更新时间表达；手动移动只作用于置顶区外子序列
 *              （置顶笔记上移/下移禁用，菜单提示见 NoteRowContextMenu）。
 * @ai-context: 自动排序 scope 的首次显式移动（菜单上移/下移或行落点拖拽）=
 *              以当前可见序为底做快照转手排（落库即整表覆写，先例 REQ-287）——
 *              scope 无手排行时存的就是「当前显示序」，无需单独"先拖一次"。
 *              快照只写未置顶成员：置顶笔记由 pin 列置顶区表达，不占手动位。
 */
import { dropIntoList, orderPinnedSeqAuto, shiftInList } from "./orderBuckets";

/** 笔记最小形状（snake_case——Note 契约；pin 缺失=0） */
export interface NoteOrderShape {
  id: number;
  pin?: number;
  updated_at: number;
}

/** scope 内 置顶→手动 seq→自动(updated_at 降序) 三段重排（纯函数，供单测）。 */
export function orderScopeNotes<T extends NoteOrderShape>(
  notes: readonly T[],
  order: readonly number[] | undefined,
): T[] {
  const seq = new Map<number, number>();
  if (order) order.forEach((id, i) => seq.set(id, i));
  return orderPinnedSeqAuto(notes, seq, (n) => n.updated_at);
}

/** 手动上移/下移（入参=可移动子序列；置顶项由调用方先行排除）。 */
export function shiftNoteOrder(
  ids: readonly number[],
  noteId: number,
  dir: 1 | -1,
): number[] | null {
  return shiftInList(ids, noteId, dir);
}

/** 拖拽落点插入（锚点见 dropIntoList：置顶行=手动区首位；返回 null=无变化）。 */
export function dropNotesIntoOrder(
  ids: readonly number[],
  movedIds: readonly number[],
  anchor: { targetId: number; before: boolean } | { head: true },
): number[] | null {
  return dropIntoList(ids, movedIds, anchor);
}
