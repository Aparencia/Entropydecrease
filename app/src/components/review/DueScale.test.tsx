// @vitest-environment jsdom
/**
 * DueScale.test.tsx — 到期刻度承载面的判据（批 6 波 B · T21；R5.4 / §8.6 #4 的承载面）。
 *
 * @ai-context: 覆盖五条 —— ① 计数真源唯一（段数 == `due`，**逐序数组相等** + `data-due` 双断言）；
 *              ② 缺 `intervals` 时**不假装精确**（零 `[data-interval]`，只有计数刻度）；
 *              ③ 双精度域如实区分（`day` ⇒ 标签带「约…整天粒度」，`exact` ⇒ 精确值）；
 *              ④ **零自造间隔**（剥注释后扫两个生产文件：`stateJson` 解析 / `dueAt` 差分 /
 *              `86400000` 三个正则 0 命中，含仪器双侧自证）；⑤ **零新增 IPC**（两个生产文件里
 *              `count_due_cards` 的调用点**逐序**等于既有那两处 · 本件不 import `@tauri-apps`）。
 *              外加一条形态接线判据：底轨带 `ed-surface--due-glow`（环境层 ④ 的真实落点）
 *              且本件零琥珀字面量（R4.5：琥珀唯一来源 = `tokens.gen.ts` 的 `due` 族）。
 * @ai-context: 边界：本件**只判静态形态**（段数 / 属性 / 标签 / 源码面）——
 *              「生长 / 回缩」动效不在本任务（归 T30 波 C），故这里**没有**任何时间轴断言。
 *              无 jest-dom / 无 user-event ⇒ 只用原生 DOM API 与 `===` 断言（仓内既有范式）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readLines, stripComments } from "../../ui/primitives/sliceScan";
import DueScale from "./DueScale";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROD = ["components/review/DueScale.tsx", "pages/ReviewPage.tsx"] as const;
const readProd = (rel: string): { raw: string[]; stripped: string[] } => readLines(join(SRC, ...rel.split("/")));

/** 段序号（逐序数组——「恰 N 个、按序」一律用数组相等，不用 `.length` 单断言） */
const ticks = (c: HTMLElement): (string | null)[] =>
  [...c.querySelectorAll("[data-tick]")].map((el) => el.getAttribute("data-tick"));
/** 段上的某个 `data-*`（逐序） */
const attr = (c: HTMLElement, name: string): (string | null)[] =>
  [...c.querySelectorAll("[data-tick]")].map((el) => el.getAttribute(name));
/** 段的 `title`（逐序） */
const titles = (c: HTMLElement): (string | null)[] =>
  [...c.querySelectorAll("[data-tick]")].map((el) => el.getAttribute("title"));
const rootOf = (c: HTMLElement): HTMLElement => c.querySelector('[data-testid="scale"]') as HTMLElement;
const styleOf = (c: HTMLElement, i: number): CSSStyleDeclaration =>
  (c.querySelectorAll("[data-tick]")[i] as HTMLElement).style;

afterEach(() => cleanup());

