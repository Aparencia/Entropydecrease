// @vitest-environment jsdom
/**
 * useNotesDeepLink.test.ts — 批 5 T16（裁决 C6）的判据集：`focus*` 的**消费复位**契约。
 *
 * @ai-context: C6 只做**最小收敛**——给 5 个粘滞字段（`focusSessionId` / `focusNoteId` /
 *              `focusNoteSearch` / `focusSystemId` / `focusGroupId`）补 `onFocus*Consumed`
 *              复位，**声明形态与类型一字不动**（`CommandPalette.kb.test.tsx:173-181` 继续绿）。
 *              本文件判两件事：
 *                ① **行为**（hook 级，注入假 `notesApi`）：消费 ⇒ 回调恰一次 ⇒ App 置 null ⇒
 *                   **同目标再次跳转仍触发**（旧形态下固定值不产生 prop 变化 ⇒ effect 不重跑
 *                   ⇒ 深链静默失效——这是最小收敛修掉的真实缺陷）；
 *                ② **接线**（静态，读源码文本）：App 的三组复位 + 三页的消费点。**仪器局限**：
 *                   静态判据只能证明「写了」，运行期行为只有真机给证据 —— 与
 *                   `CommandPalette.kb.test.tsx` ⑤ 同款声明，口径也照它（读前剥块注释与整行 `//`）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types";
import type { NotesListData } from "./useNotesListData";
import { useNotesDeepLink } from "./useNotesDeepLink";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const HERE = dirname(fileURLToPath(import.meta.url));
/** 读源码的**只留代码**口径（与 `CommandPalette.kb.test.tsx` 的 APP_CODE 逐字同款） */
const codeOf = (rel: string) =>
  readFileSync(join(HERE, "..", rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const NOTE_42: Note = {
  id: 42, title: "眼影入门", content: "少量多次", source: "manual", tags: "[]", pin: 0,
  created_at: 1, updated_at: 2,
};

/** 深链只碰 `notesApi` 的 5 个成员（setKeyword/setTagFilter/setNotes/setStatus/seqRef）⇒ 注入最小假体 */
function makeNotesApi() {
  const seqRef = { current: 0 };
  const calls = {
    keyword: [] as string[], tagFilter: [] as (number | null)[], notes: [] as Note[][], status: [] as string[],
  };
  const api = {
    setKeyword: (v: string) => calls.keyword.push(v),
    setTagFilter: (v: number | null) => calls.tagFilter.push(v),
    setNotes: (rows: Note[]) => calls.notes.push(rows),
    setStatus: (s: string) => calls.status.push(s),
    seqRef,
  } as unknown as NotesListData;
  return { api, calls };
}

const noop = () => {};
/** 冲干 `invoke` 的 await 链（mock 立即 resolve；深链体内是 async IIFE ⇒ 多轮微任务） */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
});

