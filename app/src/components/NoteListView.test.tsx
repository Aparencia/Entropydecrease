// @vitest-environment jsdom
/**
 * NoteListView.test.tsx — 笔记列表交互（REQ-287 v0.19.7）关键路径。
 *
 * @ai-context: 覆盖——去 checkbox 后：单击=打开右栏（onSelect）；Ctrl+单击=
 *              加/减选（不触发打开）→ 批量栏浮现；Shift+单击=按列表位置区间
 *              选；批量选择模式（工具栏「选择」）：行单击=勾选且不打开，Esc
 *              退出并清空；批量删除（resolve=true 清空选择）；批量移动到组
 *              （选集菜单 → 组 → move_note_to_group 逐条）。invoke/事件全 mock。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note, NoteGroup } from "../types";
import NoteListView from "./NoteListView";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

function makeNote(id: number, title: string, groupId: number | null = null): Note {
  return { id, title, content: "", source: "manual", tags: "[]", pin: 0, group_id: groupId, created_at: 0, updated_at: 0 };
}
const groups = [
  { id: 1, name: "摄影", color: null, terrain: null, createdAt: 0, updatedAt: 0 },
] as unknown as NoteGroup[];
const notes = [makeNote(1, "笔记一", 1), makeNote(2, "笔记二", 1), makeNote(3, "笔记三", null)];

function baseProps(over: Record<string, unknown> = {}) {
  return {
    width: 320, notes, groups, groupFilter: null, onGroupFilterChange: vi.fn(),
    keyword: "", tagFilter: null, sortMode: "updated-desc" as const, allTags: [],
    selectedId: null, status: "", noteColors: {}, tagColors: {},
    onKeywordChange: vi.fn(), onTagFilterChange: vi.fn(), onSortModeChange: vi.fn(),
    onSelect: vi.fn(), onCreate: vi.fn(), onRefresh: vi.fn(), onOpenSession: vi.fn(),
    onBatchDelete: vi.fn(async () => true), onNoteMoved: vi.fn(), onCollapse: vi.fn(),
    ...over,
  } as Parameters<typeof NoteListView>[0];
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "note_order_list": return [];
      case "note_order_save": return null;
      case "note_order_clear": return true;
      case "move_note_to_group": return true;
      default: return null;
    }
  });
});
afterEach(cleanup);

describe("NoteListView REQ-287 选择交互", () => {
  it("单击=打开右栏（onSelect）；不出现批量栏", async () => {
    const onSelect = vi.fn();
    render(<NoteListView {...baseProps({ onSelect })} />);
    fireEvent.click(await screen.findByTestId("note-row-1"));
    expect(onSelect).toHaveBeenCalledWith(notes[0]);
    expect(screen.queryByText(/已选/)).toBeNull();
  });

  it("Ctrl+单击=加/减选（不打开）→ 批量栏浮现；Ctrl 再点=减选", async () => {
    const onSelect = vi.fn();
    render(<NoteListView {...baseProps({ onSelect })} />);
    fireEvent.click(await screen.findByTestId("note-row-1"), { ctrlKey: true });
    fireEvent.click(screen.getByTestId("note-row-2"), { ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/已选 2 个/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("note-row-1"), { ctrlKey: true });
    expect(screen.getByText(/已选 1 个/)).toBeTruthy();
  });

  it("Shift+单击=按列表位置区间选（锚=上次 Ctrl 点击行）", async () => {
    render(<NoteListView {...baseProps()} />);
    // 可见序=[未分组:3, 摄影:1,2]——锚 3（Ctrl），Shift 点 2 → 全段 {1,2,3}
    fireEvent.click(await screen.findByTestId("note-row-3"), { ctrlKey: true });
    fireEvent.click(screen.getByTestId("note-row-2"), { shiftKey: true });
    expect(screen.getByText(/已选 3 个/)).toBeTruthy();
  });

  it("批量选择模式：工具栏「选择」→ 行单击=勾选且不打开；Esc 退出并清空", async () => {
    const onSelect = vi.fn();
    render(<NoteListView {...baseProps({ onSelect })} />);
    fireEvent.click(await screen.findByTestId("batch-mode-toggle"));
    expect(screen.getByText(/选择模式/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("note-row-1"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/选择模式（1）/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText(/选择模式/)).toBeNull();
      expect(screen.queryByText(/已选/)).toBeNull();
    });
  });

  it("批量删除：按钮 → onBatchDelete(选集)；resolve=true 后清空选择", async () => {
    const onBatchDelete = vi.fn(async () => true);
    render(<NoteListView {...baseProps({ onBatchDelete })} />);
    fireEvent.click(await screen.findByTestId("note-row-1"), { ctrlKey: true });
    fireEvent.click(screen.getByTestId("batch-delete-btn"));
    await waitFor(() => expect(onBatchDelete).toHaveBeenCalledWith([1]));
    await waitFor(() => expect(screen.queryByText(/已选/)).toBeNull());
  });

  it("批量移动到组：选集含他组笔记 → 组 → move_note_to_group 落库", async () => {
    render(<NoteListView {...baseProps()} />);
    // 选 2（已在摄影）+ 3（未分组）→ 移到摄影只发未分组那条（已在组内跳过）
    fireEvent.click(await screen.findByTestId("note-row-2"), { ctrlKey: true });
    fireEvent.click(screen.getByTestId("note-row-3"), { ctrlKey: true });
    fireEvent.click(screen.getByTestId("batch-move-btn"));
    const menu = await screen.findByTestId("batch-context-menu");
    expect(menu).toBeTruthy();
    fireEvent.click(screen.getByText("📁 移动到组…"));
    fireEvent.click(await screen.findByText("📁 摄影"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("move_note_to_group", { noteId: 3, groupId: 1 });
      expect(invokeMock).not.toHaveBeenCalledWith("move_note_to_group", { noteId: 2, groupId: 1 });
    });
  });
});
