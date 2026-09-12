// @vitest-environment jsdom
/**
 * @ai-context ⌘K 的 `kb_search` **接线守卫**（批 3 Task 12；规格 §9 表第 14 行「⌘K 的数据源」）。
 *
 * Why 与 T11 的 `CommandPalette.test.tsx` 分居两个文件：① 那个文件 **172 行**、计划上限 **200**，
 *   本任务的端到端式用例塞不进去；② **T11 已提交的断言一个字都不许改**（T12 派发书），分居是最硬的
 *   保证。两份文件判两件事：T11 = 壳的契约（键盘 / 关闭 / IME / 静态纪律）· 本文件 = **数据源接线**。
 *
 * 判据（每条都带能红的机制，变异体实测见 `task-12-report.md`）：
 *   ① 取样：输入 → **180ms 后**才查一次；连打三次仍只查一次（无防抖实现会查三次 ⇒ 红）；
 *   ② 竞态：**只认最后一次请求** —— 慢的旧响应回来不得覆盖新结果（去掉 seq 守卫 ⇒ 红）；
 *   ③ 降级：IPC 抛错 ⇒ 页面命令仍可用 + 一行灰字提示（**不谎报**成「没有匹配的命令」）；
 *   ④ 合并：结果命令**追在页面命令之后**（页面命令恒在最前），点击 → `onPick({kind:"hit"})`；
 *   ⑤ 静态：`App.tsx` 的 `onPick` 四个分支齐全、页面键仍过 `isPageKey`、10 个 `focus*` 字段原样在、
 *      跳转入口已收敛为具名函数（**仪器局限**：这是源码文本判据，运行期只有真机给证据 —— 与 T11 同款声明）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KbHit } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { CommandPalette } from "./CommandPalette";
import { KB_SEARCH_DEBOUNCE_MS } from "./kbCommands";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `App.tsx` 的**只留代码**版本（剥块注释 + 整行 `//`）—— 与 T11 同一口径 */
const APP_CODE = readFileSync(join(HERE, "..", "App.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const noteHit: KbHit = {
  chunkId: 7, sourceKind: "note", noteId: 42, fragmentId: null, noteTitle: "眼影入门",
  groupName: "化妆课", heading: "晕染手法", snippet: "先取粉再==少量多次==地上色", scoreKind: "fts",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

/** 推进防抖窗 + 冲洗微任务（两个 `act` 是必需的：先跑定时器，再等 IPC 的 promise 链） */
async function afterDebounce() {
  await act(async () => { vi.advanceTimersByTime(KB_SEARCH_DEBOUNCE_MS); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("① 防抖取样（180ms —— 本批唯一允许的计时器）", () => {
  it("输入后 180ms 才查一次，命中出现在列表里", async () => {
    invokeMock.mockResolvedValueOnce([noteHit]);
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "眼影" } });
    expect(invokeMock, "输入即查（防抖没生效）").not.toHaveBeenCalled();
    await afterDebounce();
    expect(invokeMock).toHaveBeenCalledWith("kb_search", { query: "眼影", limit: 10 });
    expect(screen.getByTestId("command-hit:7").querySelector(".ed-cmdk__label")?.textContent).toBe("📄 眼影入门 · 晕染手法");
  });

  it("连打三次只查一次（没有防抖的实现会查三次 ⇒ 本判据变红）", async () => {
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "眼" } });
    fireEvent.change(input, { target: { value: "眼影" } });
    fireEvent.change(input, { target: { value: "眼影入" } });
    await afterDebounce();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("kb_search", { query: "眼影入", limit: 10 }); // 只查最后那个串
  });

  it("空白查询不发 IPC（Rust 侧同样返回空——这里省一次往返）", async () => {
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "   " } });
    await afterDebounce();
    expect(invokeMock).not.toHaveBeenCalled();
    // 空查询 = 全量页面命令（T11 的默认形态：没输入时也看得到全部页面命令）
    expect(screen.getAllByRole("option")).toHaveLength(11);
  });
});

describe("② 只认最后一次请求（慢响应不得覆盖新结果）", () => {
  it("第一次查询挂起、第二次先返回 ⇒ 旧响应回来时被丢弃", async () => {
    const slow = deferred<KbHit[]>();
    invokeMock.mockImplementationOnce(() => slow.promise); // 第一次：挂起
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "旧" } });
    await afterDebounce(); // 派发第一次查询（挂起中）
    invokeMock.mockResolvedValueOnce([{ ...noteHit, chunkId: 8 }]);
    fireEvent.change(input, { target: { value: "新" } });
    await afterDebounce();
    expect(screen.getByTestId("command-hit:8")).toBeTruthy(); // 新结果已上屏
    await act(async () => { slow.resolve([noteHit]); }); // 慢的旧响应此刻才回来
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId("command-hit:7"), "过期响应覆盖了新结果（seq 守卫失效）").toBeNull();
    expect(screen.getByTestId("command-hit:8")).toBeTruthy();
  });
});

