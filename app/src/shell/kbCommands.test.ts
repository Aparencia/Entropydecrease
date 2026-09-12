/**
 * @ai-context ⌘K 数据源适配层的契约守卫（批 3 Task 12；规格 §9 表 #14「`kb_search` → ⌘K 的数据源」）。
 *
 * 本文件跑在仓默认的 node 环境（**不加环境指令头**）：被测模块是纯函数 —— 这正是把它单独立文件的
 *   理由（本仓 `invoke` 在 node 下不可用，所以 IPC 一律 mock；`app/src/utils/kbHits.test.ts` 同款）。
 *
 * 判据分四层，每条都能**独立变红**（变异体实测见 `task-12-report.md`）：
 *   ① 形状：`KbHit` → `Command`（id 用 chunkId 定身份、label 复用全站 `hitLabel`、hint 标「命中」）；
 *   ② 降级：空白串**不发 IPC** · IPC 抛错 ⇒ 空列表**且不抛**（`degraded` 标记上抛，不吞错——有 warn）；
 *   ③ 阴性样本：脏命中逐条跳过（null / 缺 chunkId / 类型错 / 碎片命中 / 笔记缺 noteId）；
 *   ④ 入参：limit 夹到 [1, 50]（Rust 侧同口径），`searchCommands` 的计划签名可用。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KbHit } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import {
  commandsFromHits,
  kbSearchCommands,
  searchCommands,
  KB_SEARCH_DEBOUNCE_MS,
  KB_SEARCH_DEFAULT_LIMIT,
  KB_SEARCH_MAX_LIMIT,
  type HitJump,
} from "./kbCommands";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "kbCommands.ts"), "utf8");

/** 合法笔记命中（字段逐字对齐 Rust `KbHit`；snippet 带全站 `==命中==` 高亮协议） */
const noteHit: KbHit = {
  chunkId: 7,
  sourceKind: "note",
  noteId: 42,
  fragmentId: null,
  noteTitle: "眼影入门",
  groupName: "化妆课",
  heading: "晕染手法",
  snippet: "先取粉再==少量多次==地上色",
  scoreKind: "fts",
};

