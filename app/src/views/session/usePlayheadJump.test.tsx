// @vitest-environment jsdom
/**
 * usePlayheadJump.test.tsx — #5「时间码回跳」的**行为级判据**（批 6 波 C · T31；规格 §8.6 第 5 行 ·
 *   §8.6.1 第 1/3/4 条 · 裁决 R3.5 / R5.5 / R8.1 / R8.2 / R8.4 / R35.4 / R50.1 / R60.1）。
 *
 * 判据纪律：确定性推进**只用** `test/motionHarness.ts` 的 `freezeAt`（`paused: true` + `tl.time(t)`，
 *   R8.1 的唯一正解）；**禁用** `updateRoot` / `ticker.tick` / `ticker.sleep` / 真实定时器。可中断判据
 *   **双断言**（计数**两种口径都断** + 元素 `style.transform`，R8.2 / R35① —— 只看 transform 会假绿）。
 *   属性审计取**增量**口径（挂载时不写 ⇒ 快照为空，跳转后新增的那一个必须 ⊆ 白名单）。reduced-motion
 *   一条**显式设档位 + 阳性对照**（R58.1① 的「旁路遮住」：reduce 会让 `useMotionIntensity` 初值也变
 *   `eco` ⇒ 不显式设 standard 就分不清「reduce 跳终态」与「eco 不播」）。
 * @ai-context 落位通道的**读数口** = 探针自己的视口（`scrollLeft`）；四点 `0/52.5/90/120` **逐序数组
 *   相等**（jsdom 不排版 ⇒ `clientWidth === 0` 是这条换算的前提，用例内自证）。
 * @ai-context 变异体读数见 `task-31-report.md`（只在导出副本里做）：M2 落位打到 `window` · M4 第二次
 *   跳转前把持有量重置（丢掉方向）· M5 去掉 `interrupt()` · M6 降级分支仍播滑动 · M7 `rich` 帧数越限 ·
 *   M8 在 hook 里 import `convertFileSrc` · M9 位移改成动 layout 属性。
 * 副作用：挂/卸真实 DOM、建 GSAP 时间线（`afterEach` 收尸）、读写 `localStorage` 的档位记忆、临时改写
 *   `window.matchMedia`（`restore()` 复原）。边界：**观感与真实帧率本批未测**（jsdom 无排版、无 paint）；
 *   本件判的是**数值与状态机**，「播放头看起来真的滑过去了吗」进报告 `## 诚实边界`。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render } from "@testing-library/react";
import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAnimatable } from "../../motion/controls";
import { gsap } from "../../motion/engine";
import { MOTION_INTENSITY_KEY } from "../../motion/intensity";
import { ANIMATABLE_PROPERTIES, SHIFT_MAX_PX } from "../../motion/shift";
import { stripComments } from "../../ui/primitives/sliceScan";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "../../test/motionHarness";
import { seekToMs } from "./TimeRail";
import { jumpDurationSec, shiftXOf, sweepStartPx, usePlayheadJump } from "./usePlayheadJump";
import type { PlayheadJump } from "./usePlayheadJump";

const HERE = dirname(fileURLToPath(import.meta.url));
const MS_A = 30_000;
const MS_B = 10_000;

const seen: { api: PlayheadJump | null; set: ((ms: number | null) => void) | null } = { api: null, set: null };

/** 探针：与 `TimeRail` 同形（视口 + 播放头标记 + 掠过条容器三个登记口），但**受控且 paused**。 */
function Probe(): ReactElement {
  const viewport = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const jump = usePlayheadJump({ targetMs: target, viewport, seekTo: seekToMs, paused: true });
  seen.api = jump;
  seen.set = setTarget;
  return (
    <div>
      <div ref={viewport} data-testid="vp" />
      <span ref={jump.mark} data-testid="mark" />
      <div ref={jump.strip} data-testid="strip" />
    </div>
  );
}
function q(sel: string): HTMLElement {
  const el = document.body.querySelector(sel);
  if (el === null) throw new Error(`没有渲染出 ${sel}`);
  return el as HTMLElement;
}
const mark = (): HTMLElement => q('[data-testid="mark"]');
/** DOM 侧读数（R8.2 的第二半）—— 位移量只从 `transform` 读，不碰任何布局量。 */
const xOf = (): number => shiftXOf(currentTransform(mark()));
const handles = (): readonly { timeline: { duration(): number } }[] => seen.api!.handles.current;
const timelines = () => handles().map((h) => h.timeline);
/** 跳一次（`act` 包住 ⇒ effect 真的跑、起点真的写进 DOM）。 */
const jumpTo = (ms: number | null): void => {
  act(() => seen.set?.(ms));
};
/** 确定性推进（R8.1）：paused timeline + `tl.time(t)`。 */
const seek = (t: number): void => {
  act(() => {
    for (const tl of timelines()) freezeAt(tl as never, t);
  });
};
const seekEnd = (): void => {
  act(() => {
    for (const tl of timelines()) freezeAt(tl as never, tl.duration());
  });
};

