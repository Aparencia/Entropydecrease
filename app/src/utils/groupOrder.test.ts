/**
 * groupOrder.test.ts — 组排序纯函数单测（REQ-315 批 6；AAA）。
 */
import { describe, expect, it } from "vitest";
import { orderGroups, partitionIsManual, type GroupOrderShape } from "./groupOrder";

const mk = (id: number, updatedAt: number, pin?: number): GroupOrderShape => ({ id, updatedAt, pin });

describe("orderGroups 组展示序", () => {
  it("置顶→手动 seq→自动（updatedAt 降序）三段，跨分区整表调用亦可", () => {
    const groups = [mk(1, 100), mk(2, 300), mk(3, 200), mk(4, 50, 1), mk(5, 30, 1)];
    const rows = new Map([[3, 0], [1, 1]]);
    expect(orderGroups(groups, rows).map((g) => g.id)).toEqual([4, 5, 3, 1, 2]);
  });

  it("置顶区内按 updatedAt 降序而非手动 seq", () => {
    const groups = [mk(1, 10, 1), mk(2, 500, 1), mk(3, 400, 1)];
    const rows = new Map([[1, 0]]); // 存量行被置顶区忽略
    expect(orderGroups(groups, rows).map((g) => g.id)).toEqual([2, 3, 1]);
  });

  it("无 rows = 全自动；pin 缺失=0（旧 mock 兼容）", () => {
    const groups = [{ id: 7, updatedAt: 1 }, { id: 9, updatedAt: 5 }];
    expect(orderGroups(groups, new Map()).map((g) => g.id)).toEqual([9, 7]);
  });

  it("跨 kind 的 seq 撞值保持输入序（树组头/过滤平铺整表调用场景）", () => {
    const groups = [mk(1, 0), mk(2, 0), mk(3, 0)];
    const rows = new Map([[2, 0], [1, 0]]); // 两个分区各自 seq0
    expect(orderGroups(groups, rows).map((g) => g.id)).toEqual([1, 2, 3]);
  });
});

describe("partitionIsManual 手排判定", () => {
  it("分区内存在未置顶成员的序行=手排中；仅置顶组存量行不计", () => {
    const rows = new Map([[1, 0], [2, 1]]);
    // 仅置顶组 1 有行 → 非手排（置顶区是 pin 语义，残行待取消置顶后复活）
    expect(partitionIsManual([mk(1, 0, 1)], rows)).toBe(false);
    // 未置顶组 2 有行 → 手排
    expect(partitionIsManual([mk(1, 0, 1), mk(2, 0)], rows)).toBe(true);
    // 无行 → 自动
    expect(partitionIsManual([mk(3, 0)], rows)).toBe(false);
  });
});
