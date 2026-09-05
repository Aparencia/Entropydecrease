// @vitest-environment jsdom
/**
 * noteSelection.test.ts — 笔记列表多选纯逻辑（REQ-287，v0.19.7）。
 *
 * @ai-context: 覆盖交互矩阵关键路径——Ctrl 单点加/减、Shift 区间并集
 *              （乱序也按列表位置）、单选替换、全选/清空；纯函数零依赖。
 */
import { describe, expect, it } from "vitest";
import {
  emptySelection, rangeSelection, selectAll, singleSelection, toggleSelection,
} from "./noteSelection";

const ordered = [3, 1, 5, 2, 4]; // 注意：非自然序——验证"按列表位置"语义

describe("noteSelection 多选逻辑（REQ-287）", () => {
  it("Ctrl 单击：加/减单个成员", () => {
    const s0 = emptySelection();
    const s1 = toggleSelection(s0, 1);
    expect([...s1]).toEqual([1]);
    const s2 = toggleSelection(s1, 5);
    expect([...s2].sort()).toEqual([1, 5]);
    expect(toggleSelection(s2, 1).has(1)).toBe(false);
  });

  it("Shift 单击：按列表位置区间并入（非 id 大小）", () => {
    const sel = rangeSelection(emptySelection(), ordered, 1, 5);
    // ordered 中 1 在位置 1、5 在位置 2 → 区间 {1,5}
    expect([...sel].sort()).toEqual([1, 5]);
    const wider = rangeSelection(sel, ordered, 5, 4);
    // 5 在位置 2、4 在位置 4 → 并集后 {1,2,4,5}
    expect([...wider].sort()).toEqual([1, 2, 4, 5]);
  });

  it("anchor 缺失时 Shift 只选目标；反向区间同样成立", () => {
    expect([...rangeSelection(emptySelection(), ordered, null, 2)]).toEqual([2]);
    const back = rangeSelection(emptySelection(), ordered, 4, 3); // 位置 4→0 全段
    expect([...back].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("批量模式行单击=单选替换；全选/清空", () => {
    const a = toggleSelection(emptySelection(), 1);
    expect([...singleSelection(a, 7)]).toEqual([7]);
    expect([...selectAll(ordered)].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(emptySelection().size).toBe(0);
  });
});
