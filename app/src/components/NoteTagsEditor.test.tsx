// @vitest-environment jsdom
/**
 * NoteTagsEditor 测试（批 7 T18）：验收「标签能写进去」的 **jsdom 级端到端**。
 *
 * @ai-context: 与 Rust 侧 `db_colors_tests.rs::e2e_tag_writes_survive_reopen`（真 SQLite 文件库 +
 *   关库重开）配套：本件覆盖**前端这一跳** —— 组件 → `invoke` 载荷 → 「重新读库」后重新渲染。
 *   这里的「库」是一张内存态 mock 后端（语义与 Rust 侧同形：`notes.tags` 列 + `tag_colors` 表）；
 *   Tauri IPC 壳与 WebView 未覆盖（真机不可达，C6.4）—— 见报告「诚实边界」。
 * @ai-context: 两条具名断言是**变异体的期望红点**（批 7 派发书 §3 的纪律：红必须红在具名断言上）：
 *   ①「写端载荷」——M「只改本地 state 不调 invoke」在这里红；
 *   ②「清色成对」——M「删掉 reset_tag_color 调用、只留设色」在 `reset_tag_color` 那条红。
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import NoteTagsEditor from "./NoteTagsEditor";

afterEach(cleanup);

const NOTE_ID = 7;

/** 内存态 mock 后端（`notes.tags` 列 + `tag_colors` 表；语义与 Rust 侧一一对应）。 */
function makeBackend(initialTags: string[]) {
  const store = { tags: JSON.stringify(initialTags), colors: {} as Record<string, string> };
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case "list_tag_colors":
        return Object.entries(store.colors).map(([tag, color]) => ({ tag, color }));
      case "update_note_tags":
        store.tags = args?.tags as string;
        return true;
      case "set_tag_color":
        store.colors[args?.tag as string] = args?.color as string;
        return null;
      case "reset_tag_color":
        delete store.colors[args?.tag as string];
        return null;
      default:
        return null;
    }
  });
  return store;
}

/** 库内笔记快照（`tags` 就是库列原文 ⇒ 「重新读库」= 拿最新列重挂载）。 */
const noteOf = (tagsJson: string): Note => ({
  id: NOTE_ID,
  title: "标签夹具",
  content: "",
  source: "manual",
  session_id: null,
  rule_version: null,
  purify_stats: null,
  tags: tagsJson,
  properties: null,
  pin: 0,
  group_id: null,
  created_at: 1,
  updated_at: 2,
});

const renderEditor = (tagsJson: string, onChanged = vi.fn(), onError = vi.fn()) => {
  const view = render(<NoteTagsEditor note={noteOf(tagsJson)} onChanged={onChanged} onError={onError} />);
  fireEvent.click(screen.getByTestId("note-tags-entry"));
  return { ...view, onChanged, onError };
};

describe("NoteTagsEditor（批 7 T18 验收「标签能写进去」）", () => {
  it("① 加标签 → 写端载荷 → 重新读库 → 标签仍在", async () => {
    // Arrange：空标签的笔记
    const store = makeBackend([]);
    const { unmount, onChanged } = renderEditor(store.tags);
    // Act：输入 + 点「添加」
    fireEvent.change(screen.getByTestId("note-tag-input"), { target: { value: "化妆" } });
    fireEvent.click(screen.getByTestId("note-tag-add"));
    // Assert（具名断言）：invoke 载荷逐字 —— 「只改本地 state 不调 invoke」的变异体在这里红
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_note_tags", { id: NOTE_ID, tags: JSON.stringify(["化妆"]) }),
    );
    expect(store.tags, "库内 tags 列没被写入").toBe(JSON.stringify(["化妆"]));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // Assert：重新读库（卸载 → 按库内最新列重挂载）⇒ 标签仍在
    unmount();
    renderEditor(store.tags);
    expect(screen.getByTestId("note-tag-chip-化妆")).toBeTruthy();
  });

  it("② 设色 → 读回 → 色在；清色 → 读回 → 色无（成对，§C2.2）", async () => {
    // Arrange：已有标签的笔记
    const store = makeBackend(["化妆"]);
    renderEditor(store.tags);
    // Act：点芯片展开色板 → 点色点
    fireEvent.click(screen.getByTestId("note-tag-chip-化妆"));
    fireEvent.click(await screen.findByTestId("color-purple"));
    // Assert：设色走 set_tag_color，且库内查色表读回有色
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("set_tag_color", { tag: "化妆", color: "purple" }));
    expect(store.colors, "设色没写进查色表").toEqual({ 化妆: "purple" });
    // Act：清色（picker 既有的 color-clear）
    fireEvent.click(screen.getByTestId("color-clear"));
    // Assert（具名断言）：「标签色成对」的清色半边 —— 删掉 reset_tag_color 调用的变异体在这里红
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("reset_tag_color", { tag: "化妆" }));
    expect(store.colors, "清色没从查色表移除").toEqual({});
  });

  it("③ 删标签也走 update_note_tags（同一条写端命令）", async () => {
    const store = makeBackend(["化妆", "编程"]);
    const { onChanged } = renderEditor(store.tags);
    fireEvent.click(screen.getByTestId("note-tag-remove-化妆"));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_note_tags", { id: NOTE_ID, tags: JSON.stringify(["编程"]) }),
    );
    expect(store.tags).toBe(JSON.stringify(["编程"]));
    expect(onChanged).toHaveBeenCalled();
  });

  it("④ 写失败经 onError 上抛（不吞异常）", async () => {
    const store = makeBackend([]);
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_tag_colors") return [];
      throw new Error("db locked");
    });
    const onError = vi.fn();
    renderEditor(store.tags, vi.fn(), onError);
    fireEvent.change(screen.getByTestId("note-tag-input"), { target: { value: "化妆" } });
    fireEvent.click(screen.getByTestId("note-tag-add"));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(String(onError.mock.calls[0][0])).toContain("db locked");
  });
});
