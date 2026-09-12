// @vitest-environment jsdom
/**
 * useRevealChoreography.test.tsx — #2「显影编排」的**行为级判据**（批 6 波 C · T28；规格 §8.6 第 2 行 ·
 *   §8.6.1 第 1/3/4 条 · 裁决 R5.2 / R8.1 / R8.2 / R8.4 / R11.3 / R35.4 / R50.1 / R58.1）。
 *
 * 判据纪律：确定性推进**只用** `test/motionHarness.ts` 的 `freezeAt`（`paused: true` + `tl.time(t)`，R8.1 的
 *   唯一正解）；**禁用** `updateRoot` / `ticker.tick()` / `ticker.sleep()` / `await sleep()`。可中断判据
 *   **双断言**（时间线计数**两种口径都断** + 目标元素 `style.transform`；R8.2）。🔴 两条新假绿机制
 *   （R58.1）已避开：① reduced-motion 用例**显式设档位**（`standard`）**并带 `reduce:false` 阳性对照** ——
 *   否则 reduce 桩会把档位自身变成 `eco`，让「eco 不播」**旁路遮住**降级分支；② 计数判据取**在场 tween**
 *   （`tweenCount`）与 `globalTimeline` 两种口径，不取「只解析当前 DOM」的那种读数。⚠️ 本文件里的「字符率」
 *   一律指 `charRate` 的**近似**（规格未定义语速函数，见被测件文件头）。变异体读数（M1 分母换量纲 · M2 删
 *   文件头声明 · M3 世代不更新 · M4 中断只 kill 不落终态 · M5 先播后物化起点 · M6 rich 1200ms · M7 改动画
 *   `opacity` · M8 位移绕过 `clampShift` · M9 静态 import · M10 去掉接管）见 `task-28-report.md`。
 * 副作用：挂/卸真实 DOM、建 GSAP 时间线（`afterEach` 收尸）、读写档位记忆、临时改写 `window.matchMedia`。
 * 边界：**逐段观感与真实帧率本批未测**（jsdom 无排版、无 paint）—— 本文件判**数值与状态机**。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertAnimatable } from "../../motion/controls";
import { gsap } from "../../motion/engine";
import { MOTION_INTENSITY_KEY } from "../../motion/intensity";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "../../test/motionHarness";
import { stripComments } from "../../ui/primitives/sliceScan";
import { shiftYOf } from "../../views/session/useTriTrackAlign";
import {
  REVEAL_CEIL_MS, REVEAL_FLOOR_MS, REVEAL_FROM_PX, SEGMENT_SELECTOR, charRate, dwellWeight,
  revealBudgetSec, revealDelays, revealSpanSec, useRevealChoreography,
} from "./useRevealChoreography";
import type { RevealChoreography, RevealSegment } from "./useRevealChoreography";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "useRevealChoreography.ts"), "utf8");
const SRC = stripComments(RAW);
/** **文件头**（第一条 `import` 之前）= R5.2 要求的「逐字声明」所在处 */
const HEADER = RAW.slice(0, RAW.indexOf("\nimport "));/** 合成属性白名单（R8.4 的逐字序）＋夹具自己写的布局属性。⚠️ React 把 `margin: 0` 展开成四条 longhand
 *  ⇒ 读数里会出现 `margin-*` 四个（delta 口径的实测形态）。 */
const CONTROL = ["transform", "translate", "rotate", "scale", "opacity", "filter"];
const LAYOUT_PROPS = ["margin", "margin-bottom", "margin-left", "margin-right", "margin-top"];
/** 动态 import 的等待窗口（**不是**动画的等待窗口；同 T27 先例：全量并行跑时可超过默认 1000ms）。 */
const WAIT = { timeout: 5000 } as const;

/** 夹具：语速（字符率近似）刻意做出三档差 —— 快段 / 慢段 / 中等段。 */
const SEGMENTS: readonly RevealSegment[] = [
  { text: "abcdef", start_ms: 0, end_ms: 3000 },              // 6 字 / 3000ms ⇒ 500 ms/字
  { text: "快", start_ms: 3000, end_ms: 3300 },               // 1 字 / 300ms  ⇒ 300 ms/字（快）
  { text: "这一段讲得非常慢", start_ms: 3300, end_ms: 9300 },  // 8 字 / 6000ms ⇒ 750 ms/字（慢）
];
const seen: { api: RevealChoreography | null } = { api: null };

