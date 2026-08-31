/**
 * RichEditorView.test.tsx — v0.14 A 编辑器容器组件测试（spec §6.2/6.3）。
 * 覆盖：CM 渲染 + 工具栏 H2 → doc 变化 / Ctrl+Z 撤销恢复 / 草稿恢复两分支 /
 *       保存集成（fake timers 双计时器）/ 退出 flush / 卸载保存。
 * 降级护栏（CM 初始化失败回退 textarea）见 RichEditorView.fallback.test.tsx。
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note } from "../types";
import RichEditorView from "./RichEditorView";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://${p}`,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const baseNote: Note = {
  id: 1,
  title: "测试笔记",
  content: "第一行\n第二行",
  source: "manual",
  tags: "[]",
  pin: 0,
  created_at: 0,
  updated_at: 0,
};

function cmContent(): HTMLElement {
  const el = document.querySelector(".cm-content");
  if (!el) throw new Error("CM 未挂载");
  return el as HTMLElement;
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(null);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RichEditorView 核心编辑", () => {
  it("渲染 CM 编辑区（非 textarea）且内容初始化", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("工具栏 H2 点击 → doc 出现 ## 且光标落位", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.click(screen.getByTitle("标题2 Ctrl+2"));
    await waitFor(() => expect(cmContent().textContent).toContain("## 第一行"));
    expect(cmContent().textContent).not.toContain("## 第二行"); // 无选区只转当前行
  });

  it("Ctrl+Z 撤销工具栏操作（CM history 内建）", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.click(screen.getByTitle("标题2 Ctrl+2"));
    await waitFor(() => expect(cmContent().textContent).toContain("## 第一行"));
    fireEvent.keyDown(cmContent(), { key: "z", ctrlKey: true });
    await waitFor(() => expect(cmContent().textContent).not.toContain("## "));
  });

  it("Ctrl+1/2/3 快捷键直接生效（headingKeymap）", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.keyDown(cmContent(), { key: "3", ctrlKey: true });
    await waitFor(() => expect(cmContent().textContent).toContain("### 第一行"));
  });

  // v0.16.1 回归：插件不得产出 block decoration（CM6 抛 RangeError「Block
  // decorations may not be specified via plugins」——插入独立行图片即崩）
  it("独立行图片渲染为 widget（不抛 RangeError，原语法被替换）", async () => {
    const note = { ...baseNote, content: "前文\n![图](notes-images/1/a.png)\n后文" };
    render(<RichEditorView note={note} onCancel={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".cm-note-image")).not.toBeNull());
    // 语法文本已被 widget 替换（不残留源码）
    expect(cmContent().textContent).not.toContain("![图]");
    expect(cmContent().textContent).toContain("前文");
  });
});

describe("RichEditorView 草稿恢复层", () => {
  it("存在更新草稿 → 提示恢复；点恢复 → title/content 生效", async () => {
    localStorage.setItem(
      "note-draft:1",
      JSON.stringify({ title: "草稿标题", content: "草稿正文内容", updatedAt: 999_999_999_999 }),
    );
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/检测到未保存的编辑草稿/)).toBeTruthy());
    fireEvent.click(screen.getByText("恢复"));
    await waitFor(() => {
      expect((screen.getByPlaceholderText("笔记标题") as HTMLInputElement).value).toBe("草稿标题");
      expect(cmContent().textContent).toContain("草稿正文内容");
    });
  });

  it("点丢弃 → 草稿清除且提示消失", async () => {
    localStorage.setItem(
      "note-draft:1",
      JSON.stringify({ title: "草稿标题", content: "草稿正文", updatedAt: 999_999_999_999 }),
    );
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/检测到未保存的编辑草稿/)).toBeTruthy());
    fireEvent.click(screen.getByText("丢弃"));
    expect(localStorage.getItem("note-draft:1")).toBeNull();
    await waitFor(() => expect(screen.queryByText(/检测到未保存的编辑草稿/)).toBeNull());
  });

  it("草稿不比 DB 新 → 不提示", async () => {
    localStorage.setItem(
      "note-draft:1",
      JSON.stringify({ title: "旧草稿", content: "x", updatedAt: 0 }), // 与 DB updated_at 相同
    );
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    expect(screen.queryByText(/检测到未保存的编辑草稿/)).toBeNull();
  });
});

describe("RichEditorView 保存集成", () => {
  it("输入后双计时器触发 update_note（不建版本）", async () => {
    vi.useFakeTimers();
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByTitle("标题2 Ctrl+2"));
    await act(async () => { await Promise.resolve(); });
    expect(invokeMock).not.toHaveBeenCalled(); // idle 2s 未到
    await act(async () => { vi.advanceTimersByTime(2100); });
    await act(async () => { await Promise.resolve(); });
    expect(invokeMock).toHaveBeenCalledWith("update_note", expect.objectContaining({ id: 1, createVersion: false }));
  });

  it("完成（Ctrl+E）→ flush 保存后再 onCancel", async () => {
    const onCancel = vi.fn();
    render(<RichEditorView note={baseNote} onCancel={onCancel} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.click(screen.getByTitle("标题2 Ctrl+2"));
    await waitFor(() => expect(cmContent().textContent).toContain("## 第一行"));
    fireEvent.click(screen.getByText(/完成/));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    // flush 先于 onCancel：invoke 已带最新内容
    expect(invokeMock).toHaveBeenCalledWith("update_note", expect.objectContaining({
      id: 1,
      content: "## 第一行\n第二行",
    }));
  });

  it("卸载时 dirty 自动保存", async () => {
    const { unmount } = render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.click(screen.getByTitle("标题2 Ctrl+2"));
    await waitFor(() => expect(cmContent().textContent).toContain("## 第一行"));
    unmount();
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("update_note", expect.objectContaining({ id: 1 }));
    });
  });
});