beforeEach(() => {
  seen.api = null;
  seen.set = null;
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
  seen.set = null;
});

describe("H1 元素级落位：四点逐序 + 绝不碰 window（R5.5 的判据边界）", () => {
  it("目标 0/52500/90000/120000 ⇒ 视口 `scrollLeft` 逐序 0/52.5/90/120；`window.scrollTo` 零调用", () => {
    const windowScroll = vi.spyOn(window, "scrollTo");
    const view = render(<Probe />);
    const vp = q('[data-testid="vp"]');
    expect(vp.clientWidth, "jsdom 排版口径变了 ⇒ 下面的期望值不再成立（仪器前提自证）").toBe(0);
    const readings: number[] = [];
    for (const ms of [0, 52_500, 90_000, 120_000]) {
      jumpTo(ms);
      readings.push(vp.scrollLeft);
    }
    expect(readings, "四点读数不是 0/52.5/90/120（逐序数组相等）").toEqual([0, 52.5, 90, 120]);
    expect(windowScroll.mock.calls.length, "落位打到了 window（尖刺实测读数恒 0）").toBe(0);
    windowScroll.mockRestore();
    view.unmount();
  });
});

describe("H2 起始态被持有（可反向）：从**当前位置**滑向新目标", () => {
  it("30s → 10s：目标序列 [30000,10000] 与起点序列 [null,30000] 逐序；起手方向翻到相反一侧", () => {
    const view = render(<Probe />);
    const targets: (number | null)[] = [];
    const froms: (number | null)[] = [];
    const starts: number[] = [];
    jumpTo(MS_A);
    targets.push(seen.api!.targetMs);
    froms.push(seen.api!.fromMs);
    starts.push(xOf());
    seekEnd();
    jumpTo(MS_B);
    targets.push(seen.api!.targetMs);
    froms.push(seen.api!.fromMs);
    starts.push(xOf());
    expect(targets, "目标被**持有**（第二次不是回到起点，而是接住新目标）").toEqual([MS_A, MS_B]);
    expect(froms, "起点 = 上一次的目标 ⇒ 从当前位置往回滑（首跳无历史 ⇒ null）").toEqual([null, MS_A]);
    expect([starts[0] > 0, starts[1] < 0], "方向翻转：前进 +8px 一侧 / 回退 −8px 一侧").toEqual([true, true]);
    expect([Math.abs(starts[0]), Math.abs(starts[1])], "两个方向的量值相同（8px 是上限，不是随距离放大）").toEqual([SHIFT_MAX_PX, SHIFT_MAX_PX]);
    seekEnd();
    expect([xOf(), q('[data-testid="vp"]').scrollLeft], "落位：位移归 0、视口落在新目标 10s 处").toEqual([0, 10]);
    view.unmount();
  });
});

describe("H3 可中断（R8.2 本体：双断言，缺一即假绿）", () => {
  it("连点两点：时间线不累积（两种口径都断）· 旧句柄推播放头不再写 DOM · 值归新 tween", () => {
    expect(gsap.globalTimeline.getChildren(), "同文件前置用例有残留 ⇒ 下面的精确计数会被做假").toHaveLength(0);
    const view = render(<Probe />);
    jumpTo(MS_A);
    expect(handles(), "两个登记口（播放头标记 + 掠过条）各一条编排时间线").toHaveLength(2);
    seek(0.11);
    // 🔴 第一半：**两种口径都断**（2 条时间线 + 各自 1 条 tween ⇒ 默认递归 = 4 / 直接子项 = 2，R35①）
    expect(gsap.globalTimeline.getChildren(), "递归口径").toHaveLength(4);
    expect(gsap.globalTimeline.getChildren(false, true, true), "只数直接子项").toHaveLength(2);
    expect([tweenCount(mark()), tweenCount(q('[data-testid="strip"]'))]).toEqual([1, 1]);
    const mid = xOf();
    expect([mid > 0, mid < SHIFT_MAX_PX], "防空真：中途读数必须严格落在两端之间").toEqual([true, true]);

    const first = timelines();
    jumpTo(MS_B); // 第二个输入接管 —— **不排队**
    const second = timelines();
    expect(second[0], "旧时间线仍是句柄里那条 ⇒ 没有接管").not.toBe(first[0]);
    expect(gsap.globalTimeline.getChildren(), "旧时间线还在 ⇒ 那是「覆盖」不是「接管」（M5 死在这里）").toHaveLength(4);
    expect(gsap.globalTimeline.getChildren(false, true, true)).toHaveLength(2);
    const frozen = xOf();
    act(() => {
      freezeAt(first[0] as never, 1); // 旧句柄：kill 之后推它的播放头**不许**再写 DOM
    });
    expect(xOf(), "旧时间线还能写 DOM ⇒ 没真 kill（子 tween 变成孤儿）").toBeCloseTo(frozen, 6);
    seek(0);
    // 🔴 第二半（DOM）：只看计数会假绿（R8.2）
    expect(xOf(), "起点 = 本次被物化的起始态（回退方向 −8px），不是旧轨迹上的中途值").toBeCloseTo(-SHIFT_MAX_PX, 6);
    seekEnd();
    expect(xOf(), "终值归**新** tween").toBeCloseTo(0, 6);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(4);
    view.unmount();
  });
});

