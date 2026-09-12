// @vitest-environment jsdom
/**
 * @ai-context tone.test.ts — 双基调（`data-tone`）与两条缓动落点的**行为级契约**
 *   （规格 §8.3 · ADR-035 · 裁决 R3.4 · 计划 T8 的 V1–V4 + 派发书追加的两条）。
 *
 * Why 每条判据都在这里（编号 ↔ 计划 V 号；每条各带专属变异体，读数见 task-8-report.md）：
 *   V1 **token 名 + 生成物定值**：`toneEaseVar` 的逐字变量名与生成物 `tokens.css` 里的定值必须**同时**成立
 *      ——只改一侧时落点会静默取不到值（未定义的 CSS 变量不报错，属性被丢弃）。
 *   V2 **具名 ease 真注册**：未 `registerPlugin(CustomEase)` / 未 `CustomEase.create` 时
 *      `gsap.parseEase("ed-paper-bleed")` **静默返回 `undefined`**（只有一条 stderr 警告、动画照跑默认曲线）。
 *   V3 「**不是回弹**」= 单调不减（本任务最有牙的一条，§8.7 明确不做回弹）：两侧都取样 ——
 *      GSAP 侧 101 点逐点单调 + 端点 `f(0)=0 / f(1)=1`；CSS 侧 bezier 的 y 控制点落在 `[0,1]` 且 `y1 ≤ y2`
 *      （这正是 cubic-bezier 单调不减的充分条件）⇒ 把「带惯性沉降、不是回弹」从形容词变成可测性质。
 *   V4 **取值域闭合**：`MOTION_TONES` 与两张表的键集**逐序数组相等**（R14.7 I-2：集合/数量相等测不出纯换序）。
 *   V5 **每个基调都能被落点声明**：DOM 侧 `data-tone` 往返 + 两条落点（CSS var / GSAP ease）都可解析。
 *   V6 **reduced-motion 下不产生运动**：import 期 tween 数 0、声明基调不写 inline style、查曲线不改读数
 *      （§8.6.1 第 4 条；真正的「跳过」由落点在波 B/C 兑现，本层只承诺**自己不产生运动**）。
 *
 * 判据纪律（R8.1/R8.3）：断言全同步；**不**用 `gsap.updateRoot` / `ticker.tick` / `ticker.sleep` / `await sleep`；
 *   **不**把 jsdom 的 `performance` 挂到 `globalThis`；GSAP 家族的**静态** import 只许在 `motion/engine.ts`
 *   ⇒ 本文件经 `await import("./engine")` 取引擎（同 `engine.test.ts` 的口径）。
 * 副作用：只读磁盘（生成物）+ 给 `window.matchMedia` 打桩 + 建**游离**元素（不挂进 document，不产生动画）。
 * 边界：① 本文件**不**判 `data-tone` 的落点接线（那是波 B/C）⇒ 今日 `app/src` 生产代码里 `data-tone` 仍 0 命中；
 *   ② `CustomEase` 的曲线控制点是**手感参数**，本文件只保证「单调不减 + 端点正确」，**不保证视觉正确**。
 */
import { describe, expect, it } from "vitest";
import { EASING_TOKENS, renderAll } from "../../scripts/gen-tokens.mjs";
import { MOTION_TONES, TONE_EASE_NAME, TONE_EASE_TOKEN, toneEase, toneEaseVar } from "./tone";

const CSS = renderAll().css;
/** 101 个采样点（t = 0, 0.01, …, 1）—— 计划 V3 的逐字口径 */
const SAMPLES = 101;

/** 从生成物里抓某条缓动 token 的 bezier 四元组；抓不到 = 仪器失效，**抛**而不是静默通过。 */
function bezierOf(token: string): number[] {
  const m = new RegExp(`--ed-${token}:\\s*cubic-bezier\\(([^)]+)\\);`).exec(CSS);
  if (m === null || m[1] === undefined) throw new Error(`生成物里没有 --ed-${token} 的 cubic-bezier 定值`);
  return m[1].split(",").map((s) => Number(s.trim()));
}

/** `matchMedia` 桩：R3.2 要求实现 legacy 的 `addListener`/`removeListener`（GSAP 走 legacy 分支）。 */
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/** 变量名归一：由 `toneEaseVar` 的产物剥掉 CSS 包装（不另写一份真源） */
const varName = (tone: (typeof MOTION_TONES)[number]): string => toneEaseVar(tone).replace(/^var\(|\)$/g, "");

