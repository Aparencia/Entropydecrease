/**
 * noteTree.test.ts — noteTree.ts 纯函数状态机测试（v0.11.5 Task 12）。
 *
 * @ai-context: AAA 结构，node 环境（Vitest），无 DOM 依赖。
 */
import { describe, expect, it } from "vitest";
import { buildTree } from "./noteTree";
import type { Note, NoteGroup } from "../types";

/** 最小 Note 桩 */
function note(overrides: Partial<Note> & { id: number }): Note {
  return {
    title: `note-${overrides.id}`,
    content: "",
    source: "manual",
    tags: "[]",
    pin: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

/** 最小 NoteGroup 桩 */
function group(overrides: Partial<NoteGroup> & { id: number }): NoteGroup {
  return {
    name: `group-${overrides.id}`,
    terrain: "container",
    kind: "standalone",
    domainTag: null,
    source: "manual",
    seriesKey: null,
    routeReason: null,
    routeOverridden: 0,
    noteCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("buildTree", () => {
  it("无过滤态返回组节点 + 未归组 all 根", () => {
    // Arrange
    const g1 = group({ id: 1, name: "课程" });
    const n1 = note({ id: 1, group_id: 1, title: "笔记A" });
    const n2 = note({ id: 2, group_id: null, title: "笔记B" });

    // Act
    const tree = buildTree([g1], [n1, n2], null, "", null, "updated-desc");

    // Assert
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ kind: "group" });
    expect((tree[0] as any).notes).toHaveLength(1);
    expect((tree[0] as any).notes[0].id).toBe(1);
    expect((tree[0] as any).expanded).toBe(false);
    expect(tree[1]).toMatchObject({ kind: "all" });
    expect((tree[1] as any).notes).toHaveLength(1);
    expect((tree[1] as any).notes[0].id).toBe(2);
  });

  it("展开组节点时 expanded=true", () => {
    // Arrange
    const g1 = group({ id: 1 });
    const n1 = note({ id: 1, group_id: 1 });

    // Act
    const tree = buildTree([g1], [n1], 1, "", null, "updated-desc");

    // Assert
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "group" });
    expect((tree[0] as any).expanded).toBe(true);
  });

  it("keyword 非空时退化为平铺 all 列表", () => {
    // Arrange
    const g1 = group({ id: 1 });
    const n1 = note({ id: 1, group_id: 1, title: "搜索命中" });
    const n2 = note({ id: 2, group_id: 1, title: "其他" });

    // Act
    const tree = buildTree([g1], [n1, n2], null, "搜索", null, "updated-desc");

    // Assert
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "all" });
    expect((tree[0] as any).notes).toHaveLength(2); // 搜索已在后端过滤，前端全量平铺
  });

  it("tagFilter 非空时退化为平铺 all 列表", () => {
    // Arrange
    const g1 = group({ id: 1 });
    const n1 = note({ id: 1, group_id: 1 });

    // Act
    const tree = buildTree([g1], [n1], null, "", "学习", "updated-desc");

    // Assert
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "all" });
  });

  it("未归组笔记不存在时不插入 all 根", () => {
    // Arrange
    const g1 = group({ id: 1 });
    const n1 = note({ id: 1, group_id: 1 });

    // Act
    const tree = buildTree([g1], [n1], null, "", null, "updated-desc");

    // Assert
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "group" });
  });

  it("空笔记/空组返回空数组", () => {
    // Arrange + Act
    const tree = buildTree([], [], null, "", null, "updated-desc");

    // Assert
    expect(tree).toHaveLength(0);
  });

  it("pin-first 排序：固定笔记优先", () => {
    // Arrange
    const g1 = group({ id: 1 });
    const n1 = note({ id: 1, group_id: 1, pin: 1, updated_at: 100 });
    const n2 = note({ id: 2, group_id: 1, pin: 0, updated_at: 200 });

    // Act
    const tree = buildTree([g1], [n1, n2], null, "", null, "pin-first");

    // Assert
    const groupEntry = tree[0] as any;
    expect(groupEntry.notes[0].id).toBe(1); // pin 优先
    expect(groupEntry.notes[1].id).toBe(2);
  });

  it("created-desc 排序按创建时间降序", () => {
    // Arrange
    const n1 = note({ id: 1, group_id: null, created_at: 100 });
    const n2 = note({ id: 2, group_id: null, created_at: 200 });

    // Act
    const tree = buildTree([], [n1, n2], null, "", null, "created-desc");

    // Assert
    const allEntry = tree[0] as any;
    expect(allEntry.notes[0].id).toBe(2);
    expect(allEntry.notes[1].id).toBe(1);
  });
});