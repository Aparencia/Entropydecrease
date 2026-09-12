// @vitest-environment jsdom
/**
 * @ai-context useRevealMemory.test.tsx — #6「记忆浮现」四段动效的**行为级判据**（批 6 波 C · T32）。
 *   规格 §8.6 第 6 行 · §8.6.1 第 1/3/4 条 · 裁决 R5.6（「用 `x` 而非 `letterSpacing`」= **硬判据**）·
 *   R8.1（确定性推进）/ R8.2（可中断**双断言**）/ R8.4（属性集合审计 = 60fps 的代理）/ R48.1 · R35.4（三档自消费）。
 *
 * 判据纪律：确定性推进**只用** `test/motionHarness.ts` 的 `freezeAt`（`paused: true` + `tl.time(t)`，R8.1 的
 *   唯一正解）；**禁用** `updateRoot` / `ticker.tick` / `ticker.sleep` / 真实定时器；可中断判据**双断言**
 *   （时间线计数 **且** DOM 归新 tween，R8.2）；属性集合审计用 `animatedProps` 的**增量**（内联属性 delta ⊆
 *   合成属性白名单，R8.4）。⚠️ 探针元素**不带静态样式** ⇒ 观测到的起始形态只能来自 hook 自己的零时长写入。
 *
 * 每条判据 ↔ 专属变异体（读数见 task-32-report.md）：P1 ↔ 两段同起点 · P2 ↔ `scaleXOf` 取第二个实参 ·
 *   V1 ↔ 字距收敛写成 `letterSpacing` tween（**三条独立齿**）· V2 ↔ 删掉第四段 · V3 ↔ 洇开改 `duration: 0` ·
 *   V4 ↔ 底纹 `transform-origin: right` · V5 ↔ 收起不重置持有量 · V6 ↔ 去掉 `interrupt()` ·
 *   V7 ↔ 降级只跳过建 tween 后的播放 · V8 ↔ `rich` 设 1000ms · V9 ↔ 用 `height` 做洇开。
 *
 * 边界：**观感与真实帧率本批未测**（jsdom 无排版 / 无 paint，`getBoundingClientRect` 恒 0）—— 本文件判的是
 *   数值、时序与状态机，**不是**「看起来如何」；`.ed-text` 的 `color` transition 是否真的在浏览器里补间，
 *   jsdom 不可判（本文件只判它的**触发条件**：两相翻档）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { gsap } from "../../motion/engine";
import { assertAnimatable } from "../../motion/controls";
import { ANIMATABLE_PROPERTIES } from "../../motion/shift";
import { MOTION_INTENSITY_KEY } from "../../motion/intensity";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "../../test/motionHarness";
import {
  INK_FROM, RATE_FROM_PX, REVEAL_SEGMENTS, TRACK_FROM_PX, inkTone, revealDurationSec, revealStateAt,
  scaleXOf, segmentWindow, useRevealMemory, type RevealMemory, type RevealSegment,
} from "./useRevealMemory";

/** 🔴 硬判据的被扫串一律**拼接构造**：本文件也在扫描域内（`app/src/**`）⇒ 源码里出现完整串会**自伤**
 *  （同 `motionHarness.test.ts` V4b 与 `engine.guard.test.ts` 的先例）。静态齿见面板测试 P4。 */
const LS = "letter" + "Spacing";
const LSK = "letter" + "-spacing";
/** 四段的**逐序**口径（判据里一律用这个数组做键，避免「恰 N 个」类断言写成松散形态）。 */
const SEGS: readonly RevealSegment[] = ["ink", "track", "clip", "rate"];
const IDS = ["ink", "track", "clip", "rate"] as const;
/** 起始 / 终形态（期望值**手写**在这里：与被测实现共用常量会让断言变空真）。 */
const STARTS = [0.35, 4, 0, 0];
const ENDS = [1, 0, 1, 1];