describe("① 消费复位的行为契约（K2/K3；注入假 notesApi）", () => {
  it("K2 消费后归零：focusNoteId 有值 ⇒ 深链消费后 onConsumed **恰调用 1 次**（不是 0、不是 2）", async () => {
    const { api, calls } = makeNotesApi();
    const consumed = vi.fn();
    invokeMock.mockResolvedValue([NOTE_42]);
    renderHook(() => useNotesDeepLink({
      focusNoteId: 42, notesApi: api, setSelected: vi.fn(), setEditing: noop, setView: noop,
      setGroupFilter: noop, onConsumed: consumed,
    }));
    await settle();
    expect(consumed, "消费后没有回调 App 复位（字段粘滞）").toHaveBeenCalledTimes(1);
    // 同一轮里深链该做的事一件不少：清搜索/标签态 + 全量重载 + 注入列表
    expect(calls.keyword).toEqual([""]);
    expect(calls.tagFilter).toEqual([null]);
    expect(calls.notes).toEqual([[NOTE_42]]);
  });

  it("K3 连续两次跳**同一**笔记都能触发（旧形态：固定值粘滞 ⇒ 第二次静默失效）", async () => {
    const { api } = makeNotesApi();
    const setSelected = vi.fn();
    invokeMock.mockResolvedValue([NOTE_42]);
    const { result } = renderHook(() => {
      const [focusNoteId, setFocusNoteId] = useState<number | null>(null);
      useNotesDeepLink({
        focusNoteId, notesApi: api, setSelected, setEditing: noop, setView: noop, setGroupFilter: noop,
        onConsumed: () => setFocusNoteId(null), // App 侧同款：消费即复位
      });
      return { focusNoteId, jump: setFocusNoteId };
    });
    await act(async () => { result.current.jump(42); await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current.focusNoteId, "K2：消费后字段未归零").toBeNull();
    expect(setSelected).toHaveBeenCalledTimes(1);
    await act(async () => { result.current.jump(42); await new Promise((r) => setTimeout(r, 0)); });
    expect(setSelected, "K3：同目标第二次跳转没有重新消费").toHaveBeenCalledTimes(2);
    expect(setSelected).toHaveBeenLastCalledWith(NOTE_42);
  });

  it("K2 focusGroupId 走**同一个**复位回调：消费后字段归零，而组过滤态留在本页（复位不撤销过滤）", () => {
    const { api } = makeNotesApi();
    const consumed = vi.fn();
    const setGroupFilter = vi.fn();
    const { rerender } = renderHook(
      ({ gid }: { gid: number | null }) => useNotesDeepLink({
        focusGroupId: gid, notesApi: api, setSelected: noop, setEditing: noop, setView: noop,
        setGroupFilter, onConsumed: consumed,
      }),
      { initialProps: { gid: 7 as number | null } },
    );
    expect(setGroupFilter).toHaveBeenCalledWith(7);
    expect(consumed).toHaveBeenCalledTimes(1);
    rerender({ gid: null }); // App 侧复位
    expect(setGroupFilter, "复位把本页已应用的组过滤也撤销了").toHaveBeenCalledTimes(1);
    rerender({ gid: 7 }); // 同组再次跳转
    expect(consumed, "同组第二次跳转没有重新消费").toHaveBeenCalledTimes(2);
  });

  it("加载失败**同样**复位：否则陈旧值卡死同目标重试（同值 setState 无 prop 变化 ⇒ effect 不重跑）", async () => {
    const { api, calls } = makeNotesApi();
    const consumed = vi.fn();
    invokeMock.mockRejectedValue(new Error("db locked"));
    renderHook(() => useNotesDeepLink({
      focusNoteId: 42, notesApi: api, setSelected: vi.fn(), setEditing: noop, setView: noop,
      setGroupFilter: noop, onConsumed: consumed,
    }));
    await settle();
    expect(calls.status).toEqual(["加载失败: Error: db locked"]);
    expect(consumed).toHaveBeenCalledTimes(1);
  });
});

describe("② 注释与实现一致（K4）+ 行数红线镜像（K5）", () => {
  it("K4 `useNotesDeepLink.ts` 的 @ai-context 出现 onConsumed，且不再说「本页无回调」", () => {
    const src = readFileSync(join(HERE, "useNotesDeepLink.ts"), "utf8");
    const ctx = src.slice(0, src.indexOf("*/")); // 文件头 @ai-context 块
    expect(ctx).toContain("onConsumed");
    expect(ctx, "注释还在说清空责任在 App ⇒ 标签说谎（App 里没有该复位）").not.toContain("清空责任在 App");
    expect(ctx).not.toContain("本页无");
  });

  it("K5 `App.tsx` ≤600（**镜像**行数口径；权威读数 = `node scripts/line-limits.mjs --full`）", () => {
    const text = readFileSync(join(HERE, "..", "App.tsx"), "utf8");
    const lines = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    expect(lines, "App.tsx 越过 600 硬限（C6 逐字：不许登记豁免）").toBeLessThanOrEqual(600);
    expect(lines, "反空真：读到空文件/路径错时，上面那条会假绿").toBeGreaterThan(300);
  });
});

describe("③ 接线（App + 三页；静态判据，运行期证据归真机）", () => {
  const APP = codeOf("App.tsx");
  const SESSIONS = codeOf("pages/SessionsPage.tsx");
  const KNOWLEDGE = codeOf("pages/KnowledgePage.tsx");
  const NOTES = codeOf("pages/NotesPage.tsx");

  it("K2 接线：5 个粘滞字段在 App 侧各有一个复位（三组回调），三页都接上了消费点", () => {
    expect(APP, "focusSessionId 没有复位回调").toMatch(/onFocusSessionConsumed=\{\(\) => setFocusSessionId\(null\)\}/);
    expect(APP, "focusSystemId 没有复位回调").toMatch(/onFocusSystemConsumed=\{\(\) => setFocusSystemId\(null\)\}/);
    for (const f of ["focusNoteId", "focusNoteSearch", "focusGroupId"]) {
      const setter = `set${f[0].toUpperCase()}${f.slice(1)}`;
      expect(APP, `${f} 没有在 onFocusNoteConsumed 里复位`).toMatch(
        new RegExp(`onFocusNoteConsumed=\\{\\(\\) => \\{[^}]*${setter}\\(null\\)`),
      );
    }
    expect(SESSIONS, "SessionsPage 没有消费 focusSessionId").toMatch(/onFocusSessionConsumed\?\.\(\)/);
    expect(KNOWLEDGE, "KnowledgePage 没有消费 focusSystemId").toMatch(/onFocusSystemConsumed\?\.\(\)/);
    expect(NOTES, "NotesPage 没把三个字段的复位回调接到深链 hook").toMatch(/onConsumed: onFocusNoteConsumed/);
  });

  it("反例自检：同一组正则对**改前**形态必须不命中（防判据空真）", () => {
    const before = [
      "<SessionsPage focusSessionId={focusSessionId}",
      "<NotesPage focusNoteId={focusNoteId} focusNoteSearch={focusNoteSearch} focusGroupId={focusGroupId}",
      "<KnowledgePage focusSystemId={focusSystemId}",
      "// 清空责任在 App（本页无 onFocus*Consumed 回调）",
    ].join("\n");
    expect(/onFocusSessionConsumed=/.test(before)).toBe(false);
    expect(/onFocusNoteConsumed=/.test(before)).toBe(false);
    expect(/onFocusSystemConsumed=/.test(before)).toBe(false);
  });
});