describe("双基调：基调登记表与两条缓动落点", () => {
  it("V6 reduced-motion 下不产生运动（import 期 0 tween · 零 inline style · 查曲线不改读数）", async () => {
    // 桩必须在**首次** import engine 之前生效 ⇒ 本文件把它排成第一例（模块缓存后重 import 是空操作）
    stubMatchMedia(true);
    const { gsap } = await import("./engine");

    expect(gsap.globalTimeline.getChildren(), "本层在 import 期就建了 tween ⇒ 违反「reduce 下整体静态」").toHaveLength(0);
    const els = MOTION_TONES.map((tone) => {
      const el = document.createElement("div");
      el.setAttribute("data-tone", tone);
      return el;
    });
    expect(els.map((el) => el.getAttribute("style")), "声明基调这个动作不得写任何 inline style").toEqual(
      MOTION_TONES.map(() => null),
    );

    let calls = 0;
    for (let i = 0; i < SAMPLES; i += 1) {
      for (const tone of MOTION_TONES) {
        toneEase(tone);
        calls += 1;
      }
    }
    expect(calls, "采样循环没跑满 ⇒ 上面那条是空真").toBe(SAMPLES * MOTION_TONES.length);
    expect(gsap.globalTimeline.getChildren(), "查询曲线这个只读动作竟然建了 tween").toHaveLength(0);
  });

  it("V1 两条缓动 token 的变量名逐字正确，且都在生成物里有非空定值", () => {
    // 期望值写成**拼接**形态：`motionTokens.consumption.test.ts` 会全树扫 CSS 变量消费点并要求同值兜底，
    // 这里是断言里的期望值（不是消费点），拼接可让那台扫描器不误判本行。
    expect(toneEaseVar("instrument")).toBe("var" + "(--ed-ease-instrument)");
    expect(toneEaseVar("paper")).toBe("var" + "(--ed-ease-paper)");

    const declared = EASING_TOKENS.map((t) => `--ed-${t.name}`);
    for (const tone of MOTION_TONES) {
      const name = varName(tone);
      expect(declared, `${name} 不在生成器真源 EASING_TOKENS 里（加了落点却没进真源）`).toContain(name);
      const m = new RegExp(`${name}:\\s*([^;]+);`).exec(CSS);
      expect(m?.[1], `${name} 在生成物 tokens.css 里没有定值`).toBeTruthy();
      expect(m?.[1] ?? "", `${name} 的定值里出现 undefined 串 ⇒ 真源那条漏了 value`).not.toContain("undefined");
    }
  });

  it("V2 两个基调的具名 ease 都已在 engine 注册（paper = CustomEase 的具名 ease）", async () => {
    const { gsap } = await import("./engine");
    expect(TONE_EASE_NAME.instrument, "仪器的 GSAP 侧是内置曲线").toBe("power3.inOut");
    expect(TONE_EASE_NAME.paper, "纸的 GSAP 侧是 engine 里 CustomEase.create 的具名 ease").toBe("ed-paper-bleed");
    for (const tone of MOTION_TONES) {
      const name = TONE_EASE_NAME[tone];
      expect(typeof gsap.parseEase(name), `"${name}" 没进 GSAP 的 ease 表（CustomEase 未注册 ⇒ 静默退化）`).toBe(
        "function",
      );
    }
  });

  it("V3 「不是回弹」= 单调不减：GSAP 侧 101 点单调 + 端点；CSS 侧 bezier 的 y 落在 [0,1] 且 y1 ≤ y2", async () => {
    const { gsap } = await import("./engine");
    for (const tone of MOTION_TONES) {
      const name = TONE_EASE_NAME[tone];
      const ease = gsap.parseEase(name) as ((t: number) => number) | undefined;
      expect(typeof ease, `${name} 没注册 ⇒ 下面三条会变成空真`).toBe("function");
      const ys = Array.from({ length: SAMPLES }, (_, i) => (ease as (t: number) => number)(i / (SAMPLES - 1)));
      const drops = ys.flatMap((y, i) =>
        i > 0 && y < (ys[i - 1] ?? 0) - 1e-9 ? [`t=${(i / (SAMPLES - 1)).toFixed(2)}: ${ys[i - 1]} → ${y}`] : [],
      );
      expect(drops, `${name} 的采样序列出现下降 ⇒ 是回弹/过冲（§8.7 明确不做）`).toEqual([]);
      expect(ys[0], `${name} 的 f(0)`).toBeCloseTo(0, 6);
      expect(ys[SAMPLES - 1], `${name} 的 f(1)`).toBeCloseTo(1, 6);
    }

    for (const tone of MOTION_TONES) {
      const [x1, y1, x2, y2] = bezierOf(TONE_EASE_TOKEN[tone]);
      const at = `--ed-${TONE_EASE_TOKEN[tone]}`;
      expect(x1 >= 0 && x1 <= 1, `${at} 的 x1=${x1} 越界（CSS 要求 x ∈ [0,1]）`).toBe(true);
      expect(x2 >= 0 && x2 <= 1, `${at} 的 x2=${x2} 越界（CSS 要求 x ∈ [0,1]）`).toBe(true);
      expect(
        (y1 ?? 0) >= 0 && (y1 ?? 0) <= (y2 ?? 0) && (y2 ?? 0) <= 1,
        `${at} 的 y 控制点 ${y1}/${y2} 不满足 0 ≤ y1 ≤ y2 ≤ 1 ⇒ 曲线可能过冲（回弹形状）`,
      ).toBe(true);
    }
  });

  it("V4 基调取值域闭合：两张表的键集与 MOTION_TONES 逐序数组相等（纯换序也必须红）", () => {
    expect([...MOTION_TONES]).toEqual(["instrument", "paper"]);
    expect(Object.keys(TONE_EASE_TOKEN), "TONE_EASE_TOKEN 的键集/顺序与基调集合不一致").toEqual([...MOTION_TONES]);
    expect(Object.keys(TONE_EASE_NAME), "TONE_EASE_NAME 的键集/顺序与基调集合不一致").toEqual([...MOTION_TONES]);
  });

  it("V5 每个基调都能被落点声明：data-tone 往返 + 两条落点都可解析", async () => {
    const { gsap } = await import("./engine");
    for (const tone of MOTION_TONES) {
      const el = document.createElement("div");
      el.setAttribute("data-tone", tone);
      expect(el.getAttribute("data-tone"), "落点声明的载体逐字是 data-tone").toBe(tone);
      expect(el.dataset.tone, "dataset 往返：落点写得出、读得回").toBe(tone);
      expect(el.getAttribute("style"), "声明基调本身不得写 inline style").toBeNull();

      expect(
        new RegExp(`${varName(tone)}:\\s*cubic-bezier\\(`).test(CSS),
        `${tone} 的 CSS 侧落点 ${varName(tone)} 在生成物里没有 cubic-bezier 定值`,
      ).toBe(true);
      expect(typeof gsap.parseEase(toneEase(tone)), `${tone} 的 GSAP 侧落点未注册`).toBe("function");
    }
  });
});