/** 探针宿主：真实元素 + 真实 ref（只多一行捕获，不替被测代码做任何事）。 */
const seen: { api: RevealMemory | null; tones: string[] } = { api: null, tones: [] };
function Probe({ revealed }: { readonly revealed: boolean }) {
  const api = useRevealMemory(revealed, { paused: true });
  seen.api = api;
  seen.tones.push(inkTone(api.inked)); // 每次渲染记一档 ⇒「两相翻档」的机器读数
  return (
    <div>
      {/* `transformOrigin` 是**静态**样式（生产侧同款）：它不进被动画属性集合 —— 用增量口径读集合 */}
      <div data-testid="ink" ref={api.ink} />
      <div data-testid="track" ref={api.track} />
      <div data-testid="clip" ref={api.clip} style={{ transformOrigin: "left center" }} />
      <div data-testid="rate" ref={api.rate} />
    </div>
  );
}

const el = (id: (typeof IDS)[number]): HTMLElement => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
/** `translate*()` 串里第 `i` 个实参（px；无 translate 子句 ⇒ 0）—— 位移读数的唯一读口。 */
function translateArg(transform: string, i: number): number {
  const args = (/translate3?d?\(([^)]*)\)/.exec(transform)?.[1] ?? "").split(",");
  const v = Number.parseFloat(args[i] ?? "");
  return Number.isFinite(v) ? v : 0;
}
/** 四件的**逐序**读数：①不透明度 ②答案层 x ③底纹 scaleX ④评分行不透明度。 */
const readAll = (): number[] => [
  Number(el("ink").style.opacity),
  translateArg(currentTransform(el("track")), 0),
  scaleXOf(currentTransform(el("clip"))),
  Number(el("rate").style.opacity),
];
const handleTl = () => seen.api!.handle.current!.timeline;
/** 展开成 timeline 已在场（动态 import 已到达）——「未到达」时下面全是空真。 */
const waitHandle = async (): Promise<void> => waitFor(() => expect(seen.api?.handle.current).not.toBeNull());

beforeEach(() => {
  seen.api = null;
  seen.tones = [];
  localStorage.clear();
});

afterEach(() => {
  seen.api?.handle.current?.interrupt();
  cleanup();
  for (const node of [...document.body.children]) {
    gsap.killTweensOf(node);
    node.remove();
  }
  seen.api = null;
});

describe("编排几何的纯函数（真源与读数口）", () => {
  it("P1 · 三档总时长 0 / 500 / 720ms；四段起点**逐序严格递增**（错开）且末段在总时长处收口", () => {
    expect([revealDurationSec("eco"), revealDurationSec("standard"), revealDurationSec("rich")]).toEqual([0, 0.5, 0.72]);
    expect(revealDurationSec("rich"), "§8.5「编排层加长」").toBeGreaterThan(revealDurationSec("standard"));
    expect(revealDurationSec("rich"), "§8.1 编排层带的上界 900ms").toBeLessThanOrEqual(0.9);
    const total = 0.5;
    const ats = SEGS.map((s) => segmentWindow(total, s).at);
    expect(ats, "四段起点逐序（M-P1：两段同起点会死在这里）").toEqual([0, total / 6, total / 3, total / 2]);
    expect(new Set(ats).size, "起点必须互不相同 = 错开").toBe(4);
    const last = segmentWindow(total, "rate");
    expect(last.at + last.duration, "末段收口 ⇒ timeline.duration() == 总时长").toBeCloseTo(total, 9);
    expect(REVEAL_SEGMENTS.rate.at, "④「随后」浮起：最后一段才动").toBeGreaterThan(REVEAL_SEGMENTS.ink.at);
  });

  it("P2 · `revealStateAt` 两端逐字 / 单调；`scaleXOf` 取**第一**个实参；`inkTone` 低档是 ink-3 不是 ink-4", () => {
    const start = revealStateAt(0);
    expect([start.ink, start.track, start.clip, start.rate, start.lift]).toEqual([0.35, 4, 0, 0, 8]);
    const end = revealStateAt(1);
    expect([end.ink, end.track, end.clip, end.rate, end.lift]).toEqual([1, 0, 1, 1, 0]);
    expect([revealStateAt(Number.NaN).ink, revealStateAt(-1).ink, revealStateAt(9).ink], "越界/非法一律夹回两端，不抛")
      .toEqual([INK_FROM, INK_FROM, 1]);
    const mid = [0.1, 0.2, 0.3, 0.4].map((p) => revealStateAt(p).ink); // 全在①的窗口 [0, 0.5] 内
    expect(mid, "洇开必须单调不减（回落 = 方向说谎）").toEqual([...mid].sort((a, b) => a - b));
    expect(mid[0], "防空真：中途读数必须真的离开起点").toBeGreaterThan(INK_FROM);
    expect(mid[3]).toBeLessThan(1);

    expect(scaleXOf("")).toBe(1); // 未渲染 ⇒ 未缩放
    expect(scaleXOf("translate(0, 0)")).toBe(1); // 落定形态
    expect(scaleXOf("translate(0, 0) scale(0.375, 1)"), "第一个实参才是 scaleX").toBeCloseTo(0.375, 9);
    expect(scaleXOf("scale(2, 0.25)"), "取第二个实参 = 把 scaleY 当 scaleX（M-P2 死在这里）").toBeCloseTo(2, 9);
    expect([TRACK_FROM_PX, RATE_FROM_PX], "位移一律 ≤ §8.4 的 8px 上界").toEqual([4, 8]);
    expect(RATE_FROM_PX).toBeLessThanOrEqual(8);
    expect([inkTone(false), inkTone(true)], "低档 = ink-3（ink-4 是过渡态，不得承载唯一关键信息）").toEqual(["ink-3", "ink-1"]);
  });
});