beforeEach(() => {
  invokeMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("① commandsFromHits：命中 → 结果命令", () => {
  it("笔记命中 → 一条命令：id 用 chunkId 定身份、label 走全站 hitLabel、hint 标命中", () => {
    const cmds = commandsFromHits([noteHit]);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("hit:7");
    expect(cmds[0].label).toBe("📄 眼影入门 · 晕染手法"); // 与 CitationChips 同一真源（不另写一套文案）
    expect(cmds[0].hint).toBe("命中");
  });

  it("run() 把跳转意图交给注入的回调（首个 ==词== 作搜索词；无标记 → 空串）", () => {
    const jumps: HitJump[] = [];
    const cmds = commandsFromHits([noteHit, { ...noteHit, chunkId: 8, snippet: "无标记片段" }], (j) => jumps.push(j));
    cmds[0].run();
    cmds[1].run();
    expect(jumps).toEqual([
      { noteId: 42, search: "少量多次", chunkId: 7 },
      { noteId: 42, search: "", chunkId: 8 },
    ]);
  });

  it("阴性样本：没有回调时 run() 不抛（面板未注入回调的极端路径）", () => {
    const cmds = commandsFromHits([noteHit]);
    expect(() => cmds[0].run()).not.toThrow();
  });
});

describe("③ 脏命中逐条跳过（一条脏数据不得毁掉整个列表）", () => {
  it("null / 缺 chunkId / 类型错 / 碎片命中 / 笔记缺 noteId ⇒ 全部跳过；合法项仍在", () => {
    const dirty: unknown[] = [
      null,
      "not-an-object",
      { ...noteHit, chunkId: 9, sourceKind: "fragment", fragmentId: 3, noteId: null }, // 碎片：无跳转页
      { ...noteHit, chunkId: 10, noteId: null }, // 笔记缺 id
      { ...noteHit, chunkId: "11" }, // 类型错
      { ...noteHit, chunkId: 12, snippet: 42 }, // snippet 非串
    ];
    const cmds = commandsFromHits([...(dirty as KbHit[]), noteHit]);
    expect(cmds.map((c) => c.id)).toEqual(["hit:7"]);
  });
});

describe("② 防御性降级（AGENTS.md §3.4）", () => {
  it("空白/空查询 ⇒ 不发 IPC 且返回空列表（Rust 侧同样返回空，这里省一次往返）", async () => {
    await expect(kbSearchCommands("   ")).resolves.toEqual({ commands: [], degraded: false });
    await expect(kbSearchCommands("")).resolves.toEqual({ commands: [], degraded: false });
    expect(invokeMock, "空白串仍发了 IPC").not.toHaveBeenCalled();
  });

  it("正常命中 ⇒ 按 Rust 契约调用（命令名 + query/limit），返回结果命令且未降级", async () => {
    invokeMock.mockResolvedValueOnce([noteHit]);
    const out = await kbSearchCommands("  眼影  ");
    expect(invokeMock).toHaveBeenCalledWith("kb_search", { query: "眼影", limit: KB_SEARCH_DEFAULT_LIMIT });
    expect(out.degraded).toBe(false);
    expect(out.commands.map((c) => c.id)).toEqual(["hit:7"]);
  });

  it("IPC 抛错 ⇒ 空列表 + degraded 且**不抛**（⌘K 不能因检索失败而不可用），warn 带上下文", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce("查询过长（≤500 字符）");
    const out = await kbSearchCommands("长查询");
    expect(out).toEqual({ commands: [], degraded: true });
    expect(warn, "降级路径没有留下任何日志（等于空 catch）").toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain("kb_search");
  });

  it("后端返回非数组（版本漂移）⇒ 空结果但不降级（不猜结构、也不谎报失败）", async () => {
    invokeMock.mockResolvedValueOnce({ hits: [noteHit] });
    await expect(kbSearchCommands("眼影")).resolves.toEqual({ commands: [], degraded: false });
  });
});

describe("④ 入参与计划签名", () => {
  it("limit 夹到 [1, 50]（Rust 侧 clamp 同口径；NaN/负数/超大都不越界）", async () => {
    invokeMock.mockResolvedValue([]);
    await kbSearchCommands("a", 999);
    await kbSearchCommands("a", 0);
    await kbSearchCommands("a", -3);
    await kbSearchCommands("a", Number.NaN);
    expect(invokeMock.mock.calls.map((c) => (c[1] as { limit: number }).limit)).toEqual([
      KB_SEARCH_MAX_LIMIT,
      1,
      1,
      KB_SEARCH_DEFAULT_LIMIT,
    ]);
  });

  it("searchCommands（计划 Interfaces 的逐字签名）返回命令数组，空白串短路", async () => {
    invokeMock.mockResolvedValueOnce([noteHit]);
    const cmds = await searchCommands("眼影");
    expect(cmds.map((c) => c.id)).toEqual(["hit:7"]);
    await expect(searchCommands("  ")).resolves.toEqual([]);
  });

  it("防抖常量就是计划规定的 180ms（本批唯一允许的计时器）", () => {
    expect(KB_SEARCH_DEBOUNCE_MS).toBe(180);
  });

  it("⑤ 静态纪律：不 import React（否则纯函数测试面会塌成需要 DOM 运行时）", () => {
    expect(/from\s+["']react["']/.test(SRC), "kbCommands 引入了 React ⇒ 脱离运行时的单测面失效").toBe(false);
    // 反例自检：同一正则对一段确实 import React 的代码必须命中（否则上面是恒真）
    expect(/from\s+["']react["']/.test('import { useState } from "react";')).toBe(true);
  });
});
