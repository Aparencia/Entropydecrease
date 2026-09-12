// @vitest-environment jsdom
/**
 * NotesPage.groupFilter.test.tsx — 页面「组过滤接线」的行为级判据（批 5 T4 收口 W1 缺口）。
 *
 * @ai-context: 为什么必须单独钉——`visibleNotes`（组过滤 + SE 封存）的派生在批 5 T4 从
 *              `NotesPage` 搬进了 `utils/colorPalette.visibleNotesOf`，页面只剩「接线」
 *              （把 `groupFilter` 作为实参传给派生函数）。T4 的探针 W1 实测：把那个实参
 *              换成常量 `null`（真实缺陷：组过滤静默失效）后，既有
 *              `NotesPage.test.tsx` 的 2 条用例**仍 2/2 全绿** ⇒ 接线当时没有判据。
 *              本文件补上这条判据：用**既有的公共注入面** `focusGroupId` prop
 *              （`useNotesDeepLink` → `setGroupFilter`）注入组过滤，断言**渲染出来的
 *              列表条目**随注入变化；再用反向对照排除「夹具里本来就只有一条」的空真。
 * @ai-context: 判据强度的来源（写清以防被弱化）——渲染层的组过滤**只有页面这一处**：
 *              实测 `utils/noteSectionModel.buildSections` 的 `groupFilter` 只决定
 *              「未分组」组头是否常驻（不删条目），`components/NoteListBody` 只把它用于
 *              组头 `active` 态 ⇒ 列表条目数完全由页面传下去的 `visibleNotes` 决定。
 * @ai-context: 夹具为什么必须给两个组——`treeMode`（无关键词/无标签/默认排序）为真时
 *              `buildSections` **按组建节**，组不在 `list_note_groups` 里的笔记整节不渲染
 *              ⇒ 只给笔记不给组会让两条判据同时失真（空真）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Note, NoteGroup } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmMock }));
// EnrichPanel 挂载期 useAiTaskPolling 会 listen 事件——mock 返回解绑函数
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import NotesPage from "./NotesPage";

const noteIn = (id: number, title: string, groupId: number | null): Note => ({
  id, title, content: "正文", source: "manual", tags: "[]", properties: null,
  pin: 0, group_id: groupId, created_at: 1, updated_at: 2,
});

const mkGroup = (id: number, name: string): NoteGroup => ({
  id, name, terrain: "container", kind: "topic", domainTag: null, source: "manual",
  seriesKey: null, routeReason: null, routeOverridden: 0, color: null, noteCount: 1, createdAt: 1, updatedAt: 2,
});

/** 夹具：两条笔记分属两个组（组表必须同时给出两组，见文件头第三条 @ai-context） */
const NOTES = [noteIn(1, "组7笔记", 7), noteIn(2, "组8笔记", 8)];
const GROUPS = [mkGroup(7, "第七组"), mkGroup(8, "第八组")];

describe("NotesPage 组过滤接线（批 5 T4 收口：派生搬走后页面实参确被用上）", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    confirmMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_notes":
        case "search_notes":
          return NOTES;
        case "list_note_groups":
          return GROUPS;
        case "list_fragments":
          return [];
        case "get_feature_flags":
          return { feedCapture: true };
        default:
          // 子面板（EnrichPanel/VersionPanel/NoteLinkToSystem 等）挂载期查询——空值兜底不抛错
          if (cmd === "note_versions_list") return [];
          if (cmd === "note_versions_usage") return [];
          if (cmd === "list_knowledge_systems") return [];
          if (cmd === "list_knowledge_links") return [];
          if (cmd === "list_tag_colors") return [];
          if (cmd === "list_links_by_target") return [];
          return null;
      }
    });
  });

  afterEach(() => cleanup());

  it("注入 focusGroupId=7 ⇒ 列表只渲染第 7 组条目（页面把 groupFilter 真的接进派生）", async () => {
    render(<NotesPage focusGroupId={7} />);
    expect(await screen.findByText("组7笔记")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("组8笔记")).toBeNull());
  });

  it("反向对照：不注入 ⇒ 两条都渲染（排除「夹具本来就只有一条」的空真）", async () => {
    render(<NotesPage />);
    expect(await screen.findByText("组7笔记")).toBeTruthy();
    expect(await screen.findByText("组8笔记")).toBeTruthy();
  });
});
