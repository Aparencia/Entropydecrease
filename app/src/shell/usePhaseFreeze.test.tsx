// @vitest-environment jsdom
/**
 * @ai-context usePhaseFreeze.test.tsx — #3「相变凝固」的**行为级判据**（批 6 波 C · T29；规格 §8.6 第 3 行 ·
 *   §8.6.1 第 1/3/4 条 · 裁决 R5.3 / R4.5 / R8.1 / R8.2 / R8.4 / R35.4）。
 *
 * 判据纪律：确定性推进**只用** `test/motionHarness.ts` 的 `freezeAt`（`paused: true` + `tl.time(t)`，R8.1
 *   的唯一正解）；**禁用** `updateRoot` / `ticker.tick` / `ticker.sleep` / 真实定时器；可中断判据**双断言**
 *   （时间线计数**两种口径都断** + DOM 半边，R8.2 / R35①）；属性集合审计用**内联属性增量**（R8.4）。
 *   ⚠️ 每次 `freezeAt` 都包在 `act()` 里 —— 编排层每帧 `setState`（持有值），不 flush 就读不到新一帧的条高。
 *
 * 每条判据 ↔ 专属变异体（读数见 task-29-report.md；变异体只在 `git archive` 导出副本里做）：
 *   P1 ↔ 兜底：`inkOpacity` 退成 `1 - freeze` / standard 时长写成字面量 · F2 ↔ 条高不随 `freeze` 走（只改墨度）
 *   · F3 ↔ 新时间线**不读**持有值（起始态不持有）· F4 ↔ 去掉 `interrupt()`（旧时间线不 kill）·
 *   F5 ↔ 降级分支不写终值 · F6 ↔ `eco` 走 220ms 档 · F7 ↔ 用 `height` 做收束 ·
 *   F8 ↔ 退去规则写 `#d97706` / 写 `--ed-ink-2` · F9 ↔ 摘掉 `PhaseChrome` 的 `phase` 转发。
 *
 * 副作用：挂/卸真实 DOM 元素、建 GSAP 时间线（`afterEach` 收尸）、读写 `localStorage` 的档位记忆、
 *   临时改写 `window.matchMedia`（`restore()` 复原）、`@tauri-apps/api/event` 按仓内范式桩掉。
 * 边界：**观感与真实帧率本批未测**（jsdom 无排版、无 paint）—— 本文件判的是**数值与状态机**；
 *   「真的收束成一条直线」「导航真的淡入」等像素面进报告 `## 诚实边界`。
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsap } from "../motion/engine";
import { assertAnimatable } from "../motion/controls";
import { MOTION_INTENSITY_KEY } from "../motion/intensity";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "../test/motionHarness";
import Waveform, { WAVEFORM_GROOVE_SCALE, barScale } from "../components/Waveform";
import {
  DUE_INK_NORMAL, freezeDurationSec, freezeTarget, inkFreezeOf, inkOpacity, staggeredFreeze, usePhaseFreeze,
} from "./usePhaseFreeze";
import type { PhaseFreeze } from "./usePhaseFreeze";
import type { ShellPhase } from "./shellPhase";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

const HERE = dirname(fileURLToPath(import.meta.url));
const MOTION_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "motion.css"), "utf8");
/** 采样 `rms`：8 条里点亮 5 条 ⇒ 两种条高都在（波形有起伏，收束才有得看）。 */
const RMS = 0.1;
const CONTROL = ["transform", "translate", "rotate", "scale", "opacity", "filter"];
const seen: { api: PhaseFreeze | null } = { api: null };
/** 探针宿主：真实元素 + 真实 ref + 真的把 `barsFreeze` 交给 `Waveform`（= `LiveBar` 的接线形态）。 */
function Probe({ phase }: { readonly phase: ShellPhase }) {
  const api = usePhaseFreeze(phase, { paused: true });
  seen.api = api;
  return (
    <div>
      <div data-testid="ink" ref={api.inkRef} />
      <Waveform rms={RMS} clipping={false} bars={8} testId="probe-wave" freeze={api.barsFreeze} />
    </div>
  );
}
const need = (sel: string): HTMLElement => {
  const el = document.body.querySelector<HTMLElement>(sel);
  if (el === null) throw new Error(`找不到元素：${sel}`);
  return el;
};
const ink = (): HTMLElement => need('[data-testid="ink"]');
const bars = (): HTMLElement[] => Array.from(need('[data-testid="probe-wave"]').children) as HTMLElement[];
const inkNow = (): number => Number.parseFloat(ink().style.opacity);
/** 逐条条高（`Waveform` 只经 `scaleY` 表达几何 ⇒ 这是唯一的读数口）。 */
const scales = (): number[] =>
  bars().map((b) => Number.parseFloat(/scaleY\(([^)]+)\)/.exec(b.style.transform)?.[1] ?? "NaN"));
