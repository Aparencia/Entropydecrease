// @vitest-environment jsdom
/**
 * CitationChips.test.tsx — 学习库引用卡片（v0.19.1 REQ-260）。AAA 模式。
 *
 * @ai-context: 覆盖契约——① 命中渲染（笔记/碎片标签）；② 点击笔记卡片 →
 *              携带首个命中词（open + search）；③ 碎片不可点（仅展示）；
 *              ④ 空命中不渲染。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CitationChips from "./CitationChips";
import type { KbHit } from "../types";

const noteHit: KbHit = {
  chunkId: 1,
  sourceKind: "note",
  noteId: 7,
  fragmentId: null,
  noteTitle: "眼影入门",
  groupName: null,
  heading: "晕染手法",
  snippet: "…手法的==少量多次==要点…",
  scoreKind: "fts",
};

const fragHit: KbHit = { ...noteHit, chunkId: 2, sourceKind: "fragment", fragmentId: 9, noteId: null, noteTitle: null, heading: null };

afterEach(cleanup);

describe("CitationChips", () => {
  it("渲染笔记与碎片引用（标签含节标题/组名）", () => {
    // Arrange
    const frag = { ...fragHit, groupName: "化妆课" };
    // Act
    render(<CitationChips hits={[noteHit, frag]} onOpenNote={vi.fn()} />);
    // Assert
    expect(screen.getByText(/眼影入门 · 晕染手法/)).toBeTruthy();
    expect(screen.getByText(/碎片（化妆课）/)).toBeTruthy();
    expect(screen.getByTestId("citation-1")).toBeTruthy();
    expect(screen.getByTestId("citation-2")).toBeTruthy();
  });

  it("点击笔记卡片 → 以首个命中词打开（mock 跳转）", () => {
    // Arrange
    const onOpenNote = vi.fn();
    render(<CitationChips hits={[noteHit]} onOpenNote={onOpenNote} />);
    // Act
    fireEvent.click(screen.getByTestId("citation-1"));
    // Assert（noteId + 首个 ==词== → 笔记阅读搜索）
    expect(onOpenNote).toHaveBeenCalledWith(7, "少量多次");
  });

  it("碎片卡片不可点（无跳转目标——仅展示素材）", () => {
    // Arrange
    const onOpenNote = vi.fn();
    render(<CitationChips hits={[fragHit]} onOpenNote={onOpenNote} />);
    // Act
    const btn = screen.getByTestId("citation-2") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    // Assert
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it("空命中不渲染（引用区零噪音）", () => {
    // Arrange/Act
    const { container } = render(<CitationChips hits={[]} onOpenNote={vi.fn()} />);
    // Assert
    expect(container.querySelector('[data-testid="citation-chips"]')).toBeNull();
  });
});
