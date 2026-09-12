// @vitest-environment jsdom
/**
 * @ai-context useScaleGrowth.test.tsx — #4「刻度生长」的**行为级判据**（批 6 波 C · T30；规格 §8.6 第 4 行 ·
 *   §8.6.1 第 1/3/4 条 · 裁决 R5.4 + PB2 双精度域 · R8.1/R8.2/R8.4 · R35.4 三档自消费）。
 *
 * 判据纪律：确定性推进**只用** `test/motionHarness.ts` 的 `freezeAt`（`paused: true` + `tl.time(t)`，R8.1
 *   的唯一正解）；**禁用** `updateRoot` / `ticker.tick` / `ticker.sleep` / 真实定时器；可中断判据**双断言**
 *   （时间线计数 **且** 目标元素 `style.transform`，R8.2 —— GSAP 3 默认 `overwrite:false`，只看 transform
 *   会假绿）；属性集合审计用 `animatedProps` 的**增量**（内联属性 delta ⊆ 合成属性白名单，R8.4）。
 *
 * 每条判据 ↔ 专属变异体（读数见 task-30-report.md）：
 *   P1 ↔ 把 `intervalToScale` 换成「天数 ÷ 30」（不服 T21 的映射） · P2 ↔ `scaleYOf` 取 `scale(a)` 的**第一**
 *   个实参 / `eco` 时长不归零 · V1 ↔ 去掉 `startAt`（GSAP 从元素当前值起播 ⇒ 根本没有生长） · V2 ↔ 目标
 *   长度写成常量 · V3 ↔ 把「缺失」当 0 · V4 ↔ 每次新目标都把持有值重置为基准 · V5 ↔ 去掉 `interrupt()`
 *   （旧时间线不 kill） · V6 ↔ 降级分支不把持有值落终值 · V7 ↔ 放大 `rich` 的目标长度。
 *
 * 副作用：挂/卸真实 DOM 元素、建 GSAP 时间线（`afterEach` 收尸）、读写 `localStorage` 的档位记忆、
 *   临时改写 `window.matchMedia`（`restore()` 复原）。边界：**观感与真实帧率本批未测**（jsdom 无排版、
 *   无 paint）—— 本文件判的是**数值与状态机**，不是「看起来如何」。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { gsap } from "../../motion/engine";
import { MOTION_INTENSITY_KEY } from "../../motion/intensity";
import { assertAnimatable } from "../../motion/controls";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "../../test/motionHarness";
import { growthDurationSec, intervalToScale, scaleYOf, useScaleGrowth } from "./useScaleGrowth";
import type { ScaleGrowth } from "./useScaleGrowth";

/** T21 的映射读数（期望值**手写**在这里：与被测实现共用常量会让断言变空真） */
const BASE = 6 / 28; // 「无间隔」档（未评分 / 新卡）
const DAY1 = 8 / 28; // 1 天
const DAY30 = 1; // ≥30 天 = 满刻度

const seen: { api: ScaleGrowth | null } = { api: null };
/** 探针宿主：真实元素 + 真实 ref（只多一行捕获，不替被测代码做任何事）。 */
function Probe({ target }: { readonly target: number | null }) {
  const api = useScaleGrowth(target, { paused: true });
  seen.api = api;
  return <span data-testid="tick" ref={api.ref} />;
}
const tick = (): HTMLElement => document.querySelector('[data-testid="tick"]') as HTMLElement;
const timeline = () => seen.api!.handle.current!.timeline;
const scale = (): number => scaleYOf(currentTransform(tick()));

beforeEach(() => {
  seen.api = null;
  localStorage.clear();
});

afterEach(() => {
  seen.api?.handle.current?.interrupt();
  cleanup();
  for (const el of [...document.body.children]) {
    gsap.killTweensOf(el);
    el.remove();
  }
  seen.api = null;
});