/** 探针宿主：逐段锚点 + 与视图同形的行内布局属性（`margin` = 夹具自己写的，不是被动画的属性）。 */
function Probe(): ReactElement {
  const box = useRef<HTMLDivElement | null>(null);
  const api = useRevealChoreography(box, SEGMENTS, { paused: true });
  seen.api = api;
  return (
    <div ref={box} data-tone="paper" data-reveal-epoch={api.revealEpoch}>
      {SEGMENTS.map((s, i) => (
        <p key={i} data-seg-id={`s${i}`} style={{ margin: 0 }}>
          {s.text}
        </p>
      ))}
    </div>
  );
}

const els = (): HTMLElement[] => [...document.body.querySelectorAll<HTMLElement>(SEGMENT_SELECTOR)];
/** DOM 侧读数（R8.2 的第二半）：位移只从 `transform` 读，不碰任何布局量。 */
const ys = (): number[] => els().map((el) => shiftYOf(currentTransform(el)));
const starts = (): number[] => SEGMENTS.map(() => REVEAL_FROM_PX);
const tls = () => seen.api!.handles.current.map((h) => h.timeline);
const seek = (t: number): void => act(() => { for (const tl of tls()) freezeAt(tl, t); });
const seekEnd = (): void => act(() => { for (const tl of tls()) freezeAt(tl, tl.duration()); });
/** 等「一组出口句柄」到位（动态 import 的到达窗口）。 */
const waitHandles = async (n: number): Promise<void> => {
  await waitFor(() => expect(seen.api!.handles.current).toHaveLength(n), WAIT);
};
/** 等起始态被物化（= 出口的零时长 tween 真的写到了 DOM）。 */
const waitStart = async (): Promise<void> => {
  await waitFor(() => expect(ys(), "起始态必须被物化进 DOM（R50.1：手写 style 无效）").toEqual(starts()), WAIT);
};

beforeEach(() => {
  seen.api = null;
  localStorage.clear();
});
afterEach(() => {
  for (const h of seen.api?.handles.current ?? []) h.interrupt();
  cleanup();
  for (const el of [...document.body.children]) {
    gsap.killTweensOf(el);
    el.remove();
  }
  seen.api = null;
});

describe("P1~P2 · 字符率近似与逐段错开（纯函数 = 本批对「节奏」的唯一定义）", () => {
  it("P1 · 字符率近似逐字：`charRate(\"abcdef\", 0, 3000)` 恰 = 0.002（字符/毫秒）· 退化段不抛 · 空文本 0", () => {
    expect(charRate("abcdef", 0, 3000), "逐字期望值 —— 量纲被换掉（如「每秒字符数」）时这里必红").toBe(0.002);
    expect(charRate("abcdef", 0, 3000), "同式独立复核（防上一行被写成常量）").toBe(6 / 3000);
    expect(() => charRate("abcd", 500, 500), "退化段（end === start）不许抛").not.toThrow();
    expect(charRate("abcd", 500, 500), "退化段取 len / 1").toBe(4);
    expect([charRate("", 0, 3000), charRate("", 10, 10)], "空文本 ⇒ 0（没有字符可说）").toEqual([0, 0]);
    expect(dwellWeight("", 0, 3000), "空文本权重 = 0（不产生 Infinity）").toBe(0);
    expect(dwellWeight("abcdef", 0, 3000), "权重 = 字符率近似的**倒数**（毫秒/字符）").toBe(500);
  });

  it("P2 · 逐段 delay 逐序：首段 0 · 单调不减 · 顺序 = 段序 · 总时长恰 = 档位预算 · 慢段显影更久", () => {
    const d = revealDelays(SEGMENTS, "standard");
    expect(d, "逐段 delay（秒），逐序 = 段序").toHaveLength(SEGMENTS.length);
    expect(d[0], "第一段不等待").toBe(0);
    expect(d.slice(1).every((v, i) => v >= (d[i] ?? 0)), "delay 必须单调不减 ⇒ 顺序只由段序定（档位不改顺序）").toBe(true);
    const spans = SEGMENTS.map((_, i) => revealSpanSec(d, i, "standard"));
    expect(spans.every((s) => s > 0), "每段都有非零显影时长").toBe(true);
    expect(spans[2] as number, "慢段（750 ms/字）显影久于快段（300 ms/字）—— 节奏 = 字符率近似的函数").toBeGreaterThan(spans[1] as number);
    expect(spans[2] as number).toBeGreaterThan(spans[0] as number);
    const total = (d[d.length - 1] ?? 0) + (spans[spans.length - 1] ?? 0);
    expect(Math.round(total * 1000), "最后一段的结束时刻恰 = 档位预算（不是「差不多」）").toBe(500);
    const rich = revealDelays(SEGMENTS, "rich");
    expect(rich.slice(1).every((v, i) => v > (d[i + 1] ?? 0)), "rich 的错开更明显（每段都推后）").toBe(true);
    // 档位只改总时长：三档的 delay 形状（相对首段的比例）必须一致 —— 顺序/相对快慢不许被档位重排
    const ratio = (arr: readonly number[]): number[] => arr.map((v) => v / (arr[arr.length - 1] ?? 1));
    expect(ratio(rich).map((v) => Math.round(v * 1e6))).toEqual(ratio(d).map((v) => Math.round(v * 1e6)));
  });

  it("P3 · 三档总时长：eco = 0 · standard 落在 §8.1 的编排层带 [400, 900] · rich 更长且 ≤ 900（硬上限）", () => {
    expect([revealBudgetSec("eco"), revealBudgetSec("standard"), revealBudgetSec("rich")], "eco 不播 · standard = `--ed-dur-reveal` · rich = §8.1 上界").toEqual([0, 0.5, 0.9]);
    expect(REVEAL_FLOOR_MS, "§8.1 逐字「400–900ms」的下界").toBe(400);
    expect(REVEAL_CEIL_MS, "§8.1 逐字的上界 = 硬上限（M6：rich 改成 1200ms 时下面两条必红）").toBe(900);
    const std = revealBudgetSec("standard") * 1000;
    expect(std >= REVEAL_FLOOR_MS && std <= REVEAL_CEIL_MS, `standard 的总时长 ${std}ms 不在 §8.1 的编排层带内`).toBe(true);
    const rich = revealBudgetSec("rich") * 1000;
    expect(rich, "「丰富」= 更长，不是更短").toBeGreaterThan(std);
    expect(rich, "900ms 仍是硬上限（「丰富」不等于「越界」）").toBeLessThanOrEqual(REVEAL_CEIL_MS);
  });
});

