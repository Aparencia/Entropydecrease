// @vitest-environment jsdom
/**
 * @ai-context ⌘K 取样 hook 的**关闭路径守卫**（批 3 T12 独立评审 M-5 的 follow-up）。
 *
 * Why 单独立文件：M-5 的对象是 hook 自己（「面板关闭后，在飞的响应还会不会写状态」），而
 *   `CommandPalette.kb.test.tsx` 只从面板外面看它；那个文件 182 行、计划上限 200，hook 级判据塞不下。
 *
 * 判据：输入 → 派发查询（挂起）→ **立即关闭面板** → 迟到响应解析 ⇒ hook **不得**写结果状态。
 *   观测口径：关闭期间若真发生写入，React 会用新结果重渲染 ⇒ 探针在 `open=false` 的那一帧看见
 *   非空 `commands`（记进 `stray`）。② 是**阳性对照**：同一探针在面板仍打开时看得见结果 ——
 *   否则 ① 的「没写」可能只是「这条链路从来没取到过数」。
 *   ⚠️ 诚实声明：React 18 起「对已卸载组件 setState」不再告警，所以这里测的不是「会不会崩」，
 *   而是「关掉面板后有没有多出一份陈旧结果状态」（与评审 M-5 的原文口径一致）。
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KbHit } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { KB_SEARCH_DEBOUNCE_MS } from "./kbCommands";
import { useKbPaletteSearch } from "./useKbPaletteSearch";

const noteHit: KbHit = {
  chunkId: 7, sourceKind: "note", noteId: 42, fragmentId: null, noteTitle: "眼影入门",
  groupName: "化妆课", heading: "晕染手法", snippet: "先取粉再==少量多次==地上色", scoreKind: "fts",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

/** 最小载体（hook 不能脱离组件跑）：打开时看见的结果记进 `seen`，**关闭期间**看见的记进 `stray` */
function Probe({ open, stray, seen }: { open: boolean; stray: string[]; seen: string[] }) {
  const { commands } = useKbPaletteSearch(open, "眼影", () => {});
  const ids = commands.map((c) => c.id).join(",");
  if (open) seen.push(ids);
  else if (ids) stray.push(ids);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  invokeMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("M-5：关闭面板后不得再写结果状态", () => {
  it("① 输入 → 立即关闭 → 迟到响应解析 ⇒ 零写入（删掉清理函数里的 seq 递增 ⇒ 本判据变红）", async () => {
    const slow = deferred<KbHit[]>();
    invokeMock.mockImplementationOnce(() => slow.promise);
    const stray: string[] = [];
    const seen: string[] = [];
    const view = render(<Probe open stray={stray} seen={seen} />);
    await act(async () => { vi.advanceTimersByTime(KB_SEARCH_DEBOUNCE_MS); }); // 派发查询（挂起中）
    view.rerender(<Probe open={false} stray={stray} seen={seen} />); // 输入后立刻 Esc
    await act(async () => { slow.resolve([noteHit]); }); // 迟到响应此刻才回来
    await act(async () => { await Promise.resolve(); });
    expect(stray, "关闭后仍把在飞响应写进了状态（多一次渲染 + 一份陈旧结果集）").toEqual([]);
  });

  it("② 阳性对照：面板仍打开时同一条链路看得见结果（否则 ① 可能只是「从没取到数」）", async () => {
    invokeMock.mockResolvedValueOnce([noteHit]);
    const stray: string[] = [];
    const seen: string[] = [];
    render(<Probe open stray={stray} seen={seen} />);
    await act(async () => { vi.advanceTimersByTime(KB_SEARCH_DEBOUNCE_MS); });
    await act(async () => { await Promise.resolve(); });
    expect(seen).toContain("hit:7");
  });
});
