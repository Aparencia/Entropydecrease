/**
 * RichEditorView.fallback.test.tsx — 降级护栏测试（spec §6.2/4.5）。
 * 强制 CM 初始化失败（mock useCodeMirror 触发 onInitError）→ 回退 NoteEditView
 * textarea 全功能（编辑可用性不丢）。与 RichEditorView.test.tsx 分文件：
 * vi.mock 文件级作用域隔离。
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note } from "../types";
import RichEditorView from "./RichEditorView";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, convertFileSrc: (p: string) => `asset://${p}` }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

// 强制 CM 初始化失败：useCodeMirror 首次调用触发 onInitError（模拟挂载异常），
// 降级后不再触发（否则 fallback 渲染循环——真实 hook 只在挂载 effect 调一次）
vi.mock("../hooks/useCodeMirror", () => {
  let triggered = false;
  return {
    useCodeMirror: (opts: { onInitError?: (e: unknown) => void }) => {
      if (!triggered) {
        triggered = true;
        opts.onInitError?.(new Error("CM 挂载失败（测试桩）"));
      }
      return { containerRef: { current: null }, viewRef: { current: null } };
    },
  };
});

const note: Note = {
  id: 1,
  title: "测试笔记",
  content: "第一行\n第二行",
  source: "manual",
  tags: "[]",
  pin: 0,
  created_at: 0,
  updated_at: 0,
};

describe("RichEditorView 降级护栏", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
  });

  it("CM 初始化失败 → 回退 textarea 可编辑", async () => {
    render(<RichEditorView note={note} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByPlaceholderText("在此编辑笔记内容…")).toBeTruthy());
    const ta = screen.getByPlaceholderText("在此编辑笔记内容…") as HTMLTextAreaElement;
    expect(ta.value).toContain("第一行");
    // textarea 可继续编辑（编辑可用性不丢）
    fireEvent.change(ta, { target: { value: "新内容" } });
    expect(ta.value).toBe("新内容");
  });

  afterEach(() => {
    cleanup();
  });
});