describe("V1~V2 · 起始态被持有（可反向）与可中断（双断言）", () => {
  it("V1 · 挂载即物化起始态 ⇒ 推进到终态 ⇒ `replay()` 又回到初态（往返两次都断 DOM 静态值）", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard");
    const view = render(<Probe />);
    await waitHandles(SEGMENTS.length);
    await waitStart();
    seekEnd();
    expect(ys(), "终态 = 位移归零（逐段都断）").toEqual(SEGMENTS.map(() => 0));
    for (const round of [1, 2]) {
      act(() => { seen.api!.replay(); });
      await waitFor(() => expect(seen.api!.revealEpoch, `第 ${round} 轮：世代号必须真的递增（M3 死在这里）`).toBe(round), WAIT);
      await waitHandles(SEGMENTS.length);
      await waitStart();
      seekEnd();
      expect(ys(), `第 ${round} 轮推进后回到终态`).toEqual(SEGMENTS.map(() => 0));
    }
    view.unmount();
  });

  it("V2b · 下一个输入接管（不排队）：在飞时 `replay()` ⇒ 旧时间线被收尸，总量仍是 N（不是 2N）", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard");
    const view = render(<Probe />);
    await waitHandles(SEGMENTS.length);
    await waitStart();
    seek(0.05);
    expect(gsap.globalTimeline.getChildren(false, true, true), "接管前：N 条时间线在场").toHaveLength(SEGMENTS.length);
    act(() => { seen.api!.replay(); });
    await waitFor(() => expect(seen.api!.revealEpoch).toBe(1), WAIT);
    await waitHandles(SEGMENTS.length);
    await waitStart();
    // 🔴 双断言：计数**两种口径**（旧时间线必须已被 `interrupt` 摘除）＋ DOM（值归新世代）
    expect(gsap.globalTimeline.getChildren(false, true, true), "旧时间线还在 ⇒ 那是「覆盖」不是「接管」（不排队）").toHaveLength(SEGMENTS.length);
    expect(gsap.globalTimeline.getChildren(), "递归口径 = N 条时间线 + N 条 tween").toHaveLength(SEGMENTS.length * 2);
    expect(els().map(tweenCount), "每段只许剩新世代的一条 tween").toEqual(SEGMENTS.map(() => 1));
    seekEnd();
    expect(ys()).toEqual(SEGMENTS.map(() => 0));
    view.unmount();
  });

  it("V2 · `skip()` 立即落终态：计数**两种口径都断** + DOM 半边 + 旧句柄推播放头不再写 DOM", async () => {
    expect(gsap.globalTimeline.getChildren(), "同文件前置用例有残留 ⇒ 下面的精确计数会被做假").toHaveLength(0);
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard");
    const view = render(<Probe />);
    await waitHandles(SEGMENTS.length);
    await waitStart();
    const first = tls();
    seek(0.05);
    // 🔴 双断言第一半（计数，**两种口径都断**）：N 条时间线 + 各自 1 条 tween ⇒ 默认**递归** = 2N / 直接子项 = N
    expect(gsap.globalTimeline.getChildren(), "默认路径遍历口径（递归）").toHaveLength(SEGMENTS.length * 2);
    expect(gsap.globalTimeline.getChildren(false, true, true), "只数直接子项（= N 条时间线）").toHaveLength(SEGMENTS.length);
    expect(els().map(tweenCount), "每段恰 1 条**在场** tween").toEqual(SEGMENTS.map(() => 1));
    const mid = ys();
    expect([(mid[0] ?? 0) > 0, (mid[0] ?? 0) < REVEAL_FROM_PX], "防空真：首段中途读数必须严格落在两端之间").toEqual([true, true]);

    act(() => { seen.api!.skip(); }); // 中断：下一个输入接管（不排队）
    await waitFor(() => expect(ys(), "「立即落终态」是中断的另一半（M4 只 kill 不落终态 ⇒ 停在中途值 ⇒ 红）").toEqual(SEGMENTS.map(() => 0)), WAIT);
    // 🔴 双断言第二半（DOM）+ 反空真：kill 之后场上不许还剩时间线/tween
    expect(gsap.globalTimeline.getChildren(), "skip 之后还有时间线在场 ⇒ 没真 interrupt").toHaveLength(0);
    expect(gsap.globalTimeline.getChildren(false, true, true)).toHaveLength(0);
    expect(els().map(tweenCount)).toEqual(SEGMENTS.map(() => 0));
    act(() => { freezeAt(first[0]!, 1); });
    expect(ys(), "旧句柄还能写 DOM ⇒ 子 tween 成了孤儿").toEqual(SEGMENTS.map(() => 0));
    view.unmount();
  });
});