describe("生长几何的纯函数（真源与读数口）", () => {
  it("P1 · `intervalToScale` 复用 T21 的刻度映射（1 天 ⇒ 8/28 · 30 天 ⇒ 1 · 缺失 ⇒ null）且单调不减", () => {
    expect(intervalToScale(1)).toBeCloseTo(DAY1, 9);
    expect(intervalToScale(30)).toBeCloseTo(DAY30, 9);
    expect(intervalToScale(365), "封顶后不再变高（刻度要「可感觉」不是「可测量」）").toBeCloseTo(DAY30, 9);
    expect([intervalToScale(undefined), intervalToScale(null), intervalToScale(Number.NaN)]).toEqual([null, null, null]);
    const bad = "const f = (days) => days / 30;"; // M-pure：不服 T21 映射的写法
    expect(intervalToScale(1), `不许是 ${bad} 那种「天数 ÷ 30」`).not.toBeCloseTo(1 / 30, 3);
    const series = [1, 2, 5, 10, 30, 365].map((d) => intervalToScale(d) as number);
    expect(series, "不是单调不减 ⇒ 生长方向会说谎").toEqual([...series].sort((a, b) => a - b));
    expect(series[0]).toBeGreaterThan(0); // 防空真：起点是正数（新卡不是 0 长度）
  });

  it("P2 · `scaleYOf` 读 `scale(a, b)` 的**第二**个实参；`growthDurationSec` 三档 = 0 / 220ms / 500ms", () => {
    expect(scaleYOf("")).toBe(1); // 未渲染 ⇒ 未缩放
    expect(scaleYOf("translate(0, 0)")).toBe(1); // 落定形态（GSAP 无 scale 子句时的写法）
    expect(scaleYOf("translate3d(0px, 0px, 0px) scale(1, 0.375)")).toBeCloseTo(0.375, 9);
    expect(scaleYOf("scale(0.5)")).toBeCloseTo(0.5, 9); // 单实参形态（只写了一维）
    expect(scaleYOf("scale(2, 0.25)"), "取第一个实参会把 scaleX 当 scaleY（M 就死在这里）").toBeCloseTo(0.25, 9);
    expect([growthDurationSec("eco"), growthDurationSec("standard"), growthDurationSec("rich")]).toEqual([0, 0.22, 0.5]);
  });
});

