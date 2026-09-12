// @vitest-environment jsdom
/**
 * NoteMarkdown.test.tsx — 换行语义锁定（v0.15 remark-breaks）+ 荧光笔渲染链
 * （v0.16.1 多色 + hName 修复）。
 *
 * @ai-context: 修复"编辑态换行、阅读态连上"——单换行（软换行）必须渲染为 <br>；
 *              段落分隔（\n\n）仍是两段不产生 <br>；`\` 强断行语义保留。
 *              锁契约防未来 remark 插件顺序回归。
 * @ai-context: v0.16.1——==[red]重点== 渲染 <mark class="note-mark note-mark-red">；
 *              ==默认== 渲染 <mark class="note-mark">（插件 hName 修复：原落 div，
 *              components.mark 按 hast tagName 匹配实际从未命中=无样式）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

  it("==[red]重点== 渲染 <mark class=note-mark note-mark-red>（v0.16.1 多色）", () => {
    const { container } = renderMd("==[red]重点==");
    const m = container.querySelector("mark.note-mark.note-mark-red");
    expect(m).toBeTruthy();
    expect(m?.textContent).toBe("重点");
  });

  it("==默认== 渲染 <mark class=note-mark>（v0.16.1 hName 修复——原落 div 无样式）", () => {
    const { container } = renderMd("==默认==");
    const m = container.querySelector("mark.note-mark");
    expect(m).toBeTruthy();
    expect(m?.textContent).toBe("默认");
    // 除 mark 外无其他元素（不落 div 容器）
    expect(container.querySelector("div")).toBeNull();
  });
});

/**
 * 批 6 T26 —— `[[ts:ms]]` 回链**把 ms 接上**（R5.5 顺带④：今天 ms 只进 `title` 文案、`onClick` 丢弃它只跳会话）。
 *
 * @ai-context 判据锚点 = 回链芯片（`span[title*="跳转到会话"]`，title 文案本任务**一字未改**）。
 *              四条各自独立：①带 ms 分支的调用次数+实参（两分支互斥）②缺省退回既有单参回调
 *              ③四个边界值的 ms **逐字**（不得按秒截断）④普通链接不受影响（反例守卫）。
 *              诚实边界：这里只证明 **ms 被传出本组件**；「到会话页后播放头真的跳」不在此判据面内。
 */
describe("NoteMarkdown [[ts:ms]] 接上毫秒（批 6 T26）", () => {
  /** 回链芯片（title 文案是它的既有锚点；本任务未改文案） */
  const chipOf = (container: HTMLElement): HTMLElement => {
    const el = container.querySelector<HTMLElement>('span[title*="跳转到会话"]');
    expect(el, "回链芯片未渲染").toBeTruthy();
    return el as HTMLElement;
  };

  it("① 点击回链 ⇒ onOpenSessionAt 恰一次收到 (sessionId, ms)，且不再走单参回调", () => {
    const at = vi.fn();
    const plain = vi.fn();
    const { container } = render(
      <NoteMarkdown note={note("跳转 [⏱ 00:52]([[ts:52500]]) 处")} searchQuery="" onTaskToggle={noop} onOpenSession={plain} onOpenSessionAt={at} onImageOpen={noop} />,
    );

    fireEvent.click(chipOf(container));

    expect(at).toHaveBeenCalledTimes(1);
    expect(at).toHaveBeenCalledWith(42, 52_500);
    expect(plain, "两分支必须互斥：带 ms 分支命中时不得再调单参回调（会重复导航）").toHaveBeenCalledTimes(0);
  });

  it("② 不传 onOpenSessionAt ⇒ 仍调既有 onOpenSession(sessionId)（向后兼容一字不变）", () => {
    const plain = vi.fn();
    const { container } = render(
      <NoteMarkdown note={note("跳转 [⏱ 00:52]([[ts:52500]]) 处")} searchQuery="" onTaskToggle={noop} onOpenSession={plain} onImageOpen={noop} />,
    );

    fireEvent.click(chipOf(container));

    expect(plain).toHaveBeenCalledTimes(1);
    expect(plain).toHaveBeenCalledWith(42);
  });

  it("③ 四个边界值 ⇒ ms 逐字传出（不得经 sec*1000 / 按秒截断）", () => {
    for (const ms of [0, 1, 59_999, 3_600_000]) {
      const at = vi.fn();
      const view = render(
        <NoteMarkdown note={note(`跳转 [⏱ t]([[ts:${ms}]]) 处`)} searchQuery="" onTaskToggle={noop} onOpenSessionAt={at} onImageOpen={noop} />,
      );
      fireEvent.click(chipOf(view.container));
      expect(at, `[[ts:${ms}]] 的 ms 未逐字传出`).toHaveBeenCalledWith(42, ms);
      view.unmount();
    }
  });

  it("④ 普通链接不受影响：hash/https 仍渲染 <a href>、javascript: 仍被清空，点击不触发会话回调", () => {
    const at = vi.fn();
    const plain = vi.fn();
    const { container } = render(
      <NoteMarkdown note={note("[本页](#section) [外链](https://example.com) [坏](javascript:alert(1))")} searchQuery="" onTaskToggle={noop} onOpenSession={plain} onOpenSessionAt={at} onImageOpen={noop} />,
    );
    const anchors = [...container.querySelectorAll("a")];
    // 两侧自证：普通 URL 逐字保留（https）· 危险协议仍被默认消毒器清空（T26 只放行 `[[ts:ms]]` 一种形态）
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(["#section", "https://example.com", ""]);
    expect(container.querySelectorAll('span[title*="跳转到会话"]'), "普通链接被误渲染成回链芯片").toHaveLength(0);

    fireEvent.click(anchors[0]); // 同页 hash（jsdom 里外链点击会打印 navigation 未实现告警，噪声无益）

    expect(at).toHaveBeenCalledTimes(0);
    expect(plain).toHaveBeenCalledTimes(0);
  });
});