const distinct = (xs: readonly number[]): number => new Set(xs).size;
const timeline = () => seen.api!.handle.current!.timeline;
/** 确定性推进（R8.1）：paused timeline + `tl.time(t)`，并 flush 编排层的 setState。 */
const seek = (t: number): void => {
  act(() => {
    freezeAt(timeline(), t);
  });
};
/** 翻一次相位并等动态 import 到达（`waitFor` 只等 import，不等墙钟动画）。 */
async function flip(view: { rerender: (ui: React.ReactElement) => void }, phase: ShellPhase): Promise<void> {
  const before = seen.api?.handle.current ?? null;
  view.rerender(<Probe phase={phase} />);
  await waitFor(() => expect(seen.api?.handle.current).not.toBe(before));
}
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

describe("P1 · 相变几何与档位的纯函数（真源与读数口）", () => {
  it("三态终值 · 墨度映射与其反解 · 三档时长（逐序数组）· 常态档 == 环境层波谷 0.72", () => {
    expect([freezeTarget("capture"), freezeTarget("idle"), freezeTarget("review")], "相位 ⇒ 凝固终值").toEqual([0, 1, 1]);
    expect([inkOpacity(0), inkOpacity(1)], "采集档 = 满墨 · 常态档 = DUE_INK_NORMAL").toEqual([1, DUE_INK_NORMAL]);
    expect(inkFreezeOf(String(inkOpacity(0.37))), "反解必须回到原值（编排层每帧靠它拿持有量）").toBeCloseTo(0.37, 9);
    expect([inkFreezeOf(""), inkFreezeOf("abc")], "读不到 ⇒ null（不许假装 0）").toEqual([null, null]);
    expect([freezeDurationSec("eco"), freezeDurationSec("standard"), freezeDurationSec("rich")]).toEqual([0, 0.22, 0.5]);
    // 常态档这一个数**只有一个落点**（编排层的常量），且它就是环境层 `ed-due-glow` 的波谷（复用既有数字）
    const glow = MOTION_CSS.slice(MOTION_CSS.indexOf("@keyframes ed-due-glow"));
    expect(glow.slice(0, glow.indexOf("}")), "常态档墨度必须与既有波谷同值，不许新造").toContain(String(DUE_INK_NORMAL));
    expect(DUE_INK_NORMAL, "退到常态档 ≠ 退成 0（墨度有档，不是消失）").toBeGreaterThan(0);
  });

  it("错开只发生在 rich：standard / eco 下波形与琥珀同一条；rich 下波形滞后且两端仍对齐", () => {
    expect([staggeredFreeze(0.5, "standard"), staggeredFreeze(0.5, "eco")]).toEqual([0.5, 0.5]);
    expect(staggeredFreeze(0.5, "rich"), "rich 的波形滞后于琥珀（三段错开）").toBeLessThan(0.5);
    expect([staggeredFreeze(0, "rich"), staggeredFreeze(1, "rich")], "两端必须对齐（不许错开掉终点）").toEqual([0, 1]);
  });

  it("条高映射两端逐字、单调、全定义域安全（P1 的第二半：收束的几何契约）", () => {
    expect([barScale(true, 0), barScale(false, 0), barScale(true, 1), barScale(false, 1)]).toEqual([
      1, WAVEFORM_GROOVE_SCALE, WAVEFORM_GROOVE_SCALE, WAVEFORM_GROOVE_SCALE,
    ]);
    const lit = Array.from({ length: 21 }, (_, i) => barScale(true, i / 20));
    expect(lit.filter((v, i) => i > 0 && v > lit[i - 1]), "点亮条随 freeze 单调收拢（不许回弹）").toEqual([]);
    expect([barScale(true, Number.NaN), barScale(false, 9), barScale(true, -9)]).toEqual([1, WAVEFORM_GROOVE_SCALE, 1]);
  });
});