describe("刻度生长与回缩（持有 / 可中断 / 降级 / 三档）", () => {
  it("V1 · 生长：从「无间隔」档长到满刻度；落定后 transform 逐字回到 T21 的静态形态；属性集合只有 transform", async () => {
    render(<Probe target={DAY30} />);
    await waitFor(() => expect(seen.api?.handle.current, "动态 import 未到达 ⇒ 下面全是空真").not.toBeNull());
    const el = tick();
    const tl = timeline();
    expect(tl.duration(), "standard 档 = --ed-dur-card(220ms)").toBeCloseTo(0.22, 6);
    freezeAt(tl, 0);
    // 容差 3 位：GSAP 的 `_round` 把 transform 分量按 4 位小数串行化（实测 0.21428571428571427 → 0.2143）
    expect(scale(), "起始态 = 持有的「无间隔」档（不是 0、也不是终值）").toBeCloseTo(BASE, 3);
    expect(scale()).toBeGreaterThan(0);
    expect(scale(), "若从元素旧值起播，这里会是 1（= 没有生长）").toBeLessThan(1);
    freezeAt(tl, 0.11);
    const mid = scale();
    expect(mid, "中途必须落在两端之间（否则「生长」是瞬切）").toBeGreaterThan(BASE);
    expect(mid).toBeLessThan(DAY30);
    expect(seen.api!.length.current, "持有值 == 已写进 DOM 的长度 × 目标").toBeCloseTo(mid * DAY30, 9);
    freezeAt(tl, 0.22);
    expect(currentTransform(el), "落定 = scaleY 1 ⇒ 退化为 no-op（刻度逐字是 T21 的静态形态）").toBe("translate(0, 0)");
    expect(seen.api!.length.current).toBeCloseTo(DAY30, 9);

    // R8.4 属性集合审计：本 hook（含起始态物化）写进内联样式的属性**全部**落在合成族白名单内，
    // 且**零 layout 属性**（`height` 是 T21 画的分段几何，动它就会触发排版）。GSAP 在 jsdom 下还会把
    // 三个独立 transform 属性显式置 `none`（`CSSPlugin.js:859-866`）——它们同属白名单，故断言按**集合**判。
    const props = animatedProps(el);
    expect(props, "transform 必须是被写的属性之一（否则动的是别的通道）").toContain("transform");
    expect(props.filter((p) => !["transform", "translate", "rotate", "scale", "opacity", "filter"].includes(p))).toEqual([]);
    expect(() => assertAnimatable(props)).not.toThrow();
    expect(props.filter((p) => p === "height" || p === "width"), "生长不许动 layout 属性").toEqual([]);
  });

  it("V2 · 答「忘了」⇒ 回缩：精确值 30 → 1，终值必须不到起始值的一半，且落定回静态形态", async () => {
    const view = render(<Probe target={DAY30} />);
    await waitFor(() => expect(seen.api?.handle.current).not.toBeNull());
    const first = seen.api!.handle.current!;
    freezeAt(first.timeline, 0.22);
    const grown = seen.api!.length.current;
    expect(grown).toBeCloseTo(DAY30, 9);

    view.rerender(<Probe target={DAY1} />);
    await waitFor(() => expect(seen.api!.handle.current!.timeline).not.toBe(first.timeline));
    const second = timeline();
    freezeAt(second, 0);
    expect(scale(), "回缩的起点 = 接管时刻的当前长度（大于 1 ⇒ 此刻比自然形态高）").toBeGreaterThan(1);
    freezeAt(second, 0.22);
    expect(seen.api!.length.current).toBeCloseTo(DAY1, 9);
    expect(seen.api!.length.current, "方向断言：终值 < 起始值的 1/2（「忘了」= 回缩）").toBeLessThan(grown / 2);
    expect(currentTransform(tick())).toBe("translate(0, 0)");
  });

  it("V3 · 缺 `intervalDays`（null）⇒ 不生长、不抛、不猜（「缺失」≠「间隔为 0」）", () => {
    render(<Probe target={null} />); // 缺失分支**不经**动态 import ⇒ 本条全同步
    expect(seen.api!.handle.current, "缺失 ⇒ 不许建 timeline").toBeNull();
    expect(tweenCount(tick())).toBe(0);
    expect(currentTransform(tick())).toBe(""); // 零 inline transform：刻度的静态形态不动
    expect(seen.api!.length.current, "持有值保持「无间隔」档（M3 把它写成 0 就死在这里）").toBeCloseTo(BASE, 9);
  });

  it("V4 · 起始态被持有：中途换更小的目标 ⇒ 从**当前长度**回播（不跳回起点、也不跳 0）", async () => {
    const view = render(<Probe target={DAY30} />);
    await waitFor(() => expect(seen.api?.handle.current).not.toBeNull());
    const first = timeline();
    freezeAt(first, 0.11);
    const mid = seen.api!.length.current;
    expect(mid, "防空真：中途读数必须真的在两端之间").toBeGreaterThan(BASE);
    expect(mid).toBeLessThan(DAY30);

    view.rerender(<Probe target={DAY1} />);
    await waitFor(() => expect(seen.api!.handle.current!.timeline).not.toBe(first));
    freezeAt(timeline(), 0);
    expect(scale(), "新轨迹起点 = 中途长度 ÷ 新目标（若从基准/0 重来，这个读数会不同）").toBeCloseTo(mid / DAY1, 6);
    freezeAt(timeline(), 0.22);
    expect(seen.api!.length.current).toBeCloseTo(DAY1, 9);
  });

  it("V5 · 可中断（双断言）：连续两个目标 ⇒ 时间线不累积 **且** DOM 归新 tween（R8.2）", async () => {
    expect(gsap.globalTimeline.getChildren(), "同文件残留 ⇒ 下面的精确计数会被做假").toHaveLength(0);
    const view = render(<Probe target={DAY30} />);
    await waitFor(() => expect(seen.api?.handle.current).not.toBeNull());
    const first = seen.api!.handle.current!;
    freezeAt(first.timeline, 0.11);
    expect(gsap.globalTimeline.getChildren(), "1 条时间线 + 它的 1 个 tween（默认**递归**口径 = 2）").toHaveLength(2);
    expect(gsap.globalTimeline.getChildren(false, true, true), "只数直接子项（规范字面的「1」是这一口径）").toHaveLength(1);
    const midDom = currentTransform(tick());

    view.rerender(<Probe target={DAY1} />);
    await waitFor(() => expect(seen.api!.handle.current!.timeline).not.toBe(first.timeline));
    const second = seen.api!.handle.current!;
    expect(gsap.globalTimeline.getChildren(), "旧时间线还在 ⇒ 那是「覆盖」不是「接管」（M5 死在这里）").toHaveLength(2);
    expect(gsap.globalTimeline.getChildren(false, true, true)).toHaveLength(1);
    expect(tweenCount(tick()), "目标上只许剩新 tween 一条").toBe(1);
    freezeAt(second.timeline, 0.22);
    expect(currentTransform(tick()), "DOM 半边：值必须归**新** tween（只看这一半会假绿）").not.toBe(midDom);
    expect(scale()).toBeCloseTo(1, 6);
  });

  it("V6 · reduced-motion（系统优先于档位）⇒ 跳终态、零 tween、持有值同步落终值", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard"); // 档位记忆 = standard ⇒ 时长分支不走 eco
    const stub = installMatchMediaStub({ reduce: true });
    try {
      render(<Probe target={DAY30} />);
      await waitFor(() => expect(seen.api?.handle.current).not.toBeNull());
      expect(tweenCount(tick()), "命中 reduce 仍建 tween ⇒ 有运动（§8.6.1 第 4 条）").toBe(0);
      expect(seen.api!.handle.current!.timeline.getChildren(), "出口的惰性时间线里不许有 tween").toHaveLength(0);
      expect(scale(), "「跳终态」= 落终值，不是「不播」（M6 死在这一行）").toBeCloseTo(1, 6);
      expect(seen.api!.length.current).toBeCloseTo(DAY30, 9);
    } finally {
      stub.restore();
    }
  });

  it("V7 · 三档：eco 不建 timeline（跳终态）· standard 220ms · rich 500ms —— 目标长度逐档完全相同", async () => {
    const durations: (number | null)[] = [];
    const targets: number[] = [];
    expect(DAY1, "防真空：目标必须与起始态不同，否则「跳终态」看不出来").not.toBeCloseTo(BASE, 6);
    for (const tier of ["eco", "standard", "rich"] as const) {
      localStorage.setItem(MOTION_INTENSITY_KEY, tier);
      const view = render(<Probe target={DAY1} />);
      if (tier === "eco") {
        // eco 也不经编排 timeline：终态由出口的零时长 tween 写（走动态 import ⇒ 等它到达）
        await waitFor(() => expect(seen.api!.length.current).toBeCloseTo(DAY1, 3));
        expect(seen.api!.handle.current, "§8.5：节能档 ⇒ 编排层直接跳终态（不建编排 timeline）").toBeNull();
        expect(tweenCount(tick())).toBe(0);
        expect(scale(), "终态 = 静态形态（刻度就是 T21 画的那一段）").toBeCloseTo(1, 3);
        durations.push(null);
      } else {
        await waitFor(() => expect(seen.api?.handle.current).not.toBeNull());
        durations.push(timeline().duration());
        freezeAt(timeline(), timeline().duration());
      }
      targets.push(seen.api!.length.current);
      view.unmount();
    }
    expect(durations[0]).toBeNull();
    expect(durations[1]).toBeCloseTo(0.22, 6);
    expect(durations[2]).toBeCloseTo(0.5, 6);
    expect(durations[2] as number, "「丰富」= 更长，不是更少").toBeGreaterThan(durations[1] as number);
    expect(targets, "档位只改时长，不篡改读数（M7 放大 rich 的目标长度就死在这里）").toEqual([DAY1, DAY1, DAY1]);
  });
});