describe("H4 reduced-motion（§8.5：系统偏好优先于档位）⇒ 跳终态", () => {
  it("reduce:true + **显式** standard 档 ⇒ 零 tween、位移 0、恰 1 帧；阳性对照 reduce:false 必起时间线", () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard"); // 显式档位 ⇒ 不走 eco 旁路（R58.1①）
    const reduce = installMatchMediaStub({ reduce: true });
    try {
      const view = render(<Probe />);
      jumpTo(MS_A);
      expect(seen.api!.targetMs, "降级只改运动，不改语义（目标照常被接住）").toBe(MS_A);
      expect(handles(), "命中 reduce 仍建编排时间线 ⇒ 有运动（§8.6.1 第 4 条）").toHaveLength(0);
      expect(tweenCount(mark()), "命中 reduce 仍有在场 tween").toBe(0);
      expect(xOf(), "「跳终态」= 落终值（0），不是「不播」（M6 死在这一行）").toBe(0);
      expect(seen.api!.frames, "掠过条只渲染目标那一帧").toBe(1);
      expect(q('[data-testid="vp"]').scrollLeft, "落位不受 reduced-motion 影响（那是定位不是运动）").toBe(30);
      view.unmount();
    } finally {
      reduce.restore();
    }
    // 阳性对照：同一夹具，只把 reduce 翻成 false ⇒ 必须真起两条时间线（否则上面那半可能被旁路遮住）
    const animated = installMatchMediaStub({ reduce: false });
    try {
      const view = render(<Probe />);
      jumpTo(MS_A);
      expect(handles(), "对照组没起时间线 ⇒ reduce 那半的「零 tween」不是这条因").toHaveLength(2);
      expect(tweenCount(mark())).toBe(1);
      view.unmount();
    } finally {
      animated.restore();
    }
  });
});

describe("H5 三档自消费（R35.4）：时长与帧数逐档，位移量三档相同", () => {
  it("eco 跳终态（零时间线 + 位移 0 + 1 帧）· standard 220ms/3 帧 · rich 500ms/6 帧", () => {
    const durations: (number | null)[] = [];
    const frames: number[] = [];
    const starts: number[] = [];
    for (const tier of ["eco", "standard", "rich"] as const) {
      localStorage.setItem(MOTION_INTENSITY_KEY, tier);
      const view = render(<Probe />);
      jumpTo(MS_A);
      frames.push(seen.api!.frames);
      if (tier === "eco") {
        expect(handles(), "§8.5：节能档 ⇒ 编排层直接跳终态").toHaveLength(0);
        expect([xOf(), tweenCount(mark())]).toEqual([0, 0]);
        durations.push(null);
      } else {
        expect(handles(), `${tier}：两条编排时间线`).toHaveLength(2);
        durations.push((timelines()[0] as { duration(): number }).duration());
        starts.push(xOf());
        seekEnd();
        expect(xOf(), `${tier}：滑到落位（位移归 0）`).toBeCloseTo(0, 6);
      }
      view.unmount();
    }
    expect(durations, "三档时长：eco 0（无时间线）/ standard 220ms / rich 500ms").toEqual([null, 0.22, 0.5]);
    expect(frames, "三档帧数逐序（真源 `screensFor.framesFor`）").toEqual([1, 3, 6]);
    expect(starts, "三档的**起手位移完全相同**（§8.4 的 8px 是上限，档位只加时长、不改幅度）").toEqual([SHIFT_MAX_PX, SHIFT_MAX_PX]);
    expect([jumpDurationSec("eco"), jumpDurationSec("standard"), jumpDurationSec("rich")]).toEqual([0, 0.22, 0.5]);
  });
});

