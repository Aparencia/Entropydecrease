// @vitest-environment jsdom
/**
 * @ai-context 大纲列接线守卫（批 3 T8 / 规格 §6.2「大纲列 180/140/260 · 1280 · **接线**
 *              拖拽+记忆或删钩子（现为「假可调」）」+ 审计 J1-6 假可调 / J1-3 折叠死局）。
 *
 * Why 用**真执行器 + 真注册表规格**（不是给组件塞假 props）：本文件要证的正是「页面那句
 *   `useColumnLayout("notes-outline", columnSpec("notes-outline"))` 的结果真的走到了 DOM」——
 *   用假 props 只能证明组件认这个 prop，证不了接线。故 Harness 逐字复刻页面形态。
 *
 * 判据（每条都配了能红的变异体，见 task-8-report §变异体实测）：
 *   ① localStorage 里记的列宽 → 渲染宽度（旧实现写死 180 ⇒ 记忆无效 ⇒ 红）；
 *   ② 未记忆时 = 注册表默认 180（零视觉变化）；
 *   ③ 窄窗自动折叠下点窄条能展开（J1-3 死局：旧实现只翻 manualFolded ⇒ 红）；
 *   ④ 展开态的 ✕「收起大纲」仍能折叠（若把 onToggleOutline 一刀切成 expand() ⇒ 红）；
 *   ⑤ 拖拽手柄在大纲列上（条件之外，折叠态也在）。
 *
 * 边界：jsdom 不排版——本文件只判 `style.width` 与元素有无，**不判像素**（像素归 T14 探针）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import type { Note } from "../../types";
import type { NoteEditHandle } from "../NoteEditView";
import { useColumnLayout } from "../../hooks/useColumnLayout";
import { columnSpec } from "../../shell/columnRegistry";
import NoteReadingView from "../NoteReadingView";
import NotesReadingColumn from "./NotesReadingColumn";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const note: Note = {
  id: 1,
  title: "标题",
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
};

const noop = vi.fn();

/** 页面形态的宿主：真 hook + 真注册表规格（= NotesPage.tsx 的那一行） */
function Harness() {
  const outlineCol = useColumnLayout("notes-outline", columnSpec("notes-outline"));
  const editorRef = useRef<NoteEditHandle | null>(null);
  return (
    <NotesReadingColumn
      selected={note}
      editing={false}
      setEditing={noop}
      readerSearch={null}
      noteColors={{}}
      groups={[]}
      editorRef={editorRef}
      outlineCol={outlineCol}
      onChanged={noop}
      onError={noop}
      onOpenAi={noop}
      onOpenModelCard={noop}
      onSelectionAction={noop}
      onPinToggle={noop}
      onDelete={noop}
      onTaskToggle={noop}
      onTagClick={noop}
      onImageOpen={noop}
      onCleanNotice={noop}
    />
  );
}

/** 大纲列渲染宽度（jsdom 不排版，读 inline style） */
const outlineWidth = () => (screen.getByTestId("outline-panel") as HTMLElement).style.width;

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
  window.localStorage.clear();
  // 规格 §1 决策 17 默认窗宽 1280；大纲列阈值 = 1280 ⇒ `1280 < 1280` 为假 ⇒ 不自动折叠。
  // 显式声明视口（jsdom 默认 1024 会让大纲列静默折叠——本仓既有先例 SelectionActionMenu.test.tsx）
  window.innerWidth = 1280;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.innerWidth = 1024;
});

describe("大纲列接线（批 3 T8）", () => {
  it("① 宽度来自执行器的记忆值（此前组件写死 180 ⇒ 记忆永不生效）", async () => {
    window.localStorage.setItem("layout:col-width:notes-outline", "240");
    render(<Harness />);
    expect(await screen.findByTestId("outline-panel")).toBeTruthy();
    expect(outlineWidth()).toBe("240px");
  });

  it("② 未记忆时 = 注册表默认 180（规格默认值经 hook 走到 DOM）", async () => {
    render(<Harness />);
    expect(await screen.findByTestId("outline-panel")).toBeTruthy();
    expect(outlineWidth()).toBe("180px");
  });

  it("②b 组件自身缺省也来自注册表（不传 outlineWidth 时 = 180px）", async () => {
    // 期望值刻意写**字面** "180px"（不写成 `${columnSpec(...).default}px` ——
    // 那样等于拿注册表和它自己比，判据会退化成同义反复、永远绿）
    render(
      <NoteReadingView
        note={note}
        editing={false}
        onEdit={noop} onPinToggle={noop} onDelete={noop} onTagClick={noop}
        onOpenSession={noop} onTaskToggle={noop} onImageOpen={noop}
      />,
    );
    expect(await screen.findByTestId("outline-panel")).toBeTruthy();
    expect(outlineWidth()).toBe("180px");
  });

  it("③ J1-3：窄窗自动折叠下点窄条可展开（旧实现只翻手动折叠 ⇒ 死局）", async () => {
    window.innerWidth = 1024; // < 1280 ⇒ 自动折叠
    render(<Harness />);
    const bar = await screen.findByTestId("column-bar");
    expect(screen.queryByTestId("outline-panel")).toBeNull();
    fireEvent.click(bar);
    // expand() 同时清自动/手动折叠态 ⇒ 窄窗下也真的展开
    expect(await screen.findByTestId("outline-panel")).toBeTruthy();
    expect(screen.queryByTestId("column-bar")).toBeNull();
  });

  it("④ 展开态的 ✕「收起大纲」仍折叠（收起语义不许被 expand() 取代）", async () => {
    render(<Harness />);
    expect(await screen.findByTestId("outline-panel")).toBeTruthy();
    fireEvent.click(screen.getByTitle("收起大纲"));
    expect(await screen.findByTestId("column-bar")).toBeTruthy();
    expect(screen.queryByTestId("outline-panel")).toBeNull();
  });

  it("⑤ 拖拽手柄接在大纲列上（与其它列同款：在折叠三元之外，折叠态也在）", async () => {
    render(<Harness />);
    expect(await screen.findByTestId("outline-panel")).toBeTruthy();
    expect(screen.getByTestId("column-resizer")).toBeTruthy();
    fireEvent.click(screen.getByTitle("收起大纲"));
    expect(await screen.findByTestId("column-bar")).toBeTruthy();
    expect(screen.getByTestId("column-resizer")).toBeTruthy();
  });
});