describe("V3~V4 · reduced-motion 降级（含阳性对照）与三档自消费（R35.4）", () => {
  it("V3 · reduce 命中 ⇒ 跳终态（零在场 tween）；同一夹具在 reduce:false 下**确有**在飞 tween（阳性对照）", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard"); // 🔴 显式档位：防 reduce 桩把档位变 eco ⇒ 旁路遮住（R58.1①）
    const on = render(<Probe />);
    await waitHandles(SEGMENTS.length);
    expect(els().map(tweenCount), "阳性对照：未 reduce 时必须在飞（否则下面那条 zero 读数毫无意义）").toEqual(SEGMENTS.map(() => 1));
    on.unmount();
    const stub = installMatchMediaStub({ reduce: true });
    try {
      const view = render(<Probe />);
      await waitFor(() => expect(ys(), "命中 reduce ⇒ **直接落终态**（不是「停在起始值」）").toEqual(SEGMENTS.map(() => 0)), WAIT);
      expect(els().map(tweenCount), "命中 reduce 仍建 tween ⇒ 还有运动（§8.6.1 第 4 条）").toEqual(SEGMENTS.map(() => 0));
      expect(seen.api!.handles.current, "零编排时间线（惰性时间线也一并收尸 ⇒ 两侧读数一致）").toHaveLength(0);
      view.unmount();
    } finally {
      stub.restore();
    }
  });

  it("V4 · 三档：eco = 跳终态（不建编排 timeline）· standard / rich 的总时长落在 §8.1 的带内（逐档断言）", async () => {
    const totals: (number | null)[] = [];
    for (const tier of ["eco", "standard", "rich"] as const) {
      localStorage.setItem(MOTION_INTENSITY_KEY, tier);
      const view = render(<Probe />);
      if (tier === "eco") {
        await waitFor(() => expect(ys(), "§8.5：节能档 ⇒ 编排层直接跳终态").toEqual(SEGMENTS.map(() => 0)), WAIT);
        expect(seen.api!.handles.current, "eco 不建编排 timeline").toHaveLength(0);
        expect(els().map(tweenCount)).toEqual(SEGMENTS.map(() => 0));
        totals.push(null);
      } else {
        await waitHandles(SEGMENTS.length);
        await waitStart();
        totals.push(Math.round(Math.max(...tls().map((tl) => tl.duration())) * 1000));
        seekEnd();
        expect(ys(), "三档都落到终态（档位只改时长，不改终值）").toEqual(SEGMENTS.map(() => 0));
      }
      view.unmount();
    }
    const [eco, std, rich] = totals;
    expect(eco, "eco ⇒ 无 timeline（读数 null）").toBeNull();
    expect((std as number) >= REVEAL_FLOOR_MS && (std as number) <= REVEAL_CEIL_MS, `standard 总时长 ${std}ms 越出编排层带`).toBe(true);
    expect(rich as number, "rich = 更长").toBeGreaterThan(std as number);
    expect(rich as number, "rich ≤ 900ms（硬上限）").toBeLessThanOrEqual(REVEAL_CEIL_MS);
  });
});