describe("③ 失败降级（⌘K 不能因检索失败而不可用）", () => {
  it("IPC 抛错 ⇒ 页面命令仍在 + 一行灰字提示；不抛、不谎报「没有匹配」", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce("学习库索引未就绪");
    render(<CommandPalette open onClose={vi.fn()} onPick={vi.fn()} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "眼影" } });
    await afterDebounce();
    expect(screen.queryByTestId("command-hit:7")).toBeNull();
    expect(screen.getByTestId("command-palette-degraded").textContent).toContain("检索不可用");
    // 面板仍可用：清空输入后 9 个页面命令 + 对话面板 + 建体系向导一条不少
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "" } });
    await afterDebounce();
    expect(screen.queryByTestId("command-palette-degraded"), "恢复后仍挂着降级提示").toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(11);
    expect(warn, "降级没有留下日志（等于空 catch）").toHaveBeenCalled();
  });
});

describe("④ 与页面命令合并展示（页面命令恒在最前）", () => {
  it("结果命令排在页面命令之后；点击 → onPick({kind:'hit'}) + 关面板", async () => {
    invokeMock.mockResolvedValueOnce([noteHit]);
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} onPick={onPick} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "笔" } });
    await afterDebounce();
    const ids = Array.from(screen.getByTestId("command-palette-list").querySelectorAll("li")).map((li) => li.getAttribute("data-testid"));
    expect(ids.indexOf("command-hit:7"), "结果命令不在列表里").toBeGreaterThan(-1);
    expect(ids.indexOf("command-hit:7"), "结果命令排到了页面命令前面").toBeGreaterThan(ids.indexOf("command-page:notes"));
    fireEvent.click(screen.getByTestId("command-hit:7"));
    expect(onPick).toHaveBeenCalledWith({ kind: "hit", jump: { noteId: 42, search: "少量多次", chunkId: 7 } });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("无载荷的 focus* 入口（新建体系）在列表里，选中 → onPick({kind:'create-system'})", async () => {
    const onPick = vi.fn();
    render(<CommandPalette open onClose={vi.fn()} onPick={onPick} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "新建" } });
    fireEvent.click(screen.getByTestId("command-focus:create-system"));
    expect(onPick).toHaveBeenCalledWith({ kind: "create-system" });
  });
});

describe("⑤ App.tsx 侧的接线与入口收敛（**静态**判据；运行期证据归真机）", () => {
  it("onPick 四个分支齐全，且页面跳转仍经 isPageKey（反例自检：空实现必须不通过）", () => {
    expect(/pick\.kind === "dock"/.test(APP_CODE)).toBe(true);
    expect(/pick\.kind === "hit"[\s\S]{0,120}openNoteHighlight\(pick\.jump\.noteId, pick\.jump\.search\)/.test(APP_CODE), "检索结果没接到带词高亮入口").toBe(true);
    expect(/pick\.kind === "create-system"[\s\S]{0,80}openSystemWizard\(\)/.test(APP_CODE), "建体系入口没接").toBe(true);
    expect(/isPageKey\(pick\.key\)/.test(APP_CODE), "页面键没过 isPageKey").toBe(true);
    // 反例自检：同一组正则对「收敛前的两分支实现」必须不命中
    const before = `onPick={(pick) => { if (pick.kind === "dock") { setDockOpen(true); return; } if (isPageKey(pick.key)) setPage(pick.key); }}`;
    expect(/pick\.kind === "hit"/.test(before)).toBe(false);
    expect(/pick\.kind === "create-system"/.test(before)).toBe(false);
  });

  it("10 个 focus* 字段一个不少（只收敛入口、不删状态机），跳转入口已具名化", () => {
    const fields = ["focusSessionId", "focusNoteId", "focusNoteSearch", "focusSystemId", "createSystemSignal",
      "focusGroupId", "focusReviewGroupId", "focusRefineTaskId", "focusChatTaskId", "focusChatId"];
    const missing = fields.filter((f) => !new RegExp(`const \\[${f}, set`).test(APP_CODE));
    expect(missing, `这些 focus* 字段被删/改名了（本批不动状态机）：${missing.join(" / ")}`).toEqual([]);
    const entries = ["goSessions", "openNoteHighlight", "goSystem", "goGroup", "goReviewGroup",
      "goChatSession", "goChatTask", "goRefineWorkbench", "openSystemWizard"];
    const absent = entries.filter((e) => !new RegExp(`const ${e} = `).test(APP_CODE));
    expect(absent, `跳转入口没有收敛成具名函数：${absent.join(" / ")}`).toEqual([]);
    // 同一段「setFocus…+setPage」不应再在页内回调里重复手写（收敛前 goSessions 有 4 份）
    const inline = APP_CODE.match(/onOpenSessions=\{\(id\) =>/g) ?? [];
    expect(inline, "页内回调又手写了 onOpenSessions 跳转").toEqual([]);
  });
});
