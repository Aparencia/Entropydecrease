// @vitest-environment jsdom
/**
 * NoteCardFlowWithSeek.test.tsx — 卡片流那条链的 `[[ts:ms]]` 带毫秒跳转（批 7 T17 · C10.3 的第三缺口）。
 *
 * @ai_context 判据三条：
 *   ① **带 ms 分支**：注入 `onOpenSessionAt` ⇒ 点芯片收到 `(note.session_id, ms)`，**且**芯片自己的
 *      单参兜底分支**不被调**（捕获阶段 `stopPropagation` 生效 ⇒ 不产生第二次导航）。
 *   ② **缺省兜底一字不变**：不注入 ⇒ 芯片走既有 `onOpenSession(sessionId)`（卡片流今天的形态）。
 *   ③ **声明的 DOM 变化**：React 侧芯片带上与串渲染链**同名**的 `data-ts-ms`（§C37.1/Y9 的授权改动；
 *      本任务的 DOM 对拍里逐字登记为「有意的、已声明的改动」）。
 * 边界：只判**这一条链的接线与点击**；`NoteCardFlowView` 的卡片渲染语义归 `views/note/noteViews.test.tsx`，
 *   `NoteMarkdown` 的 urlTransform 归 `components/NoteMarkdown.test.tsx`。
 * 副作用：只挂 React 树；`resolve_note_image` 等 IPC 一律 mock。
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../types";
import NoteCardFlowWithSeek from "./NoteCardFlowWithSeek";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));

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

const CHIP_MD = "跳转 [⏱ 00:05]([[ts:5000]]) 处";
const noop = (): void => {};

/** 渲染包装件（真 `NoteCardFlowView` → 真 `NoteMarkdown` → 真芯片） */
function mount(onOpenSession?: (id: number) => void, onOpenSessionAt?: (id: number, ms: number) => void) {
  return render(
    <NoteCardFlowWithSeek
      note={note(CHIP_MD)}
      onTaskToggle={noop}
      onOpenSession={onOpenSession}
      onImageOpen={noop}
      onOpenSessionAt={onOpenSessionAt}
    />,
  );
}

const chipOf = async (c: HTMLElement): Promise<HTMLElement> =>
  waitFor(() => {
    const el = c.querySelector<HTMLElement>("[data-ts-ms]");
    expect(el, "芯片未渲染（markdown 链没走到时间码锚点）").toBeTruthy();
    return el as HTMLElement;
  }, { timeout: 10000 });

afterEach(() => cleanup());

describe("NoteCardFlowWithSeek（T17 · C10.3 的第三缺口）", () => {
  it("① 注入 onOpenSessionAt ⇒ 点芯片收到 (sessionId, ms)，且单参兜底分支不被调", async () => {
    const plain = vi.fn();
    const at = vi.fn();
    const { container } = mount(plain, at);
    const chip = await chipOf(container);
    expect(chip.getAttribute("data-ts-ms")).toBe("5000");
    fireEvent.click(chip);
    expect(at, "卡片流那条链仍未把 ms 传出去（第三缺口未闭合）").toHaveBeenCalledWith(42, 5000);
    expect(at).toHaveBeenCalledTimes(1);
    expect(plain, "芯片自己的单参分支也跑了 ⇒ 一次点击导航两次（捕获阶段没拦住）").not.toHaveBeenCalled();
  });

  it("② 缺省（不注入）⇒ 芯片走既有单参回调（卡片流今天的语义一字不变）", async () => {
    const plain = vi.fn();
    const { container } = mount(plain);
    fireEvent.click(await chipOf(container));
    expect(plain, "缺省路径必须与今天逐字相同").toHaveBeenCalledWith(42);
    expect(plain).toHaveBeenCalledTimes(1);
  });

  it("③ 声明的 DOM 变化：React 侧芯片带与串渲染链同名的 data-ts-ms（+ 卡片流仍在包装层内）", async () => {
    const { container } = mount();
    const chip = await chipOf(container);
    // 属性面：T17 只**新增**这一个 marker（未给芯片本体加 role/tabindex/cursor ⇒ D1 的属性表断言不变）
    expect([chip.tagName, chip.getAttribute("data-ts-ms"), chip.getAttribute("title")])
      .toEqual(["SPAN", "5000", "⏱ 跳转到会话 0:05 处 —— 点击查看视频对应片段"]);
    // 卡片流本体仍在（包装件只加一层无样式委托层，不改卡片渲染）
    expect(screen.getByTestId("note-card-flow"), "包装件把卡片流本体吞掉了").toBeTruthy();
  });
});
