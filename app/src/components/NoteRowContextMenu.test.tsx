// @vitest-environment jsdom
/**
 * NoteRowContextMenu.test.tsx — 笔记行右键菜单（v0.16.1）。AAA 模式。
 *
 * @ai-context: 覆盖四契约——① 根视图五项齐全；② 移动到组二级视图 →
 *              move_note_to_group(noteId, groupId) + onMoved；③ 固定/编辑/删除
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
  invokeMock.mockResolvedValue(true);
  writeTextMock.mockReset();
  writeTextMock.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("NoteRowContextMenu", () => {
  it("根视图：移动到组/固定/复制标题/复制正文/编辑/删除 六项齐全", () => {
    renderMenu();
    expect(screen.getByTestId("ctx-groups")).toBeTruthy();
    expect(screen.getByTestId("ctx-pin").textContent).toContain("固定");
    expect(screen.getByTestId("ctx-copy-title")).toBeTruthy();
    expect(screen.getByTestId("ctx-copy-body")).toBeTruthy();
    expect(screen.getByTestId("ctx-edit")).toBeTruthy();
    expect(screen.getByTestId("ctx-delete")).toBeTruthy();
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

  it("固定/编辑/删除委托父层回调（不 invoke）", () => {
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
