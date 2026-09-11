// @vitest-environment jsdom
/**
 * NoteListView.fold.test.tsx — 组折叠记忆的**键派生**契约（批 0-C2 / Task 2 补测）。
 *
 * @ai-context: 折叠态在本组件里存在三套派生键——scope 键 `g:{id}`（note_orders 落库
 *              用）、裸键 `String(groupId)`/`"none"`（渲染/可见序/初始化）、反解析
 *              `scope.slice(2)`（划选起点）；而 localStorage 记忆键恒为
 *              `notes:group-fold:{裸键}`。既有 tree.test.tsx 每测 `localStorage.clear()`
 *              ⇒ 若键派生漂移成 scope 键，测试仍全绿但**用户折叠记忆静默失效**。
 *              本文件对「写」与「读」两侧都断言裸键，钉住该派生。
 * @ai-context: 只读断言型测试（render + 查询 + 断言），不驱动生产代码改动；
 *              在拆分前即通过 = 断言的是既有行为而非新行为。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note, NoteGroup } from "../types";
import NoteListView from "./NoteListView";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const groups: NoteGroup[] = [
  {
    id: 1, name: "摄影", terrain: "container", kind: "topic", domainTag: "photo",
    source: "manual", seriesKey: null, routeReason: null, routeOverridden: 0,
    color: null, noteCount: 1, createdAt: 0, updatedAt: 0,
  },
];

function makeNote(id: number, title: string, groupId: number | null = null): Note {
  return {
    id, title, content: "", source: "manual", tags: "[]", pin: 0,
    group_id: groupId, created_at: 0, updated_at: 0,
  };
}

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

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* jsdom 守卫 */ }
  invokeMock.mockReset();
  // 挂载期只发序行两类只读命令；本文件不驱动排序/归组 ⇒ 一律回空数组即可
  invokeMock.mockImplementation(async () => []);
});
afterEach(cleanup);

describe("组折叠 localStorage 键派生（裸键，非 scope 键）", () => {
  it("折叠写入裸键 notes:group-fold:1，不写 scope 键 notes:group-fold:g:1", async () => {
    render(<NoteListView notes={[makeNote(1, "拍了", 1)]} groups={groups} groupFilter={null} {...baseProps} />);
    await screen.findByTestId("note-tree-摄影");
    fireEvent.click(screen.getByTestId("tree-chevron-摄影"));
    await waitFor(() => expect(window.localStorage.getItem("notes:group-fold:1")).toBe("1"));
    expect(window.localStorage.getItem("notes:group-fold:g:1")).toBeNull();
  });

  it("预置裸键 =1 → 折叠记忆被读取（组 body 不渲染）", async () => {
    window.localStorage.setItem("notes:group-fold:1", "1");
    render(<NoteListView notes={[makeNote(1, "拍了", 1)]} groups={groups} groupFilter={null} {...baseProps} />);
    await screen.findByTestId("note-tree-摄影");
    expect(screen.queryByTestId("tree-body-摄影")).toBeNull();
  });
});