describe("四段动效（硬判据 / 错开 / 洇开 / 左刷 / 持有 / 中断 / 降级 / 三档）", () => {
  it("V1 · 🔴 硬判据（R5.6）**运行时齿**：四件的内联属性集合不含字距（静态齿在 ReviewSessionPanel.test.tsx P4）", async () => {
    render(<Probe revealed />);
    await waitHandle();
    freezeAt(handleTl(), 0.5);
    for (const id of IDS) {
      const props = animatedProps(el(id));
      expect([props.includes(LS), props.includes(LSK)], `${id} 动了字距（layout 属性会重排，M1 死在这里）`)
        .toEqual([false, false]);
    }
  });

  it("V2 · 四段**各自动**（四段各自的采样点）且 t=0.05 时只有①在动（错开，逐序数组相等）", async () => {
    render(<Probe revealed />);
    await waitHandle();
    const tl = handleTl();
    freezeAt(tl, 0);
    expect(readAll(), "t=0 四件都在**起始**形态（由 hook 的零时长写入物化，不是 React 静态样式）").toEqual(STARTS);
    expect(translateArg(currentTransform(el("rate")), 1), "④的浮起起点 = 8px 上界").toBe(8);
    freezeAt(tl, 0.05);
    expect(
      readAll().map((v, i) => v !== STARTS[i]),
      "错开：②③④的起点是 1/6·1/3·1/2 ⇒ t=0.05 只许①动",
    ).toEqual([true, false, false, false]);
    // 四段各自的采样点（都在自己窗口内部）+ 各自都不在两端（M2：删掉第四段 ⇒ 第四位 false）
    const samples = [0.05, 0.15, 0.25, 0.35];
    const between = SEGS.map((seg, i) => {
      freezeAt(tl, samples[i]);
      const v = readAll()[i];
      expect(segmentWindow(0.5, seg).at, "采样点必须落在该段窗口内").toBeLessThanOrEqual(samples[i]);
      return v !== STARTS[i] && v !== ENDS[i];
    });
    expect(between, "四段必须各自真的在动（逐序）").toEqual([true, true, true, true]);
  });

  it("V3 · ①墨色洇开是**真属性变化**（采样点取值不同）+ 墨度钩子**两相翻档**（低墨度 → 高墨度）", async () => {
    render(<Probe revealed />);
    await waitHandle();
    const tl = handleTl();
    freezeAt(tl, 0.05);
    const a = Number(el("ink").style.opacity);
    freezeAt(tl, 0.15);
    const b = Number(el("ink").style.opacity);
    expect(a, "防空真：第一个采样点必须已经离开起点").toBeGreaterThan(0.35);
    expect(b, "M3：`duration: 0` 的瞬变会让两个采样点取值相同").toBeGreaterThan(a);
    expect(b).toBeLessThan(1);
    expect(seen.tones[0], "首帧必须是低墨度（挂载即高墨度 ⇒ Text.css 那条 color transition 永不触发）").toBe("ink-3");
    expect(seen.tones[seen.tones.length - 1]).toBe("ink-1");
    expect([...new Set(seen.tones)], "恰两相（翻档是**一次**状态变化，不是每帧 setState）").toEqual(["ink-3", "ink-1"]);
  });

  it("V4 · ③剪报底纹**单调朝一个方向**长出去（左刷；原点是 left —— 生产侧那一半在面板测试里断）", async () => {
    render(<Probe revealed />);
    await waitHandle();
    const tl = handleTl();
    const series = [0.2, 0.25, 0.3, 0.35].map((t) => {
      freezeAt(tl, t);
      return scaleXOf(currentTransform(el("clip")));
    });
    expect(series, "生成物必须逐序单调不减（回刷 = 方向说谎）").toEqual([...series].sort((x, y) => x - y));
    expect(series[0], "防空真：起点必须大于 0（否则四点是同一条平线）").toBeGreaterThan(0);
    expect(series[3]).toBeGreaterThan(series[0]);
    expect(series[3]).toBeLessThan(1);
    freezeAt(tl, 0.5);
    expect(scaleXOf(currentTransform(el("clip"))), "落定 = 满幅").toBeCloseTo(1, 6);
  });

  it("V5 · 起始态被持有：收起 ⇒ 持有量归零 + 四件落终态；下一张的揭晓**从起始形态**起播（M5）", async () => {
    const view = render(<Probe revealed />);
    await waitHandle();
    freezeAt(handleTl(), 0.3);
    expect(seen.api!.progress.current, "持有量逐帧折回（0.3 / 0.5）").toBeCloseTo(0.6, 6);
    view.rerender(<Probe revealed={false} />);
    expect(seen.api!.progress.current, "收起（评分后必经路径）⇒ 归零，否则下一张「从终态开始」").toBe(0);
    await waitFor(() => expect(readAll(), "收起 = **立即落终态**（机制②逐字）").toEqual(ENDS));
    view.rerender(<Probe revealed />);
    await waitHandle();
    freezeAt(handleTl(), 0);
    expect(readAll(), "下一张卡的揭晓起点 = `revealStateAt(0)` 逐字（不是终态、也不是中途态）").toEqual(STARTS);
  });

  it("V6 · 可中断（**双断言**，R8.2）：中途收起 ⇒ ①计数不累积 **且** ②DOM 归**新**的那条时间线", async () => {
    expect(gsap.globalTimeline.getChildren(), "同文件残留 ⇒ 下面的精确计数会被做假").toHaveLength(0);
    const view = render(<Probe revealed />);
    await waitHandle();
    const first = handleTl();
    freezeAt(first, 0.3);
    expect(gsap.globalTimeline.getChildren(), "1 条时间线 + 它的 4 个 tween（默认**递归**口径 = 5）").toHaveLength(5);
    expect(gsap.globalTimeline.getChildren(false, true, true), "只数直接子项").toHaveLength(1);
    const mid = readAll();
    expect(mid.map((v, i) => v !== STARTS[i]), "防空真：中断前四件都必须已离开起点").toEqual([true, true, true, true]);
    expect(mid[1], "中断发生在**飞行中**（②尚未落定）⇒ 若旧时间线不被 kill，DOM 会继续变").not.toBe(ENDS[1]);

    view.rerender(<Probe revealed={false} />);
    expect(gsap.globalTimeline.getChildren(), "旧时间线还在 ⇒ 那是「覆盖」不是「接管」（M6 死在这里）").toHaveLength(0);
    expect(gsap.globalTimeline.getChildren(false, true, true)).toHaveLength(0);
    expect(IDS.map((id) => tweenCount(el(id))), "四个目标上都不许留着活 tween").toEqual([0, 0, 0, 0]);

    view.rerender(<Probe revealed />);
    await waitHandle();
    expect(handleTl(), "新输入接管 ⇒ 新的一条时间线").not.toBe(first);
    expect(gsap.globalTimeline.getChildren(), "不排队：计数与首次揭晓相同（5），不是 10").toHaveLength(5);
    freezeAt(handleTl(), 0);
    expect(readAll(), "DOM 半边：值必须归**新** tween（只看计数会假绿）").toEqual(STARTS);
    freezeAt(handleTl(), 0.5);
    expect(readAll()).toEqual(ENDS);
  });

  it("V7 · reduced-motion（系统优先于档位）⇒ 四件落终态、零 tween、出口给惰性时间线", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard"); // 档位不是 eco ⇒ 走的是「出口命中」那条路
    const stub = installMatchMediaStub({ reduce: true });
    try {
      render(<Probe revealed />);
      await waitHandle();
      expect(IDS.map((id) => tweenCount(el(id))), "命中 reduce 仍建 tween ⇒ 有运动（§8.6.1 第 4 条）").toEqual([0, 0, 0, 0]);
      expect(handleTl().getChildren(), "出口的惰性时间线里不许有 tween").toHaveLength(0);
      expect(readAll(), "「跳终态」= 落终值，**揭晓仍然发生**（不是「不播」）").toEqual(ENDS);
      expect(seen.api!.progress.current).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it("V8 · 三档：eco 不建编排 timeline（跳终态）· standard 0.5s · rich 0.72s（> standard 且 ≤ 0.9）", async () => {
    const durations: (number | null)[] = [];
    for (const tier of ["eco", "standard", "rich"] as const) {
      localStorage.setItem(MOTION_INTENSITY_KEY, tier);
      const view = render(<Probe revealed />);
      if (tier === "eco") {
        await waitFor(() => expect(seen.api!.progress.current).toBe(1));
        expect(seen.api!.handle.current, "§8.5：节能档 ⇒ 编排层直接跳终态（不建编排 timeline）").toBeNull();
        expect(IDS.map((id) => tweenCount(el(id)))).toEqual([0, 0, 0, 0]);
        expect(readAll(), "终态与 standard/rich 的终态**完全相同**（档位只改时长，不改读数）").toEqual(ENDS);
        durations.push(null);
      } else {
        await waitHandle();
        durations.push(handleTl().duration());
        freezeAt(handleTl(), handleTl().duration());
        expect(readAll()).toEqual(ENDS);
      }
      view.unmount();
    }
    expect(durations[0]).toBeNull();
    expect(durations[1]).toBeCloseTo(0.5, 6);
    expect(durations[2]).toBeCloseTo(0.72, 6);
    expect(durations[2] as number, "「丰富」= 更长").toBeGreaterThan(durations[1] as number);
    expect(durations[2] as number, "M8：1000ms 会越过 §8.1 的 900ms 上界").toBeLessThanOrEqual(0.9);
  });

  it("V9 · 属性集合审计：内联属性**增量** ⊆ 合成属性白名单（不含 height/width/letter-spacing）", async () => {
    const view = render(<Probe revealed={false} />);
    const before = IDS.map((id) => animatedProps(el(id)));
    expect(before.flat(), "防空真：起点集合必须非空（否则这条断言测的是空气）").toContain("transform-origin");
    view.rerender(<Probe revealed />);
    await waitHandle();
    freezeAt(handleTl(), 0.5);
    const deltas = IDS.map((id, i) => animatedProps(el(id)).filter((p) => !before[i].includes(p)));
    expect([...new Set(deltas.flat())].sort(), "实测增量的**逐序**全集").toEqual(
      ["opacity", "rotate", "scale", "transform", "translate"],
    );
    for (const [i, delta] of deltas.entries()) {
      expect(delta.filter((p) => !ANIMATABLE_PROPERTIES.includes(p)), `${IDS[i]} 越出白名单`).toEqual([]);
      expect(() => assertAnimatable(delta)).not.toThrow();
      expect(delta.filter((p) => p === "height" || p === "width" || p === "letter-spacing"), `${IDS[i]} 动了 layout 属性`).toEqual([]);
    }
  });
});
