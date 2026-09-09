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

describe("RichEditorView 选区右键菜单（批 8 REQ-317）", () => {
  it("空选区右键不弹菜单（维持现状静默基线）", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.contextMenu(cmContent(), { clientX: 120, clientY: 120 });
    expect(screen.queryByTestId("note-sel-menu")).toBeNull();
  });

  it("Ctrl+A 全选后右键 → 菜单含加入行动；点击后选区末行后插任务行", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.keyDown(cmContent(), { key: "a", ctrlKey: true });
    fireEvent.contextMenu(cmContent(), { clientX: 120, clientY: 120 });
    expect(await screen.findByTestId("note-sel-menu")).toBeTruthy();
    expect(screen.getByTestId("note-sel-copy")).toBeTruthy();
    expect(screen.getByTestId("note-sel-selectAll")).toBeTruthy();
    expect(screen.getByTestId("note-sel-addTask")).toBeTruthy();
    expect(screen.getByTestId("note-sel-toQuestion")).toBeTruthy();
    expect(screen.getByTestId("note-sel-toModelCard")).toBeTruthy();
    fireEvent.click(screen.getByTestId("note-sel-addTask"));
    // 全选快照单行化（含换行折叠）成任务文本，插在选区结束行（末行）之后；
    // CM .cm-content 的 textContent 按行 div 拼接无换行符（行内断言见纯函数域）
    await waitFor(() => {
      expect(cmContent().textContent).toBe("第一行第二行- [ ] 第一行 第二行");
    });
  });

  it("行动类（转为问题）经 onSelectionAction 上抛（含快照文本）", async () => {
    const onSelectionAction = vi.fn();
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} onSelectionAction={onSelectionAction} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.keyDown(cmContent(), { key: "a", ctrlKey: true });
    fireEvent.contextMenu(cmContent(), { clientX: 120, clientY: 120 });
    fireEvent.click(await screen.findByTestId("note-sel-toQuestion"));
    expect(onSelectionAction).toHaveBeenCalledWith("toQuestion", "第一行\n第二行");
  });

  it("菜单打开后光标移走 → 加入行动仍插在快照 to（不用点击瞬间光标——审查 P2-13）", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    // Ctrl+A 全选 → 右键开菜单（快照 to=doc 末 7）
    fireEvent.keyDown(cmContent(), { key: "a", ctrlKey: true });
    fireEvent.contextMenu(cmContent(), { clientX: 120, clientY: 120 });
    expect(await screen.findByTestId("note-sel-menu")).toBeTruthy();
    // 菜单开着时把光标移到文首（连按 ←——任何一次都会离开末位，快照 to 不变）
    for (let i = 0; i < 20; i += 1) fireEvent.keyDown(cmContent(), { key: "ArrowLeft" });
    fireEvent.click(screen.getByTestId("note-sel-addTask"));
    // 断言：插在快照 to（末行行尾），而非点击瞬间光标处（文首→首行尾）——
    // 若用点击瞬间光标，任务行会插进「第一行」之后（textContent 出现行间任务）
    await waitFor(() => {
      expect(cmContent().textContent).toBe("第一行第二行- [ ] 第一行 第二行");
    });
  });

  it("荧光笔色板开着时正文右键 → 选区菜单打开且色板随机关闭（互斥——审查 P3-2）", async () => {
    render(<RichEditorView note={baseNote} onCancel={vi.fn()} />);
    await waitFor(() => expect(cmContent().textContent).toContain("第一行"));
    fireEvent.click(screen.getByTestId("highlight-open"));
    expect(screen.getByTestId("highlight-pop")).toBeTruthy();
    fireEvent.keyDown(cmContent(), { key: "a", ctrlKey: true });
    fireEvent.contextMenu(cmContent(), { clientX: 120, clientY: 120 });
    expect(await screen.findByTestId("note-sel-menu")).toBeTruthy();
    expect(screen.queryByTestId("highlight-pop")).toBeNull();
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
