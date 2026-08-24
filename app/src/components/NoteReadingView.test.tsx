// @vitest-environment jsdom
/**
 * NoteReadingView.test.tsx — 标题栏扩展插槽 headerExtra（v0.13.7 触点②）。
 *
 * @ai-context: 覆盖标题栏插槽契约——headerExtra 渲染于「编辑」与「删除」之间，
 *              且未传时不渲染（回归：既有标题栏按钮布局不受影响）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    // 固定按钮内容为 📌（title=「固定」是可访问名称兜底）
    expect(screen.getByRole("button", { name: "📌" })).toBeTruthy();
  });
});
