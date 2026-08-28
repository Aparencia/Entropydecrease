// @vitest-environment jsdom
/**
 * NotesPage.test.tsx — 笔记编辑完成即时刷新测试（v0.13.6 REQ-223 M1-B）。
 *
 * @ai-context: 覆盖用户实测 P0——编辑标题「完成」后右栏阅读视图仍显示旧标题。
 *              根因：保存未 await + selected 不重取。断言 invoke 顺序契约：
 *              update_note → get_note，且右栏 h2 呈现新标题（刷新回填生效）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmMock }));
// EnrichPanel 挂载期 useAiTaskPolling 会 listen 事件——mock 返回解绑函数
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import NotesPage from "./NotesPage";

const baseNote = (title: string): Note => ({
  id: 1,
  title,
  content: "# 正文\n内容段落",
  source: "session",
  session_id: 42,
  rule_version: null,
  purify_stats: null,
  tags: "[]",
  properties: null,
  pin: 0,
  group_id: null,
  created_at: 1,
  updated_at: 2,
});

describe("NotesPage 编辑完成即时刷新", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    confirmMock.mockReset();
    // 模拟库内状态：初始"旧标题"，update_note 后 get_note 返回"新标题"
    let store: Note = baseNote("旧标题");
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case "list_notes":
          return [store];
        case "list_note_groups":
          return [];
        case "count_due_cards":
          return 0;
        case "list_fragments":
          return [];
        case "get_feature_flags":
          return { feedCapture: true };
        case "update_note":
          store = { ...store, title: args?.title as string };
          return true;
        case "get_note":
          return store;
        default:
          // 子面板（EnrichPanel/VersionPanel/NoteLinkToSystem 等）挂载期查询——空值兜底不抛错
          if (cmd === "note_versions_list") return [];
          if (cmd === "note_versions_usage") return [];
          if (cmd === "list_knowledge_systems") return [];
          if (cmd === "list_knowledge_links") return [];
          // v0.14：颜色数据（B2 色板）与反查（C3）——空值兜底不抛错
          if (cmd === "list_tag_colors") return [];
          if (cmd === "list_links_by_target") return [];
          return null;
      }
    });
  });

  afterEach(() => cleanup());

  it("编辑标题→完成：update_note 先于 get_note，右栏立即显示新标题", async () => {
    render(<NotesPage />);
    // 列表出现并选中笔记（点击列表行）
    const rowTitle = await screen.findByText("旧标题");
    fireEvent.click(rowTitle);
    await waitFor(() => expect(screen.getByRole("heading", { name: "旧标题" })).toBeTruthy());

    // 进入编辑 → 改标题 → 完成
    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));
    const titleInput = await screen.findByPlaceholderText("笔记标题");
    fireEvent.change(titleInput, { target: { value: "新标题" } });
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    // 断言：update_note 先发生，随后 get_note 回填——右栏 h2 呈现新标题
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter((c) => c[0] === "update_note" || c[0] === "get_note");
      const up = calls.findIndex((c) => c[0] === "update_note");
      const get = calls.findIndex((c) => c[0] === "get_note");
      expect(up).toBeGreaterThanOrEqual(0);
      expect(get).toBeGreaterThan(up);
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "新标题" })).toBeTruthy());
  });

  it("ESC 退出（审查 H1）：先 flush 保存再刷新——update_note 先于 get_note", async () => {
    render(<NotesPage />);
    const rowTitle = await screen.findByText("旧标题");
    fireEvent.click(rowTitle);
    await waitFor(() => expect(screen.getByRole("heading", { name: "旧标题" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));
    const titleInput = await screen.findByPlaceholderText("笔记标题");
    fireEvent.change(titleInput, { target: { value: "ESC 新标题" } });
    // ESC 出口：窗口级监听 → 先 flushSave 再刷新（修复前 get_note 先于卸载保存）
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter((c) => c[0] === "update_note" || c[0] === "get_note");
      const up = calls.findIndex((c) => c[0] === "update_note");
      const get = calls.findIndex((c) => c[0] === "get_note");
      expect(up).toBeGreaterThanOrEqual(0);
      expect(get).toBeGreaterThan(up);
    });
    await waitFor(() => expect(screen.getByRole("heading", { name: "ESC 新标题" })).toBeTruthy());
  });
});