describe("F2~F3 · 正向相变（收束 + 退去）与可反向", () => {
  it("F2 · 采集→常态：中途两端逐条读数（墨度 1 → 0.72 · 条高两组 → 一组）", async () => {
    const view = render(<Probe phase="capture" />);
    expect(seen.api!.handle.current, "相位未变（挂载）⇒ 不建时间线").toBeNull();
    await flip(view, "idle");
    expect(timeline().duration(), "standard 档 = --ed-dur-card(220ms)").toBeCloseTo(0.22, 6);
    seek(0);
    expect(inkNow(), "起始态被物化 = 采集档满墨").toBeCloseTo(1, 3);
    expect(distinct(scales()), "freeze=0 ⇒ 条高不止一个值（波形有起伏）").toBeGreaterThan(1);
    seek(0.11);
    const mid = seen.api!.freeze;
    expect(mid, "中途读数必须严格落在两端之间").toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(inkNow(), "持有值 == 已写进 DOM 的墨度（同源）").toBeCloseTo(inkOpacity(mid), 3);
    expect(distinct(scales()), "中途仍是有起伏的波形").toBeGreaterThan(1);
    seek(0.22);
    expect(inkNow(), "落定 = 常态档墨度（琥珀退去）").toBeCloseTo(DUE_INK_NORMAL, 3);
    expect(scales(), "落定 = 所有条同一高度（收束成直线）").toEqual(
      Array.from({ length: 8 }, () => WAVEFORM_GROOVE_SCALE),
    );
    expect(seen.api!.freeze).toBeCloseTo(1, 6);
  });

  it("F3 · 可反向且起始态**被持有**：中途反向 ⇒ 新时间线 t=0 就是中途值（不跳起点、不跳终值）", async () => {
    const view = render(<Probe phase="capture" />);
    await flip(view, "idle");
    seek(0.11);
    const midInk = inkNow();
    const midFreeze = seen.api!.freeze;
    const midScales = scales();
    expect(
      [midFreeze > 0, midFreeze < 1, distinct(midScales) > 1],
      "防空真：中途读数必须严格在两端之间（否则下面的「接着走」断言是空真）",
    ).toEqual([true, true, true]);

    await flip(view, "capture"); // 反向：常态 → 采集
    expect(seen.api!.freeze, "反向触发瞬间：持有值不被重置为终值").toBeCloseTo(midFreeze, 6);
    expect(inkNow(), "反向的 t=0 = 中途墨度（若从终值重来，这里会是 0.72）").toBeCloseTo(midInk, 3);
    expect(scales(), "波形也从**中途**接着走（不是跳回采集形态）").toEqual(midScales);
    seek(timeline().duration());
    expect(inkNow(), "反向落定 = 回到采集档满墨").toBeCloseTo(1, 3);
    expect(distinct(scales()), "波形回到有起伏的活形态").toBeGreaterThan(1);
    expect(seen.api!.freeze, "反向落定 = 凝固进度回到 0").toBeCloseTo(0, 6);
  });
});

describe("F4~F5 · 可中断（双断言）与 reduced-motion 降级", () => {
  it("F4 · 下一个输入接管：时间线不累积（两种口径都断）· 旧句柄推播放头也不再写 DOM · 条高归新一帧", async () => {
    const view = render(<Probe phase="capture" />);
    await flip(view, "idle");
    const first = seen.api!.handle.current!;
    seek(0.11);
    // 🔴 双断言第一半：**两种口径都断**（默认递归 = 2 / `getChildren(false,true,true)` = 1，R35①）
    expect(gsap.globalTimeline.getChildren(), "1 条时间线 + 它的 1 个 tween（默认**递归**口径 = 2）").toHaveLength(2);
    expect(gsap.globalTimeline.getChildren(false, true, true), "只数直接子项（= 1）").toHaveLength(1);
    expect(tweenCount(ink())).toBe(1);
    const midInk = inkNow();
    const midBar = currentTransform(bars()[0]);

    await flip(view, "capture"); // 第二个输入
    expect(seen.api!.handle.current!.timeline, "新句柄必须是新时间线").not.toBe(first.timeline);
    expect(gsap.globalTimeline.getChildren(), "旧时间线还在 ⇒ 那是「覆盖」不是「接管」").toHaveLength(2);
    expect(gsap.globalTimeline.getChildren(false, true, true), "直接子项仍须是 1（旧时间线被 kill）").toHaveLength(1);
    expect(tweenCount(ink()), "目标上只许剩新 tween 一条").toBe(1);
    const frozen = inkNow();
    act(() => {
      freezeAt(first.timeline, 1); // 旧句柄：kill 之后推它的播放头**不许**再写 DOM
    });
    expect(inkNow(), "旧时间线还能写 DOM ⇒ 没真 kill（子 tween 变成孤儿）").toBeCloseTo(frozen, 6);
    seek(0);
    // 🔴 双断言第二半（DOM）：只看计数会假绿（R8.2）
    expect(inkNow(), "DOM 半边：值归**新** tween（只断计数会假绿）").toBeCloseTo(midInk, 3);
    expect(currentTransform(bars()[0]), "DOM 半边：条高也归新一帧").toBe(midBar);
    // 反空真放在**最后**（放最前会把上面几条本该点名的红遮成一条「残留」）：结束时场上只许剩
    // 「当前那条时间线 + 它的 tween」（默认递归 = 2 / 直接子项 = 1）—— 多出来的就是没被收尸的旧时间线。
    expect(gsap.globalTimeline.getChildren(), "用例结束仍有残留时间线 ⇒ 旧时间线没被收尸").toHaveLength(2);
    expect(gsap.globalTimeline.getChildren(false, true, true)).toHaveLength(1);
  });

  it("F5 · reduced-motion（系统优先于档位）⇒ 跳终态、零 tween、波形成直线", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard"); // 档位记忆 = standard ⇒ 不走 eco 分支
    const stub = installMatchMediaStub({ reduce: true });
    try {
      const view = render(<Probe phase="capture" />);
      await flip(view, "idle");
      expect(tweenCount(ink()), "命中 reduce 仍建 tween ⇒ 有运动（§8.6.1 第 4 条）").toBe(0);
      expect(seen.api!.handle.current!.timeline.getChildren(), "出口的惰性时间线里不许有 tween").toHaveLength(0);
      expect(seen.api!.freeze).toBeCloseTo(1, 6);
      expect(inkNow(), "「跳终态」= 落终值，不是「不播」").toBeCloseTo(DUE_INK_NORMAL, 3);
      expect(distinct(scales()), "波形成直线").toBe(1);
    } finally {
      stub.restore();
    }
  });
});

