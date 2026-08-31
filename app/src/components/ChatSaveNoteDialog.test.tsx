// @vitest-environment jsdom
/**
 * ChatSaveNoteDialog.test.tsx — 对话另存为笔记对话框（v0.16.1）。AAA 模式。
 *
 * @ai-context: 覆盖四契约——① 保存（可带目标组）→ create_note + 成功态；
 *              ② 失败红字不关窗；③ 保存成功态"在笔记页打开"；④ 取消关闭。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import ChatSaveNoteDialog from "./ChatSaveNoteDialog";
import type { NoteGroup } from "../types";

const groups: NoteGroup[] = [
  { id: 3, name: "AI 学习", terrain: "container", kind: "topic", domainTag: null, source: "manual", seriesKey: null, routeReason: null, routeOverridden: 0, color: null, noteCount: 0, createdAt: 0, updatedAt: 0 },
];

const content = "> **🧑 你**\n\n> 什么是梯度下降\n\n**🤖 AI**\n\n梯度下降是一种优化算法。";

function renderDialog(overrides: Partial<Parameters<typeof ChatSaveNoteDialog>[0]> = {}) {
  const calls = {
    onOpenNote: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ChatSaveNoteDialog initialTitle="梯度下降" content={content} groups={groups} {...calls} />);
  return calls;
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ id: 99, title: "梯度下降" });
});
afterEach(() => cleanup());

describe("ChatSaveNoteDialog", () => {
  it("保存（不归组）→ create_note(source=manual) + 成功态", async () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("chat-note-save"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_note", {
        new: { title: "梯度下降", content, source: "manual" },
      });
    });
    expect(screen.getByTestId("chat-note-saved").textContent).toContain("#99");
  });

  it("选目标组 → group_id 直入 NewNote", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("chat-note-group"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("chat-note-save"));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_note", {
        new: { title: "梯度下降", content, source: "manual", group_id: 3 },
      });
    });
  });

  it("保存失败 → 红字提示且对话框不关", async () => {
    invokeMock.mockRejectedValue("数据库满");
    const calls = renderDialog();
    fireEvent.click(screen.getByTestId("chat-note-save"));
    await waitFor(() => expect(screen.getByTestId("chat-note-error").textContent).toContain("数据库满"));
    expect(calls.onClose).not.toHaveBeenCalled();
  });

  it("成功态「在笔记页打开」→ onOpenNote(noteId)", async () => {
    const calls = renderDialog();
    fireEvent.click(screen.getByTestId("chat-note-save"));
    await waitFor(() => expect(screen.getByTestId("chat-note-saved")).toBeTruthy());
    fireEvent.click(screen.getByTestId("chat-note-open"));
    expect(calls.onOpenNote).toHaveBeenCalledWith(99);
  });

  it("取消关闭", () => {
    const calls = renderDialog();
    fireEvent.click(screen.getByTestId("chat-note-cancel"));
    expect(calls.onClose).toHaveBeenCalled();
  });
});