describe("H6 属性集合审计（**增量**口径，R8.4 / R12.3）", () => {
  it("挂载时零内联写入 ⇒ 跳转新增的恰是 `transform`；位移不许动 layout 属性", () => {
    const view = render(<Probe />);
    const before = animatedProps(mark());
    expect(before, "`targetMs === null` 时不该有任何内联写入（否则「增量」无从谈起）").toEqual([]);
    jumpTo(MS_A);
    seekEnd();
    const added = animatedProps(mark()).filter((p) => !before.includes(p));
    // ⚠️ GSAP 的 CSSPlugin 写 `transform` 的同时会把 `translate`/`rotate`/`scale` 三个**簿记**属性也写进
    // 行内（§五十 的读数；T33 的 W4 同款）—— 四个**全部**在合成族白名单内，本条钉的就是这个集合。
    expect(added, "位移的写入集合（四个都必须在白名单里；多一个 layout 属性即红）").toEqual(["rotate", "scale", "transform", "translate"]);
    expect(added.filter((p) => !ANIMATABLE_PROPERTIES.includes(p)), "被动画的**增量**属性 ⊆ 合成族白名单").toEqual([]);
    expect(added, "`transform` 必须真被写（否则本条空真）").toContain("transform");
    expect(() => assertAnimatable(added)).not.toThrow();
    expect(animatedProps(mark()).filter((p) => ["height", "width", "top", "left", "margin"].includes(p)), "位移不许动 layout 属性").toEqual([]);
    expect(() => assertAnimatable(["opacity", "height"]), "阳性对照：审计器本身有牙").toThrow();
    view.unmount();
  });
});

describe("H7 读数口自证与源码边界（静态 import 合法性 · 零 Tauri 边 · 零裸 gsap）", () => {
  const SRC = stripComments(readFileSync(join(HERE, "usePlayheadJump.ts"), "utf8"));
  it("`shiftXOf` 读 x（不是 y）；`sweepStartPx` 四态 + 上限恒 ≤8px", () => {
    expect([shiftXOf(""), shiftXOf("translate(0px, 0px)"), shiftXOf("none")], "无位移形态 ⇒ 0").toEqual([0, 0, 0]);
    expect([shiftXOf("translate3d(8px, 0px, 0px)"), shiftXOf("translate(-8px, 0px)")], "取第 1 个实参").toEqual([8, -8]);
    expect([shiftXOf("translateY(8px)"), shiftXOf("translateZ(8px)")], "单维 y/z 形态没有 x 分量（读成 8 会把方向读反）").toEqual([0, 0]);
    expect(
      [sweepStartPx(null, 5_000), sweepStartPx(1_000, 5_000), sweepStartPx(5_000, 1_000), sweepStartPx(1_000, 1_000)],
      "首跳向前 / 前进 / 回退 / 原地（无方向）",
    ).toEqual([SHIFT_MAX_PX, SHIFT_MAX_PX, -SHIFT_MAX_PX, 0]);
    expect([sweepStartPx(null, 3_600_000), sweepStartPx(3_600_000, 0)].every((v) => Math.abs(v) <= SHIFT_MAX_PX), "8px 是**上限**（§8.4）").toBe(true);
  });

  it("`motion/controls` 是**静态** import（R60.1 授权）· `clampShift` 真被调用 · 零 Tauri 边 · 零裸 `gsap.`", () => {
    expect(SRC, "R60.1：惰性视图链上的模块静态 import 出口是安全的（T27 的 await import 是旧措辞）").toContain('import { startControllable } from "../../motion/controls"');
    expect(SRC, "位移只经唯一出口").toContain("clampShift(");
    expect(/\bgsap\./.test(SRC), "本文件直接调 `gsap.*` ⇒ 绕开出入口").toBe(false);
    expect(/from\s*["']@tauri-apps/.test(SRC), "views/** 的零 Tauri 边界").toBe(false);
    // 阳性对照：同一台扫描器在违规样本上必须命中（否则「0 命中」不算数，R8.7）
    expect(/\bgsap\./.test("gsap.to(el, { x: 8 });")).toBe(true);
    expect(/from\s*["']@tauri-apps/.test('import { convertFileSrc } from "@tauri-apps/api/core";')).toBe(true);
  });
});