describe("F6~F7 · 三档自消费（R35.4）与属性集合审计（R8.4）", () => {
  it("F6 · eco 不建编排 timeline（跳终态）· standard 220ms · rich 500ms —— 且 rich 才错开", async () => {
    const durations: (number | null)[] = [];
    const gaps: number[] = [];
    for (const tier of ["eco", "standard", "rich"] as const) {
      localStorage.setItem(MOTION_INTENSITY_KEY, tier);
      const view = render(<Probe phase="capture" />);
      view.rerender(<Probe phase="idle" />);
      if (tier === "eco") {
        // eco 也不经编排 timeline：终态由出口的零时长 tween 写（走动态 import ⇒ 等它到达）
        await waitFor(() => expect(seen.api!.freeze).toBeCloseTo(1, 3));
        expect(seen.api!.handle.current, "§8.5：节能档 ⇒ 编排层直接跳终态（不建编排 timeline）").toBeNull();
        expect(tweenCount(ink())).toBe(0);
        expect(inkNow(), "终态 = 常态档墨度").toBeCloseTo(DUE_INK_NORMAL, 3);
        durations.push(null);
      } else {
        await flip(view, "idle");
        durations.push(timeline().duration());
        seek(timeline().duration() / 2);
        gaps.push(seen.api!.freeze - seen.api!.barsFreeze);
        seek(timeline().duration());
      }
      view.unmount();
    }
    expect(durations).toEqual([null, 0.22, 0.5]);
    expect(durations[2] as number, "「丰富」= 更长，不是更少").toBeGreaterThan(durations[1] as number);
    expect(gaps[0], "standard：波形与琥珀同一条（不错开）").toBeCloseTo(0, 9);
    expect(gaps[1], "rich：波形滞后 ⇒ 三段错开更明显").toBeGreaterThan(0);
    expect(freezeDurationSec("standard") * 1000, "与 T19 相位块**同拍**：同一个 --ed-dur-card(220ms)").toBe(220);
    expect(MOTION_CSS.slice(MOTION_CSS.indexOf(".shell-phase__idle {")).slice(0, 120)).toContain("var(--ed-dur-card, 220ms)");
  });

  it("F7 · 属性集合审计：墨度层被写的内联属性 ⊆ 合成属性白名单（零 layout 属性）", async () => {
    const view = render(<Probe phase="capture" />);
    await flip(view, "idle");
    seek(0.22);
    const props = animatedProps(ink());
    expect(props, "transform / opacity 至少一个真被写（否则本条是空真）").toContain("opacity");
    expect(props.filter((p) => !CONTROL.includes(p)), "越出合成属性白名单（会触发排版）").toEqual([]);
    expect(() => assertAnimatable(props)).not.toThrow();
    expect(props.filter((p) => p === "height" || p === "width" || p === "margin")).toEqual([]);
    // 阳性对照：同一台审计器在违规样本上必须抛（防空真）
    expect(() => assertAnimatable(["opacity", "height"])).toThrow();
    view.unmount();
  });
});