describe("V5~V7 · 滚动接管 · 属性集合审计 · import 纪律与逐字声明", () => {
  it("V5 · 在飞期间任何滚动（window 捕获相位）⇒ 立即落终态（下一个输入接管，不排队）", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard");
    const view = render(<Probe />);
    await waitHandles(SEGMENTS.length);
    await waitStart();
    seek(0.05);
    expect(ys()[0] ?? 0, "滚动前：首段停在中途").toBeGreaterThan(0);
    act(() => { fireEvent.scroll(document.body); });
    await waitFor(() => expect(ys(), "滚动接管 ⇒ 全部落终态").toEqual(SEGMENTS.map(() => 0)), WAIT);
    expect(els().map(tweenCount)).toEqual(SEGMENTS.map(() => 0));
    view.unmount();
  });

  it("V6 · 属性集合审计（R8.4 delta 口径）：越界内联属性**恰是**夹具的布局属性；本件一个 `opacity` 都不写", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard");
    const view = render(<Probe />);
    await waitHandles(SEGMENTS.length);
    seekEnd();
    const props = animatedProps(els()[0]!);
    expect(props, "`transform` 必须真被写（否则本条是空真）").toContain("transform");
    expect(props.filter((p) => !CONTROL.includes(p)), "越界集合必须**恰是**夹具自己写的行内属性（delta 口径）").toEqual(LAYOUT_PROPS);
    expect(props, "🔴 墨度通道归 R11.3 的 CSS `animation` ⇒ 本件不写 `opacity`（两个动效不许互相覆盖）").not.toContain("opacity");
    expect(props.filter((p) => ["width", "height", "top", "left", "filter", "animation"].includes(p)), "位移不许动 layout / 墨度属性").toEqual([]);
    expect(() => assertAnimatable(props.filter((p) => CONTROL.includes(p)))).not.toThrow();
    expect(() => assertAnimatable(["opacity", "height"]), "阳性对照：审计器本身有牙").toThrow();
    view.unmount();
  });

  it("V7 · 文件头逐字声明（R5.2）· `controls.ts` 只经 `await import()` 到达（R41.3/R60.1）· 剥注释后零「真实语速」断言", () => {
    expect(HEADER, "文件头必须逐字写「这是字符率近似；规格未定义语速函数」").toContain("这是字符率近似；规格未定义语速函数");
    expect([HEADER.includes("字符率近似"), HEADER.includes("规格未定义语速函数")], "两个串都在文件头里").toEqual([true, true]);
    expect(SRC, "运行时入口必须是动态 import（静态 import 会让 engine 进静态闭包）").toContain('import("../../motion/controls")');
    expect(/^\s*import\s+(?!type\b)[^;]*from\s*["'][^"']*motion\/controls["']/m.test(SRC), "出现静态**值**边").toBe(false);
    expect(/^\s*import\s+type\s[^;]*from\s*["'][^"']*motion\/controls["']/m.test(SRC), "类型边是允许的唯一静态边").toBe(true);
    // 「位移只经唯一出口」（§8.4 的 8px）：起始位移必须是 `clampShift(SHIFT_MAX_PX)` 的产物，不许写死字面量
    const defOf = (code: string): string | null => /export const REVEAL_FROM_PX = ([^;]+);/.exec(code)?.[1] ?? null;
    expect(defOf("export const REVEAL_FROM_PX = " + "12;"), "仪器读不出位移定义（阴性样本也读不出）⇒ 本条空真").toBe("12");
    expect(defOf(SRC), "`REVEAL_FROM_PX` 直接写字面量 ⇒ 绕过唯一出口（M8）").toBe("clampShift(SHIFT_MAX_PX)");
    // 🔴 V2 的反面：剥注释后不得出现「真实语速 / 实际语速」这类**断言**；「语速」每处命中都要与「未定义/近似」同句
    expect(SRC, "剥注释后仍出现「真实语速 / 实际语速」").not.toMatch(/真实语速|实际语速/);
    const rows = SRC.split("\n").filter((l) => l.includes("语速"));
    expect(rows.filter((l) => !/未定义|近似/.test(l)), `「语速」必须处处与「未定义 / 近似」同句：${rows.join(" | ")}`).toEqual([]);
  });
});
