// @vitest-environment jsdom
/**
 * NoteListView.tree.test.tsx — v0.15 分组树交互契约测试。
 *
 * @ai-context: 组头渲染（组名下挂笔记）/chevron 收起展开（stopPropagation 不触发
 *              过滤）/组名点击=过滤切换（决策 1 语义）/搜索激活退化平铺/
 *              空组不渲染/未分组区收纳 group_id=null 笔记。
 * @ai-context: REQ-315（批 6）追加——树视图 scope 内 置顶→手排→自动 排序生效
 *              （gap③）、组头排序与组侧栏同规则、右键上移/下移显式移动
 *              （自动组首移=快照转手排）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note, NoteGroup } from "../types";
import NoteListView from "./NoteListView";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

// REQ-287：NoteListView 现读写 localStorage 组折叠——每测清空防串扰
beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* jsdom 守卫 */ }
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "note_order_list": return [];
      case "note_group_order_list": return [];
      case "note_order_save": return null;
      case "note_order_clear": return true;
      default: return null;
    }
  });
});

function makeNote(id: number, title: string, groupId?: number | null, pin = 0): Note {
  return {
    id,
    title,
    content: "",
    source: "manual",
    tags: "[]",
    pin,
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
  onNotePinToggle: vi.fn(),
  onNoteEdit: vi.fn(),
  onNoteDelete: vi.fn(),
  onNoteMoved: vi.fn(),
};

/** 树组头下渲染行的可见顺序（data-testid note-row-{id} 序列） */
function rowOrderIn(bodyTestId: string): string[] {
  const body = screen.getByTestId(bodyTestId);
  return Array.from(body.querySelectorAll('[data-testid^="note-row-"]'))
    .map((el) => el.getAttribute("data-testid") ?? "");
}

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

describe("NoteListView REQ-315 树视图排序/显式移动", () => {
  it("组内展示序：置顶区（更新时间降序）在前，其余保持更新时间序（pin 树视图生效）", async () => {
    const notes = [
      makeNote(1, "普通-旧", 1, 0),
      makeNote(2, "置顶-旧", 1, 1),
      makeNote(3, "置顶-新", 1, 1),
      makeNote(4, "普通-新", 1, 0),
    ];
    // updated_at：置顶-旧=5 > 置顶-新=2；普通-新=9 > 普通-旧=1
    const stamped = notes.map((n, i) => ({ ...n, updated_at: [1, 5, 2, 9][i] }));
    render(<NoteListView notes={stamped} groups={groups} groupFilter={1} {...baseProps} />);
    await screen.findByTestId("note-tree-摄影");
    expect(rowOrderIn("tree-body-摄影")).toEqual(["note-row-2", "note-row-3", "note-row-4", "note-row-1"]);
  });

  it("手排 scope：置顶区在前，其余按 note_orders seq（load 序）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "note_order_list") return [["g:1", 2], ["g:1", 1]]; // 行序 [2,1]
      if (cmd === "note_group_order_list") return [];
      return null;
    });
    const notes = [makeNote(1, "手排一", 1), makeNote(2, "手排二", 1), makeNote(3, "置顶", 1, 1)];
    render(<NoteListView notes={notes} groups={groups} groupFilter={1} {...baseProps} />);
    await screen.findByTestId("note-tree-摄影");
    // 行序 [2,1] → 渲染 3(置顶) → 2 → 1
    expect(rowOrderIn("tree-body-摄影")).toEqual(["note-row-3", "note-row-2", "note-row-1"]);
  });

  it("右键上移/下移：自动组内首移 = 以可见序快照转手排（save 整表覆写）", async () => {
    const notes = [makeNote(1, "甲", 1), makeNote(2, "乙", 1), makeNote(3, "丙", 1)];
    render(<NoteListView notes={notes} groups={groups} groupFilter={1} {...baseProps} />);
    await screen.findByTestId("note-tree-摄影");
    // 自动区可见序=输入序 [1,2,3]（桶内稳定）——「乙」(2) 非边界行
    fireEvent.contextMenu(screen.getByTestId("note-row-2"), { clientX: 30, clientY: 40 });
    expect(screen.getByTestId("ctx-move-up")).toBeTruthy();
    expect(screen.getByTestId("ctx-move-down")).toBeTruthy();
    expect(screen.getByTestId("ctx-pin").textContent).toContain("置顶");
    // 下移 = 换位后整表覆写（自动组 → 快照转手排）
    fireEvent.click(screen.getByTestId("ctx-move-down"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("note_order_save", { scope: "g:1", noteIds: [1, 3, 2] });
    });
  });

  it("右键置顶笔记：菜单为「取消置顶」，移动禁用且不落库", async () => {
    const notes = [makeNote(1, "置顶的", 1, 1), makeNote(2, "普通的", 1)];
    render(<NoteListView notes={notes} groups={groups} groupFilter={1} {...baseProps} />);
    await screen.findByTestId("note-tree-摄影");
    fireEvent.contextMenu(screen.getByTestId("note-row-1"), { clientX: 30, clientY: 40 });
    expect(screen.getByTestId("ctx-pin").textContent).toContain("取消置顶");
    // 置顶区按更新时间定序——上移/下移禁用（title 提示语义）
    const up = screen.getByTestId("ctx-move-up") as HTMLButtonElement;
    const down = screen.getByTestId("ctx-move-down") as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(true);
    fireEvent.click(up);
    expect(invokeMock).not.toHaveBeenCalledWith("note_order_save", expect.anything());
  });

  it("组头排序与侧栏同规则：置顶组段列最前（跨 kind 单遍规则）", async () => {
    const extra: NoteGroup[] = [
      ...groups,
      { ...groups[0], id: 3, name: "化妆", pin: 1, updatedAt: 1 },
    ];
    const notes = [makeNote(1, "摄影笔记", 1), makeNote(3, "化妆笔记", 3)];
    render(<NoteListView notes={notes} groups={extra} groupFilter={null} {...baseProps} />);
    await screen.findByTestId("note-tree-摄影");
    // 置顶的「化妆」(id3) 段在「摄影」(id1) 段之前
    const headers = Array.from(screen.getByTestId("note-tree-化妆").parentElement?.querySelectorAll('[data-testid^="note-tree-"]') ?? []);
    const idx = (name: string) => headers.findIndex((h) => h.getAttribute("data-testid") === `note-tree-${name}`);
    expect(idx("化妆")).toBeLessThan(idx("摄影"));
  });

  it("平铺（搜索）态右键：不出现上移/下移（交互矩阵禁移动）", async () => {
    const notes = [makeNote(1, "拍了", 1), makeNote(2, "写了", 1)];
    render(<NoteListView notes={notes} groups={groups} groupFilter={null} {...baseProps} keyword="拍" />);
    fireEvent.contextMenu(await screen.findByTestId("note-row-1"), { clientX: 30, clientY: 40 });
    expect(screen.getByTestId("note-row-menu")).toBeTruthy();
    expect(screen.queryByTestId("ctx-move-up")).toBeNull();
    expect(screen.queryByTestId("ctx-move-down")).toBeNull();
  });
});
