// @vitest-environment jsdom
/**
 * NoteRowContextMenu.test.tsx — 笔记行右键菜单（v0.16.1）。AAA 模式。
 *
 * @ai-context: 覆盖四契约——① 根视图（树上下文含上移/下移）；② 移动到组二级视图 →
 *              move_note_to_group(noteId, groupId) + onMoved；③ 置顶/编辑/删除
 *              委托父层回调（自身零 invoke）；④ 复制标题/正文走剪贴板。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock, writeTextMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), writeTextMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
Object.defineProperty(globalThis.navigator, "clipboard", {
  value: { writeText: writeTextMock },
  configurable: true,
});

import NoteRowContextMenu from "./NoteRowContextMenu";
import type { Note, NoteGroup } from "../types";

const groups: NoteGroup[] = [
  { id: 1, name: "化妆", terrain: "container", kind: "topic", domainTag: "beauty-makeup", source: "manual", seriesKey: null, routeReason: null, routeOverridden: 0, color: "pink", noteCount: 2, createdAt: 0, updatedAt: 0 },
];
const note: Note = { id: 7, title: "测试笔记", content: "正文内容", source: "manual", tags: "[]", pin: 0, created_at: 0, updated_at: 0 };

function renderMenu(overrides: Partial<Parameters<typeof NoteRowContextMenu>[0]> = {}) {
  const calls = {
    onClose: vi.fn(),
    onPinToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMoved: vi.fn(),
    ...overrides,
  };
  render(<NoteRowContextMenu note={note} groups={groups} x={100} y={100} {...calls} />);
  return calls;
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ moved: true, autoCleanedGroups: [] });
  writeTextMock.mockReset();
  writeTextMock.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("NoteRowContextMenu", () => {
  it("根视图（无树移动上下文）：置顶/移动到组/复制标题/复制正文/编辑/删除 六项齐全", () => {
    renderMenu();
    expect(screen.getByTestId("ctx-groups")).toBeTruthy();
    expect(screen.getByTestId("ctx-pin").textContent).toContain("置顶");
    expect(screen.queryByTestId("ctx-move-up")).toBeNull();
    expect(screen.queryByTestId("ctx-move-down")).toBeNull();
    expect(screen.getByTestId("ctx-copy-title")).toBeTruthy();
    expect(screen.getByTestId("ctx-copy-body")).toBeTruthy();
    expect(screen.getByTestId("ctx-edit")).toBeTruthy();
    expect(screen.getByTestId("ctx-delete")).toBeTruthy();
  });

  it("树上下文：上移/下移渲染且按 canMove 启用；动作委托父层回调", () => {
    const calls = renderMenu({
      onMoveWithinScope: vi.fn(),
      canMoveUp: true,
      canMoveDown: false,
    });
    expect(screen.getByTestId("ctx-move-up")).toBeTruthy();
    expect(screen.getByTestId("ctx-move-down")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ctx-move-up"));
    expect(calls.onMoveWithinScope).toHaveBeenCalledWith(note, -1);
    expect(calls.onClose).toHaveBeenCalled();
  });

  it("置顶中：菜单项为「取消置顶」；置顶笔记移动禁用（提示语义）", () => {
    const calls = renderMenu({
      note: { ...note, pin: 1 },
      onMoveWithinScope: vi.fn(),
      canMoveUp: false,
      canMoveDown: false,
    });
    expect(screen.getByTestId("ctx-pin").textContent).toContain("取消置顶");
    // 置顶项移动禁用：点击不触发（disabled 按钮）
    fireEvent.click(screen.getByTestId("ctx-move-up"));
    expect(calls.onMoveWithinScope).not.toHaveBeenCalled();
    // 置顶区语义提示（title）
    expect(screen.getByTestId("ctx-move-up").getAttribute("title")).toContain("置顶区");
  });

  it("移动到组：二级视图点组 → move_note_to_group + onMoved + 关闭", async () => {
    const calls = renderMenu();
    fireEvent.click(screen.getByTestId("ctx-groups"));
    fireEvent.click(screen.getByTestId("ctx-group-1"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("move_note_to_group", { noteId: 7, groupId: 1 });
    });
    expect(calls.onMoved).toHaveBeenCalled();
    expect(calls.onClose).toHaveBeenCalled();
  });

  it("已归组笔记：显示‖移出分组‖（groupId=null）", async () => {
    renderMenu({ note: { ...note, group_id: 1 } });
    fireEvent.click(screen.getByTestId("ctx-groups"));
    expect(screen.getByTestId("ctx-group-1").textContent).toContain("✓");
    fireEvent.click(screen.getByTestId("ctx-group-none"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("move_note_to_group", { noteId: 7, groupId: null });
    });
  });

  it("置顶/编辑/删除委托父层回调（不 invoke）", () => {
    const calls = renderMenu();
    fireEvent.click(screen.getByTestId("ctx-pin"));
    fireEvent.click(screen.getByTestId("ctx-edit"));
    fireEvent.click(screen.getByTestId("ctx-delete"));
    expect(calls.onPinToggle).toHaveBeenCalledWith(note);
    expect(calls.onEdit).toHaveBeenCalledWith(note);
    expect(calls.onDelete).toHaveBeenCalledWith(note);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("复制正文：写入剪贴板并提示", async () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("ctx-copy-body"));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("正文内容"));
    expect(screen.getByText(/已复制正文/)).toBeTruthy();
  });
});
