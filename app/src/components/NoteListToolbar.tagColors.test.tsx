// @vitest-environment jsdom
/**
 * NoteListToolbar 过滤芯片着色测试（批 7 T18；§C2.4 / §C11.3「做」的落点）。
 *
 * @ai-context: 判据 = 「过滤面板的芯片色与 `tag_colors` 一致」（§C2.4 逐字）—— 与 `NoteListRow`
 *   同口径（`paletteHex(id, theme) + "22"` 透明度后缀）。上色**只动 `background`**：本文件的
 *   `nativeButton 4 / 边框 3 / 越界圆角 2` 三格已满（§C9.12），判据见 `surfaceBaseline.ts`
 *   与 `nativeButtonBaseline.ts`（本件不做棘轮断言 —— 那是棘轮判据件的职责，重复一份会造两套口径）。
 * @ai-context: 具名断言的变量体 = 「删掉 toolbar 的 `tagColors` 透传」⇒ 有色芯片回落默认灰底，
 *   两条断言（等于查色值 / 不等于无色底）同时红。
 * @ai-context: ④ 覆盖**本任务新增的那一跳**（`NoteListView` → `NoteListToolbar` 的透传）——
 *   只测 toolbar 本体时，把 `NoteListView` 里的 `tagColors={tagColors}` 删掉是**测不出来的**
 *   （M3 实测：只测本体 ⇒ 变异体静默通过）⇒ 判据必须落在真实装配链上。
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types";
import { paletteHex } from "../utils/colorPalette";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import NoteListView from "./NoteListView";
import NoteListToolbar from "./NoteListToolbar";

afterEach(cleanup);

/**
 * `#RRGGBBAA` → jsdom（cssstyle）归一后的 `rgba(r, g, b, a)`。
 * Why 不写字面量：色板真源是 `paletteHex`（改真源时本判据应随之走，而不是留一个过期常量）。
 */
const asRgba = (hex8: string): string => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex8.slice(i, i + 2), 16));
  const alpha = Number((parseInt(hex8.slice(7, 9), 16) / 255).toFixed(3));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const baseProps = {  selectionMode: false,
  selectionCount: 0,
  onToggleBatchMode: () => {},
  onCreate: () => {},
  keyword: "",
  onKeywordChange: () => {},
  onRefresh: () => {},
  sortMode: "updated-desc" as const,
  onSortModeChange: () => {},
  allTags: ["化妆", "编程"],
  tagFilter: null,
  onTagFilterChange: () => {},
};

describe("NoteListToolbar 过滤芯片着色（批 7 T18 · §C11.3）", () => {
  it("① 有色芯片的底色 == paletteHex(查色表值) + 22（与 NoteListRow 同口径）", () => {
    // Arrange / Act
    render(<NoteListToolbar {...baseProps} tagColors={{ 化妆: "purple" }} />);
    // Assert
    const colored = screen.getByTestId("tag-chip-化妆");
    const plain = screen.getByTestId("tag-chip-编程");
    expect(colored.style.background, "有色芯片没取到查色表的值").toBe(asRgba(`${paletteHex("purple", "light")}22`));
    expect(colored.style.background, "有色芯片的底色不含色板 RGB（查色表取错了 id）").toContain("142, 78, 198");
    expect(plain.style.background, "无色芯片不该继承别人的色").not.toBe(colored.style.background);
  });

  it("② 缺省 tagColors ⇒ 沿用原底色（加法式改动，无查色表时行为不变）", () => {
    // Arrange / Act
    render(<NoteListToolbar {...baseProps} />);
    // Assert：与加了空表的渲染逐字一致
    const chip = screen.getByTestId("tag-chip-化妆");
    expect(chip.style.background).toBe("rgb(249, 250, 251)");
  });

  it("③ 选中态的边框/字色仍是原契约（上色不夺走选中态）", () => {
    // Arrange / Act
    render(<NoteListToolbar {...baseProps} tagFilter="化妆" tagColors={{ 化妆: "purple" }} />);
    // Assert
    const chip = screen.getByTestId("tag-chip-化妆");
    expect(chip.style.border).toContain("rgb(13, 148, 136)");
    expect(chip.style.color).toBe("rgb(13, 148, 136)");
  });
});

describe("NoteListView → NoteListToolbar 的查色表透传（批 7 T18 新增的那一跳）", () => {
  it("④ 经真实装配链传 tagColors ⇒ 过滤芯片取到色（删掉这一跳的变异体在这里红）", async () => {
    // Arrange：NoteListView 会拉序行（mock 返回空）；笔记带一个标签
    invokeMock.mockReset();
    invokeMock.mockImplementation(async () => []);
    const note: Note = {
      id: 1, title: "带标签的笔记", content: "", source: "manual", tags: JSON.stringify(["化妆"]),
      pin: 0, group_id: null, created_at: 0, updated_at: 0,
    };
    const listProps = {
      notes: [note], groups: [], groupFilter: null, keyword: "", tagFilter: null,
      sortMode: "updated-desc" as const, allTags: ["化妆"], selectedId: null, status: "",
      noteColors: {}, tagColors: { 化妆: "purple" },
      onKeywordChange: () => {}, onTagFilterChange: () => {}, onSortModeChange: () => {},
      onSelect: () => {}, onCreate: () => {}, onRefresh: () => {}, onOpenSession: () => {},
      onBatchDelete: async () => true,
    };
    // Act
    render(<NoteListView {...listProps} />);
    // Assert
    const chip = await screen.findByTestId("tag-chip-化妆");
    expect(chip.style.background, "NoteListView 没把查色表透到过滤面板").toBe(asRgba(`${paletteHex("purple", "light")}22`));
  });
});
