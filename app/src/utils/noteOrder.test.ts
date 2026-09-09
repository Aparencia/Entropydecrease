/**
 * noteOrder.test.ts — 笔记 scope 排序纯函数单测（REQ-315 批 6；AAA）。
 */
import { describe, expect, it } from "vitest";
import { dropNotesIntoOrder, orderScopeNotes, shiftNoteOrder } from "./noteOrder";

const mk = (id: number, updated_at = 0, pin = 0) => ({ id, updated_at, pin });

describe("orderScopeNotes 组内排序", () => {
  it("置顶区（updated_at 降序）→ 手动 seq → 自动区（updated_at 降序）", () => {
    const notes = [mk(1, 100), mk(2, 300), mk(3, 200), mk(4, 0, 1), mk(5, 500, 1)];
    const got = orderScopeNotes(notes, [3, 1, 2]).map((n) => n.id);
    expect(got).toEqual([5, 4, 3, 1, 2]);
  });

  it("自动组（无手排行）= 置顶在前 + 其余保持更新时间序（树视图 pin 生效缺口）", () => {
    const notes = [mk(1, 100), mk(2, 300), mk(3, 200, 1), mk(4, 0, 1)];
    expect(orderScopeNotes(notes, undefined).map((n) => n.id)).toEqual([3, 4, 2, 1]);
  });

  it("手动序行含置顶成员时置顶成员仍归置顶区（存量数据兼容）", () => {
    const notes = [mk(1, 100, 1), mk(2, 300)];
    const got = orderScopeNotes(notes, [1, 2]).map((n) => n.id);
    expect(got).toEqual([1, 2]);
  });

  it("空表 / 空序参数安全", () => {
    expect(orderScopeNotes([], [1, 2])).toEqual([]);
    expect(orderScopeNotes([mk(1, 5)], [])).toEqual([expect.objectContaining({ id: 1 })]);
  });
});

describe("shiftNoteOrder / dropNotesIntoOrder", () => {
  it("上移/下移交换相邻位；越界 null", () => {
    expect(shiftNoteOrder([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(shiftNoteOrder([1, 2, 3], 3, 1)).toBeNull();
  });

  it("拖拽落点：普通目标按前后插入；置顶行目标=head（手动区首位）；目标消失 null", () => {
    expect(dropNotesIntoOrder([1, 2, 3], [9], { targetId: 2, before: true })).toEqual([1, 9, 2, 3]);
    expect(dropNotesIntoOrder([1, 2, 3], [9], { head: true })).toEqual([9, 1, 2, 3]);
    expect(dropNotesIntoOrder([1, 2], [1], { targetId: 1, before: false })).toBeNull();
  });
});