describe("DueScale · 计数真源与刻度形态", () => {
  it("V1 · 段数 == 传入的 due（两个读数逐序相等 ⇒ 段数不是任何常量）：7 ⇒ 7 段 · 0 ⇒ 0 段", () => {
    const { container, rerender } = render(<DueScale due={7} testId="scale" />);
    expect(rootOf(container).getAttribute("data-due")).toBe("7");
    expect(ticks(container)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    rerender(<DueScale due={9} testId="scale" />);
    expect(rootOf(container).getAttribute("data-due")).toBe("9");
    expect(ticks(container)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);
    rerender(<DueScale due={0} testId="scale" />);
    expect(rootOf(container).getAttribute("data-due")).toBe("0");
    expect(ticks(container)).toEqual([]);
  });

  it("边界 · due=0 渲染空刻度（**不是**空态文案 —— 空态归调用点），不落任何刻度底轨", () => {
    const { container } = render(<DueScale due={0} testId="scale" />);
    expect(container.textContent).toBe("");
    expect(container.querySelector(".ed-surface--due-glow")).toBeNull();
    // 防御：非有限值 / 负数 / 小数不造幽灵段
    const bad = render(<DueScale due={Number.NaN} testId="scale" />);
    expect(ticks(bad.container)).toEqual([]);
    bad.rerender(<DueScale due={-3} testId="scale" />);
    expect(ticks(bad.container)).toEqual([]);
    bad.rerender(<DueScale due={2.9} testId="scale" />);
    expect(ticks(bad.container)).toEqual(["0", "1"]);
  });

  it("V3 · 缺 intervals ⇒ 不假装精确：零 [data-interval]、每段都是「无间隔」档、granularity 缺省 day", () => {
    const { container } = render(<DueScale due={5} testId="scale" />);
    expect(container.querySelectorAll("[data-interval]").length).toBe(0);
    expect(attr(container, "data-tier")).toEqual(["none", "none", "none", "none", "none"]);
    expect(rootOf(container).getAttribute("data-granularity")).toBe("day");
  });

  it("刻度长度来自 intervalDays（单调不减）：0.0（新卡）⇒ 「无间隔」档且**不是** 0 长度", () => {
    const { container } = render(<DueScale due={3} testId="scale" intervals={[0, 1, 30]} />);
    expect(attr(container, "data-interval")).toEqual(["0", "1", "30"]);
    expect(attr(container, "data-tier")).toEqual(["none", "day", "day"]);
    const [newCard, oneDay, cap] = [styleOf(container, 0).height, styleOf(container, 1).height, styleOf(container, 2).height];
    expect(parseFloat(newCard)).toBeGreaterThan(0);
    expect(parseFloat(oneDay)).toBeGreaterThanOrEqual(parseFloat(newCard));
    expect(parseFloat(cap)).toBeGreaterThanOrEqual(parseFloat(oneDay));
  });

  it("P1 · 双精度域不许混为一谈：day 标签带「约…整天粒度」· exact 标签是精确值", () => {
    const { container, rerender } = render(<DueScale due={2} intervals={[3.5, 30]} testId="scale" />);
    expect(rootOf(container).getAttribute("data-granularity")).toBe("day");
    expect(titles(container)).toEqual(["第 1 段 · 约 3.5 天（整天粒度）", "第 2 段 · 约 30 天（整天粒度）"]);
    rerender(<DueScale due={2} intervals={[3.5, 30]} granularity="exact" testId="scale" />);
    expect(rootOf(container).getAttribute("data-granularity")).toBe("exact");
    expect(titles(container)).toEqual(["第 1 段 · 3.5 天", "第 2 段 · 30 天"]);
  });

  it("P2 · 环境层 ④ 的真实落点：底轨带 ed-surface--due-glow，且本件零琥珀字面量（R4.5）", () => {
    const { container } = render(<DueScale due={2} testId="scale" />);
    const lane = container.querySelector(".ed-surface--due-glow") as HTMLElement;
    expect(lane.className).toBe("ed-surface ed-surface--sunken ed-surface--due-glow");
    expect(readFileSync(join(SRC, "components", "review", "DueScale.tsx"), "utf8")).not.toMatch(
      /#9F5E10|#E0A44B|#B26A12|#A05F10/i,
    );
  });
});

describe("DueScale · 源码面判据（R5.4 的明文禁止 → 守卫）", () => {
  /** 三个正则 = 计划 V2 逐字：`stateJson` 解析 / `dueAt` 差分 / 毫秒常量折算 */
  const FORBIDDEN = [/stateJson\s*\./, /dueAt\s*[-+]/, /86_?400_?000/] as const;

  it("V2 · 剥注释后两个生产文件三个正则**0 命中**（仪器双侧自证：正样本必命中 · 注释里的不算）", () => {
    const hits = PROD.flatMap((rel) =>
      readProd(rel).stripped.flatMap((line, i) =>
        FORBIDDEN.filter((re) => re.test(line)).map((re) => `${rel}:${i + 1}: ${String(re)}`),
      ),
    );
    expect(hits).toEqual([]);
    // 正样本（防「仪器静默失效 ⇒ 上面的 0 命中是空真」）：计划 V2 的 M2 那一行必须被抓到
    const mutant = "const days = (c.dueAt - c.createdAt) / 86400000;";
    expect(FORBIDDEN.some((re) => re.test(mutant))).toBe(true);
    expect(FORBIDDEN.some((re) => re.test("const s = c.stateJson.stability;"))).toBe(true);
    // 负样本：同一批字面量落在注释里 ⇒ 剥注释后不再命中（否则本判据会被注释骗过）
    expect(stripComments(`// ${mutant}\n/* c.stateJson.stability */`).includes("dueAt")).toBe(false);
  });

  it("V5 · 零新增 IPC：两个生产文件里 count_due_cards 的调用点**逐序**仍只有既有那两处", () => {
    const sites = PROD.flatMap((rel) =>
      readProd(rel).stripped
        .map((line) => line.trim())
        .filter((line) => line.includes('"count_due_cards"')),
    );
    expect(sites).toEqual([
      'invoke<number>("count_due_cards", { groupId: null }),',
      '...list.map((g) => invoke<number>("count_due_cards", { groupId: g.id })),',
    ]);
    // 承载面是纯展示：不 import `@tauri-apps`（M5 的第二种表现；剥注释后扫 —— 头注里提到它不算）
    expect(readProd(PROD[0]).stripped.join("\n").includes("@tauri-apps")).toBe(false);
  });
});
