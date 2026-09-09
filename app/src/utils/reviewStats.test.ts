// @vitest-environment node
/**
 * reviewStats.test.ts — 复习页到期统计/范围归约纯函数（v0.20.10 批 5）。
 *
 * @ai-context: AAA 直测三归约：dueGroupRows（>0 过滤 + 到期降序）、
 *              scopeDueCount（null=total / 未知组防御 0）、scopeLabel（降级名）。
 */
import { describe, expect, it } from "vitest";
import type { NoteGroup } from "../types/notes";
import { dueGroupRows, scopeDueCount, scopeLabel } from "./reviewStats";

function group(id: number, name: string): NoteGroup {
  return {
    id, name, terrain: "container", kind: "standalone", domainTag: null,
    source: "route", seriesKey: null, routeReason: null, routeOverridden: 0,
    noteCount: 1, createdAt: 0, updatedAt: 0,
  };
}

describe("reviewStats dueGroupRows", () => {
  it("只保留到期>0 的组，按到期数降序（最急在前）", () => {
    const rows = dueGroupRows(
      [group(1, "A"), group(2, "B"), group(3, "C")],
      { 1: 2, 2: 0, 3: 5 },
    );
    expect(rows.map((r) => [r.group.id, r.due])).toEqual([[3, 5], [1, 2]]);
  });

  it("全组零到期 → 空数组（空态由 total 判定）", () => {
    expect(dueGroupRows([group(1, "A")], { 1: 0 })).toEqual([]);
    expect(dueGroupRows([], {})).toEqual([]);
  });
});

describe("reviewStats scopeDueCount / scopeLabel", () => {
  it("null=全部取 total；组 id 命中取组计数；未知 id 防御为 0", () => {
    expect(scopeDueCount(null, { 1: 3 }, 7)).toBe(7);
    expect(scopeDueCount(1, { 1: 3 }, 7)).toBe(3);
    expect(scopeDueCount(99, { 1: 3 }, 7)).toBe(0);
  });

  it("范围名：null=全部组；命中=组名；未知 id 降级已选组", () => {
    const gs = [group(1, "化妆课 A")];
    expect(scopeLabel(gs, null)).toBe("全部组");
    expect(scopeLabel(gs, 1)).toBe("化妆课 A");
    expect(scopeLabel(gs, 99)).toBe("已选组");
  });
});
