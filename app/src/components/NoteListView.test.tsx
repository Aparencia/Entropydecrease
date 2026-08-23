// @vitest-environment jsdom
/**
 * NoteListView.test.tsx — 笔记列表勾选批量删除交互测试（v0.12.8 审查补测）。
 *
 * @ai-context: 覆盖关键路径——行勾选出现批量栏 / 全选三态 / 删除执行后清空勾选
 *              （resolve=true）/ 取消确认保留勾选（resolve=false）/ 列表数据变化
 *              后裁剪不可见勾选（只删可见子集安全边界）。纯 UI 组件无 invoke。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Note } from "../types";
import NoteListView from "./NoteListView";

function makeNote(id: number, title: string): Note {
  return {
    id,
    title,
    content: "",
    source: "manual",
    tags: "[]",
    pin: 0,
    created_at: 0,
    updated_at: 0,
  };
}

const notesA = [makeNote(1, "笔记一"), makeNote(2, "笔记二")];

const baseProps = {
  keyword: "",
  tagFilter: null,
  sortMode: "updated-desc" as const,
  allTags: [] as string[],
  selectedId: null,
  status: "",
  onKeywordChange: vi.fn(),
  onTagFilterChange: vi.fn(),
  onSortModeChange: vi.fn(),
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  onRefresh: vi.fn(),
  onOpenSession: vi.fn(),
};

function renderList(overrides: Partial<Parameters<typeof NoteListView>[0]> = {}) {
  return render(<NoteListView notes={notesA} {...baseProps} onBatchDelete={vi.fn().mockResolvedValue(true)} {...overrides} />);
}

afterEach(() => cleanup());

describe("NoteListView 勾选批量删除", () => {
  it("行勾选后出现批量栏，计数正确（Arrange/Act/Assert）", () => {
    renderList();
    expect(screen.queryByText(/已选/)).toBeNull(); // 初始无批量栏
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText(/已选 1 个/)).toBeTruthy();
  });

  it("全选框三态：勾一后全选，再点全选清空", () => {
    renderList();
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // 勾 1 行 → 批量栏出现
    const selectAll = screen.getByTitle("全选当前列表的笔记");
    expect((selectAll as HTMLInputElement).checked).toBe(false);
    fireEvent.click(selectAll); // 未全选 → 全选
    expect(screen.getByText(/已选 2 个/)).toBeTruthy();
    fireEvent.click(screen.getByTitle("全选当前列表的笔记")); // 已全选 → 清空
    expect(screen.queryByText(/已选/)).toBeNull();
  });

  it("删除执行成功（resolve=true）后清空勾选", async () => {
    const onBatchDelete = vi.fn().mockResolvedValue(true);
    renderList({ onBatchDelete });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByText("批量删除"));
    expect(onBatchDelete).toHaveBeenCalledWith([1]);
    await vi.waitFor(() => expect(screen.queryByText(/已选/)).toBeNull());
  });

  it("取消确认（resolve=false）保留勾选", async () => {
    const onBatchDelete = vi.fn().mockResolvedValue(false);
    renderList({ onBatchDelete });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByText("批量删除"));
    await vi.waitFor(() => expect(onBatchDelete).toHaveBeenCalled());
    expect(screen.getByText(/已选 1 个/)).toBeTruthy();
  });

  it("列表数据变化后裁剪不可见勾选（只删可见子集）", async () => {
    const { rerender } = renderList();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByText(/已选 2 个/)).toBeTruthy();
    // 模拟切过滤视图/删除刷新：notes 只剩 1 条 → 勾选裁剪到可见子集
    const onBatchDelete = vi.fn().mockResolvedValue(true);
    rerender(<NoteListView notes={[makeNote(1, "笔记一")]} {...baseProps} onBatchDelete={onBatchDelete} />);
    expect(screen.getByText(/已选 1 个/)).toBeTruthy();
    fireEvent.click(screen.getByText("批量删除"));
    expect(onBatchDelete).toHaveBeenCalledWith([1]); // 被裁剪的不可见笔记不在删除集
  });
});
