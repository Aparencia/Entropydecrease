// @vitest-environment jsdom
/**
 * @ai-context ⌘K 面板的 **T12 独立评审 follow-up 判据**（I-1 合并语义 + I-2 如实计数）。
 *
 * Why 单独立文件：`CommandPalette.kb.test.tsx`（T12 交付的接线守卫）**182 行 / 计划上限 200**，
 *   这几条判据塞不下；且它们判的是**评审之后才裁决的语义**（控制方 2026-09-12 裁决 B），与 T12
 *   交付时的 ①–⑤ 分开记更好归因。⇒ T12 与 T11 的两个既有测试文件**零改动**（既有断言不许改）。
 *
 * 判据（每条各自有变异体，实测见 `task-t12-followups-report.md` §变异体）：
 *   ⑥ I-1：**有命中时页面命令恒在**（输入只命中学习库、不命中页面名的词 ⇒ 9 条页面命令一条不少）；
 *   ⑦ I-2：命中里**无跳转目标**的条数如实说出来，**不谎报**「没有匹配的命令」；
 *   ⑧ 回归护栏：**零命中且不匹配页面名**时**空态仍出现**（T11 `CommandPalette.test.tsx:103` 的语义，
 *      裁决 B 不许把它顺手破坏）。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KbHit } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { CommandPalette } from "./CommandPalette";
import { KB_SEARCH_DEBOUNCE_MS } from "./kbCommands";
import { ALL_ENTRIES } from "./navRegistry";

const noteHit: KbHit = {
  chunkId: 7, sourceKind: "note", noteId: 42, fragmentId: null, noteTitle: "眼影入门",
  groupName: "化妆课", heading: "晕染手法", snippet: "先取粉再==少量多次==地上色", scoreKind: "fts",
};

/** 推进防抖窗 + 冲洗 IPC 的 promise 链（两个 `act`：先跑定时器，再等微任务） */
async function afterDebounce() {
  await act(async () => { vi.advanceTimersByTime(KB_SEARCH_DEBOUNCE_MS); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]); // 默认：零命中（阴性基线）
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("⑥ I-1：有命中时页面命令恒在（导航入口不得因检索而消失）", () => {
  it("查询「眼影」命中一条笔记 ⇒ 9 条页面命令全部仍在列表里", async () => {
    invokeMock.mockResolvedValueOnce([noteHit]);
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "眼影" } });
    await afterDebounce();
    expect(screen.getByTestId("command-hit:7"), "前提不成立：这次查询没有命中").toBeTruthy();
    const survived = ALL_ENTRIES.filter((e) => screen.queryByTestId(`command-page:${e.key}`) !== null).map((e) => e.key);
    expect(survived, "有命中时页面命令被查询词过滤掉了（9 条导航入口集体消失）").toEqual(ALL_ENTRIES.map((e) => e.key));
  });
});

describe("⑦ I-2：无跳转目标的命中如实说明（不许谎报「没有匹配的命令」）", () => {
  it("只有 fragment 命中 ⇒ 给出被跳过的条数、且不出现空态文案", async () => {
    // fragment = 无跳转页（`utils/kbHits.isNoteHit` 的既有口径，与 `CitationChips` 同款：不显示、不回调）
    invokeMock.mockResolvedValueOnce([{ ...noteHit, chunkId: 9, sourceKind: "fragment", fragmentId: 3, noteId: null }]);
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "素材词" } });
    await afterDebounce();
    expect(screen.queryByTestId("command-palette-empty"), "命中被静默丢弃后仍谎报「没有匹配的命令」").toBeNull();
    expect(screen.getByTestId("command-palette-skipped").textContent).toContain("另有 1 条无定位信息的命中");
  });

  it("有可跳命令时也如实报出条数，且不谎称「没有可打开的命令」", async () => {
    invokeMock.mockResolvedValueOnce([noteHit, { ...noteHit, chunkId: 9, sourceKind: "fragment", fragmentId: 3, noteId: null }]);
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "素材词" } });
    await afterDebounce();
    const note = screen.getByTestId("command-palette-skipped").textContent ?? "";
    expect(screen.getByTestId("command-hit:7"), "前提不成立：可跳的那条没上屏").toBeTruthy();
    expect(note, "列表里明明有可打开的命令，却报了「没有可打开的命令」").not.toContain("没有可打开的命令");
    expect(note).toContain("另有 1 条无定位信息的命中");
  });
});

describe("⑧ 回归护栏：零命中且不匹配页面名 ⇒ 空态仍出现（T11 :103 的语义）", () => {
  it("查询「zzz-不存在的命令」零命中 ⇒ 空态在（检索已返回后判，不是「还没查」的假绿）", async () => {
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "zzz-不存在的命令" } });
    await afterDebounce();
    expect(invokeMock, "检索还没返回 ⇒ 本判据测不到「零命中」那一支").toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("command-palette-empty")).toBeTruthy();
  });
});
