// @vitest-environment jsdom
/**
 * NoteMarkdown.test.tsx — 换行语义锁定（v0.15 remark-breaks）。
 *
 * @ai-context: 修复"编辑态换行、阅读态连上"——单换行（软换行）必须渲染为 <br>；
 *              段落分隔（\n\n）仍是两段不产生 <br>；`\` 强断行语义保留。
 *              锁契约防未来 remark 插件顺序回归。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Note } from "../types";
import NoteMarkdown from "./NoteMarkdown";

const note = (content: string): Note => ({
  id: 1,
  title: "标题",
  content,
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

const renderMd = (content: string) =>
  render(
    <NoteMarkdown
      note={note(content)}
      searchQuery=""
      onTaskToggle={noop}
      onImageOpen={noop}
    />,
  );

afterEach(() => cleanup());

describe("NoteMarkdown 换行语义（v0.15 remark-breaks）", () => {
  it("单换行渲染为 <br>（软换行=所见即所得）", () => {
    const { container } = renderMd("第一行\n第二行");
    expect(container.querySelector("br")).toBeTruthy();
    expect(container.textContent).toContain("第一行");
    expect(container.textContent).toContain("第二行");
  });

  it("段落分隔（空行）不产生 <br>，渲染为两个段落", () => {
    const { container } = renderMd("甲段\n\n乙段");
    expect(container.querySelector("br")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("反斜杠强断行保留为 <br>", () => {
    const { container } = renderMd("第一行\\\n第二行");
    expect(container.querySelector("br")).toBeTruthy();
  });

  it("列表项内单换行同样断行（符合直观）", () => {
    const { container } = renderMd("- 项一\n续行内容");
    const li = container.querySelector("li");
    expect(li).toBeTruthy();
    // br 打断文本节点——按整段文本断言（queryByText 全文匹配对打断文本失效）
    expect((li as HTMLElement).textContent).toContain("续行内容");
    expect((li as HTMLElement).querySelector("br")).toBeTruthy();
  });
});
