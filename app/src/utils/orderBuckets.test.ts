/**
 * orderBuckets.test.ts — 排序桶核心纯函数单测（REQ-315 批 6；AAA）。
 */
import { describe, expect, it } from "vitest";
import {
  dropIntoList,
  nonPinnedIds,
  orderPinnedSeqAuto,
  shiftInList,
  type BucketOrderable,
} from "./orderBuckets";

interface TestOrderable extends BucketOrderable { updated: number }
const mk = (id: number, updated = 0, pin = 0): TestOrderable => ({ id, updated, pin });
const byUpdated = (t: TestOrderable) => t.updated;

describe("orderPinnedSeqAuto 三桶规则", () => {
  it("置顶区在前且区内按更新时间降序（并列按 id 降序决胜）", () => {
    const list = [mk(1, 100), mk(2, 300), mk(3, 200), mk(4, 0, 1), mk(5, 500, 1), mk(6, 400, 1)];
    const got = orderPinnedSeqAuto(list, new Map(), byUpdated).map((g) => g.id);
    // 置顶：5(500) 6(400) 4(0)；其余自动按时间：2 3 1
    expect(got).toEqual([5, 6, 4, 2, 3, 1]);
  });

  it("手动序区在置顶区后按 seq 升序，其余回自动区按时间降序", () => {
    const list = [mk(1, 100), mk(2, 300), mk(3, 200), mk(4, 0, 1)];
    const rows = new Map([[3, 0], [1, 1]]);
    const got = orderPinnedSeqAuto(list, rows, byUpdated).map((g) => g.id);
    expect(got).toEqual([4, 3, 1, 2]);
  });

  it("置顶组不消费手动 seq（置顶=时间定序，存量行被忽略）", () => {
    const list = [mk(1, 100, 1), mk(2, 300)];
    const rows = new Map([[1, 0]]); // 置顶组存量行（取消置顶后复活）
    const got = orderPinnedSeqAuto(list, rows, byUpdated).map((g) => g.id);
    expect(got).toEqual([1, 2]);
  });

  it("空表/无 seq 行 = 全自动序（空快照回自动的渲染口径）", () => {
    expect(orderPinnedSeqAuto([], new Map(), byUpdated)).toEqual([]);
    const list = [mk(1, 50), mk(2, 10)];
    expect(orderPinnedSeqAuto(list, new Map(), byUpdated).map((g) => g.id)).toEqual([1, 2]);
  });

  it("桶内稳定：时间/seq 并列保持输入序（不额外摆动）", () => {
    const list = [mk(1, 10), mk(2, 10), mk(3, 10)];
    expect(orderPinnedSeqAuto(list, new Map(), byUpdated).map((g) => g.id)).toEqual([1, 2, 3]);
    // 手动区同 seq（跨 kind 整表调用撞值）→ 输入序
    const rows = new Map([[2, 0], [1, 0]]);
    expect(orderPinnedSeqAuto(list, rows, byUpdated).map((g) => g.id)).toEqual([1, 2, 3]);
  });
});

describe("nonPinnedIds / shiftInList", () => {
  it("nonPinnedIds 保持顺序并剔除置顶成员", () => {
    expect(nonPinnedIds([mk(1), mk(2, 0, 1), mk(3)])).toEqual([1, 3]);
  });

  it("shiftInList 上移/下移交换相邻位，越界与缺失返回 null", () => {
    expect(shiftInList([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(shiftInList([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(shiftInList([1, 2, 3], 1, -1)).toBeNull();
    expect(shiftInList([1, 2, 3], 3, 1)).toBeNull();
    expect(shiftInList([1, 2, 3], 99, -1)).toBeNull();
  });
});

describe("dropIntoList 落点插入", () => {
  const base = [1, 2, 3, 4];
  it("目标前/后插入（移出 moved 再定位）", () => {
    expect(dropIntoList(base, [7], { targetId: 3, before: true })).toEqual([1, 2, 7, 3, 4]);
    expect(dropIntoList(base, [7], { targetId: 3, before: false })).toEqual([1, 2, 3, 7, 4]);
  });
  it("落置顶行 = 手动区首位（head 锚点）", () => {
    expect(dropIntoList(base, [7], { head: true })).toEqual([7, 1, 2, 3, 4]);
    expect(dropIntoList(base, [7, 8], { head: true })).toEqual([7, 8, 1, 2, 3, 4]);
  });
  it("目标消失（被移走/已删）返回 null——调用方跳过保存", () => {
    expect(dropIntoList([1, 2], [1], { targetId: 1, before: false })).toBeNull();
    expect(dropIntoList(base, [], { targetId: 9, before: false })).toBeNull();
  });
});
