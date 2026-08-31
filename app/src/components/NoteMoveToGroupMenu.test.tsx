// @vitest-environment jsdom
/**
 * NoteMoveToGroupMenu.test.tsx — 阅读头「移动到组」菜单（v0.16.1）。AAA 模式。
 *
 * @ai-context: 覆盖三条路径——移入组（invoke move_note_to_group 带 groupId）、
 *              移出组（command groupId=null，仅当前已归组时出现）、当前组 ✓
 *              禁点（幂等防重复调用）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import NoteMoveToGroupMenu from "./NoteMoveToGroupMenu";
import type { Note, NoteGroup } from "../types";

const groups: NoteGroup[] = [
  { id: 1, name: "化妆课程", terrain: "container", kind: "topic", domainTag: "beauty-makeup", source: "manual", seriesKey: null, routeReason: null, routeOverridden: 0, color: "pink", noteCount: 3, createdAt: 0, updatedAt: 0 },
  { id: 2, name: "乐理", terrain: "container", kind: "course", domainTag: null, source: "route", seriesKey: null, routeReason: null, routeOverridden: 0, color: null, noteCount: 5, createdAt: 0, updatedAt: 0 },
];

const noteBase: Note = {
  id: 42, title: "笔记", content: "x", source: "manual", tags: "[]", pin: 0, created_at: 0, updated_at: 0,
};

beforeEach(() => { invokeMock.mockReset(); invokeMock.mockResolvedValue(true); });
afterEach(() => cleanup());

describe("NoteMoveToGroupMenu 手动分组", () => {
  it("未归组：点开列出全部组；点组 → move_note_to_group(noteId, groupId) + 刷新", async () => {
    const onChanged = vi.fn();
    render(<NoteMoveToGroupMenu note={noteBase} groups={groups} onChanged={onChanged} />);
    fireEvent.click(screen.getByTestId("move-to-group-open"));
    expect(screen.getByTestId("move-to-group-1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("move-to-group-1"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("move_note_to_group", { noteId: 42, groupId: 1 });
    });
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByTestId("move-to-group-pop")).toBeNull(); // 成功后收起
  });

  it("已归组：当前组 ✓ 且点击不重复调用；「移出组」以 groupId=null 调用", async () => {
    render(<NoteMoveToGroupMenu note={{ ...noteBase, group_id: 2 }} groups={groups} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId("move-to-group-open"));
    const current = screen.getByTestId("move-to-group-2");
    expect(current.textContent).toContain("✓");
    fireEvent.click(current); // 幂等：当前组点击不调用
    expect(invokeMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("move-to-group-none"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("move_note_to_group", { noteId: 42, groupId: null });
    });
  });

  it("无组：提示先新建组（零命令调用）", () => {
    render(<NoteMoveToGroupMenu note={noteBase} groups={[]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId("move-to-group-open"));
    expect(screen.getByText(/暂无组/)).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
