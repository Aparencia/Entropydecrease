// @vitest-environment jsdom
/**
 * NoteListView.tree.test.tsx — v0.15 分组树交互契约测试。
 *
 * @ai-context: 组头渲染（组名下挂笔记）/chevron 收起展开（stopPropagation 不触发
 *              过滤）/组名点击=过滤切换（决策 1 语义）/搜索激活退化平铺/
 *              空组不渲染/未分组区收纳 group_id=null 笔记。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note, NoteGroup } from "../types";
import NoteListView from "./NoteListView";

// REQ-287：NoteListView 现读写 localStorage 组折叠——每测清空防串扰
beforeEach(() => { try { window.localStorage.clear(); } catch { /* jsdom 守卫 */ } });

function makeNote(id: number, title: string, groupId?: number | null): Note {
  return {
    id,
    title,
    content: "",
    source: "manual",
    tags: "[]",
    pin: 0,
    group_id: groupId,
    created_at: 0,
    updated_at: 0,
  };
}

const groups: NoteGroup[] = [
  {
    id: 1, name: "摄影", terrain: "container", kind: "topic", domainTag: "photo",
    source: "manual", seriesKey: null, routeReason: null, routeOverridden: 0,
    color: null, noteCount: 2, createdAt: 0, updatedAt: 0,
  },
  { id: 2, name: "编程", terrain: "container", kind: "course", domainTag: "coding",
    source: "manual", seriesKey: null, routeReason: null, routeOverridden: 0,
    color: null, noteCount: 0, createdAt: 0, updatedAt: 0 },
];

const baseProps = {
  keyword: "",
  tagFilter: null,
  sortMode: "updated-desc" as const,
  allTags: [] as string[],
  selectedId: null,
  status: "",
  onKeywordChange: vi.fn(),
  onTagFilterChange: vi.fn(),
  onSortModeChange: vi.fn(),
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  onRefresh: vi.fn(),
  onOpenSession: vi.fn(),
  onBatchDelete: vi.fn().mockResolvedValue(true),
  onGroupFilterChange: vi.fn(),
};

afterEach(() => cleanup());

describe("NoteListView 分组树（v0.15）", () => {
  it("组头渲染且组下挂笔记；未分组区收纳 group_id=null 笔记", () => {
    const notes = [
      makeNote(1, "拍了", 1),
      makeNote(2, "写了", null),
    ];
    render(<NoteListView notes={notes} groups={groups} groupFilter={null} {...baseProps} />);
    expect(screen.getByTestId("note-tree-摄影")).toBeTruthy();
    // 空组不渲染（组信息在组侧栏管理）
    expect(screen.queryByTestId("note-tree-编程")).toBeNull();
    expect(screen.getByTestId("note-tree-未分组")).toBeTruthy();
    // 组内笔记可见
    expect(screen.getByText("拍了")).toBeTruthy();
    expect(screen.getByText("写了")).toBeTruthy();
  });

  it("chevron 收起/展开（不触发过滤）", async () => {
    const notes = [makeNote(1, "拍了", 1)];
    render(<NoteListView notes={notes} groups={groups} groupFilter={null} {...baseProps} />);
    // 首次点击=收起；展开时 body 需等重渲染（父层折叠态驱动）
    fireEvent.click(screen.getByTestId("tree-chevron-摄影"));
    await waitFor(() => expect(screen.queryByTestId("tree-body-摄影")).toBeNull());
    expect(baseProps.onGroupFilterChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("tree-chevron-摄影"));
    await waitFor(() => expect(screen.getByTestId("tree-body-摄影")).toBeTruthy());
  });

  it("组名点击=过滤切换（组头无选中+点章 → 组 id；再点 → null）", () => {
    const notes = [makeNote(1, "拍了", 1)];
    const onGroupFilterChange = vi.fn();
    const { rerender } = render(
      <NoteListView notes={notes} groups={groups} groupFilter={null} {...baseProps} onGroupFilterChange={onGroupFilterChange} />,
    );
    fireEvent.click(screen.getByTestId("tree-title-摄影"));
    expect(onGroupFilterChange).toHaveBeenCalledWith(1);
    // 组过滤激活时（groupFilter=1）再点 → 取消过滤
    rerender(
      <NoteListView notes={notes} groups={groups} groupFilter={1} {...baseProps} onGroupFilterChange={onGroupFilterChange} />,
    );
    fireEvent.click(screen.getByTestId("tree-title-摄影"));
    expect(onGroupFilterChange).toHaveBeenCalledWith(null);
  });

  it("搜索激活 → 树退化平铺（组头不渲染）", () => {
    const notes = [makeNote(1, "拍了", 1)];
    render(<NoteListView notes={notes} groups={groups} groupFilter={null} {...baseProps} keyword="拍" />);
    expect(screen.queryByTestId("note-tree-摄影")).toBeNull();
    expect(screen.getByText("拍了")).toBeTruthy();
  });
});
