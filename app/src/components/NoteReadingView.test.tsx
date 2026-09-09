// @vitest-environment jsdom
/**
 * NoteReadingView.test.tsx — 标题栏扩展插槽 headerExtra（v0.13.7 触点②）。
 *
 * @ai-context: 覆盖标题栏插槽契约——headerExtra 渲染于「编辑」与「删除」之间，
 *              且未传时不渲染（回归：既有标题栏按钮布局不受影响）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Note } from "../types";
import NoteReadingView from "./NoteReadingView";

const baseNote = (): Note => ({
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
});

const noop = vi.fn();

const renderView = (headerExtra?: React.ReactNode) =>
  render(
    <NoteReadingView
      note={baseNote()}
      editing={false}
      headerExtra={headerExtra}
      onEdit={noop}
      onPinToggle={noop}
      onDelete={noop}
      onTagClick={noop}
      onOpenSession={noop}
      onTaskToggle={noop}
      onImageOpen={noop}
    />,
  );

afterEach(() => cleanup());

describe("NoteReadingView 标题栏扩展插槽", () => {
  it("headerExtra 渲染于「删除」按钮之前", () => {
    renderView(<span data-testid="header-extra">🧭 挂到体系</span>);
    const extra = screen.getByTestId("header-extra");
    expect(extra).toBeTruthy();
    // 位置契约：extra 在编辑按钮之后、删除按钮之前
    const editBtn = screen.getByRole("button", { name: /编辑/ });
    const delBtn = screen.getByRole("button", { name: "删除" });
    const posOf = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(posOf(editBtn, extra)).toBeTruthy();
    expect(posOf(extra, delBtn)).toBeTruthy();
  });

  it("未传 headerExtra 时标题栏正常渲染（回归）", () => {
    renderView(undefined);
    expect(screen.getByRole("button", { name: /编辑/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "删除" })).toBeTruthy();
    // 置顶按钮内容为 📌（title=「置顶」是可访问名称兜底——REQ-315 措辞统一）
    expect(screen.getByRole("button", { name: "📌" })).toBeTruthy();
  });
});

describe("阅读态正文选区右键菜单（批 8 REQ-317）", () => {
  const renderSel = (extraProps: Partial<React.ComponentProps<typeof NoteReadingView>>) =>
    render(
      <NoteReadingView
        note={baseNote()}
        editing={false}
        onEdit={noop}
        onPinToggle={noop}
        onDelete={noop}
        onTagClick={noop}
        onOpenSession={noop}
        onTaskToggle={noop}
        onImageOpen={noop}
        {...extraProps}
      />,
    );

  it("空选区右键不弹菜单（维持现状静默基线）", () => {
    renderSel({});
    const body = document.querySelector("[data-note-read-body]");
    fireEvent.contextMenu(body!, { clientX: 60, clientY: 60 });
    expect(screen.queryByTestId("note-sel-menu")).toBeNull();
  });

  it("正文内选区右键 → 阅读态菜单（无加入行动项），转问题上抛快照文本", () => {
    const onSelectionAction = vi.fn();
    renderSel({ onSelectionAction });
    const body = document.querySelector("[data-note-read-body]");
    expect(body).toBeTruthy();
    const para = body!.querySelector("p");
    expect(para).toBeTruthy();
    // jsdom 无真实 Selection——用形状桩替 window.getSelection（handler 只读
    // isCollapsed/rangeCount/锚焦/toString，锚=正文容器内段落文本节点）
    const selStub = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: para!.firstChild,
      focusNode: para!.firstChild,
      toString: () => "选中段落文本",
    };
    vi.spyOn(window, "getSelection").mockReturnValue(selStub as unknown as Selection);
    fireEvent.contextMenu(para!, { clientX: 80, clientY: 80 });
    expect(screen.getByTestId("note-sel-menu")).toBeTruthy();
    expect(screen.getByTestId("note-sel-copy")).toBeTruthy();
    expect(screen.queryByTestId("note-sel-addTask")).toBeNull(); // 阅读态 V1 隐藏
    fireEvent.click(screen.getByTestId("note-sel-toQuestion"));
    expect(onSelectionAction).toHaveBeenCalledWith("toQuestion", "选中段落文本");
  });
});
