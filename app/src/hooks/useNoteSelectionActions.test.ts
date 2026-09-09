/**
 * useNoteSelectionActions.test.ts — 笔记页选区行动类编排 hook（批 8 REQ-317）。
 * 覆盖：转问题 → question_create 命令面 + noteId 回链 + toast（成功/失败）；
 *       模型卡预填 → 对话框态开启且 excerpt ≤200 单行化；防御（无选中笔记不动作）。
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNoteSelectionActions } from "./useNoteSelectionActions";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const LONG_SNIPPET = `${"甲".repeat(250)}\n第二段`;

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(7);
});

describe("useNoteSelectionActions", () => {
  it("转为问题：question_create 收到 ≤200 单行化文本 + noteId 回链 → toast ok", async () => {
    const notify = vi.fn();
    const { result } = renderHook(() =>
      useNoteSelectionActions({ noteId: 12, onChanged: vi.fn(), notify }),
    );
    act(() => result.current.handleSelectionAction("toQuestion", LONG_SNIPPET));
    expect(invokeMock).toHaveBeenCalledWith("question_create", {
      text: expect.stringMatching(/^甲+…$/),
      noteId: 12,
      context: null,
    });
    const text = invokeMock.mock.calls[0][1].text as string;
    expect(text.length).toBe(200);
    expect(text.includes("\n")).toBe(false);
    // await 内部 promise 链后断言 toast
    await act(async () => { await Promise.resolve(); });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("已转为问题"), "ok");
  });

  it("转为问题失败 → toast err", async () => {
    const notify = vi.fn();
    invokeMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useNoteSelectionActions({ noteId: 12, onChanged: vi.fn(), notify }),
    );
    act(() => result.current.handleSelectionAction("toQuestion", "疑问文本"));
    await act(async () => { await Promise.resolve(); });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("转为问题失败"), "err");
  });

  it("模型卡预填：对话框开启且 excerpt=≤200 单行化快照；header 入口为空串预填", () => {
    const { result } = renderHook(() =>
      useNoteSelectionActions({ noteId: 1, onChanged: vi.fn(), notify: vi.fn() }),
    );
    act(() => result.current.handleSelectionAction("toModelCard", LONG_SNIPPET));
    expect(result.current.modelDialog).not.toBeNull();
    expect(result.current.modelDialog!.excerpt.length).toBe(200);
    expect(result.current.modelDialog!.excerpt.includes("\n")).toBe(false);
    act(() => result.current.closeModelCard());
    expect(result.current.modelDialog).toBeNull();
    act(() => result.current.openModelCard());
    expect(result.current.modelDialog).toEqual({ excerpt: "" });
  });

  it("防御：noteId 为空 → 转问题不 invoke（模型卡态可开——渲染闸在 NotesPage「selected 在场」，hook 不重复设防）", () => {
    const notify = vi.fn();
    const { result } = renderHook(() =>
      useNoteSelectionActions({ noteId: null, onChanged: vi.fn(), notify }),
    );
    act(() => result.current.handleSelectionAction("toQuestion", "x"));
    act(() => result.current.handleSelectionAction("toModelCard", "y"));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
