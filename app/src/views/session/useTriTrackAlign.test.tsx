// @vitest-environment jsdom
/**
 * useTriTrackAlign.test.tsx — #1「对齐」的**行为级判据**（批 6 波 C · T27；规格 §8.6 第 1 行 ·
 *   §8.6.1 第 1/3/4 条 · 裁决 R5.1（「错位」的形态裁定即为定义）/ R3.5 / R8.1 / R8.2 / R8.4 /
 *   R35.4（三档自消费）/ R50.1（两条 GSAP 陷阱））。
 *
 * 判据纪律：确定性推进**只用** `test/motionHarness.ts` 的 `freezeAt`（`paused: true` + `tl.time(t)`，
 *   R8.1 的唯一正解）；**禁用** `updateRoot` / `ticker.tick` / `ticker.sleep` / 真实定时器；可中断判据
 *   **双断言**（时间线计数**两种口径都断** + 目标元素 `style.transform`，R8.2 / R35① —— 只看 `transform`
 *   会假绿：T11 的 M1b2 实测「去掉 `overwrite` 且拆掉计数嘴 ⇒ 9/9 全绿」）；属性集合审计按**越界集合**
 *   口径（T33 的 W4：宿主自己也写行内 `style` ⇒「全量 ⊆ 白名单」恒红）。⚠️ `freezeAt` 与 `trigger` 都包
 *   在 `act()` 里（触发要 flush effect 才会起时间线）。变异体读数见 task-27-report.md（只在导出副本里做）：
 *   P1 绕过 `clampShift` · P2 rich 取 `card` 档 · V2 触发写成常量 `false` · V3 去掉 `interrupt()` ·
 *   V4 降级只「不播」不写终态 · V5 rich 位移写成 12px · V6 改成 `y: 8` / 静态 import。
 *
 * 副作用：挂/卸真实 DOM 元素、建 GSAP 时间线（`afterEach` 收尸）、读写 `localStorage` 的档位记忆、
 *   临时改写 `window.matchMedia`（`restore()` 复原）。边界：**观感与真实帧率本批未测**（jsdom 无排版、
 *   无 paint）—— 本文件判的是**数值与状态机**；「三轨看起来真的对齐了吗」进报告 `## 诚实边界`。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertAnimatable } from "../../motion/controls";
import { gsap } from "../../motion/engine";
import { MOTION_INTENSITY_KEY } from "../../motion/intensity";
import { SHIFT_MAX_PX } from "../../motion/shift";
import { stripComments } from "../../ui/primitives/sliceScan";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "../../test/motionHarness";
import {
  MISALIGNED_TRACKS, START_ALIGNED, alignDurationSec, alignTiming, laneDelaySec, misalignOffset, offsetOf,
  shiftYOf, useTriTrackAlign,
} from "./useTriTrackAlign";
import type { MisalignedTrack, TriTrackAlign } from "./useTriTrackAlign";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 合成属性白名单（R8.4 的逐字序；与 `motion/shift.ts` 的 `ANIMATABLE_PROPERTIES` 同源口径）。 */
const CONTROL = ["transform", "translate", "rotate", "scale", "opacity", "filter"];
/** 夹具自己写进条目容器的**布局**行内属性（= 视图的 `LANE_STYLE`）—— 它们不是被动画的属性。 */
const LAYOUT_PROPS = ["display", "flex-direction", "gap"];
const MS = 9_000; // 共轴组 = 三轨里同一刻的那一组
/** 动态 import 的等待窗口（**不是**动画的等待窗口；同 T29 先例：全量并行跑时可超过默认 1000ms）。 */
const WAIT = { timeout: 5000 } as const;

const seen: { api: TriTrackAlign | null } = { api: null };

/** 探针宿主：与视图同形的两条非参考轨（`data-track` 锚 + 真实 DOM + 同样的布局行内 style）。 */
function Probe(): ReactElement {
  const api = useTriTrackAlign({ paused: true });
  seen.api = api;
  return (
    <div>
      <div data-track="transcript" data-testid="lane-transcript" style={{ display: "flex", flexDirection: "column", gap: 6 }} />
      <div data-track="screen" data-testid="lane-screen" style={{ display: "flex", flexDirection: "column", gap: 6 }} ref={api.attach.screen} />
      <div data-track="ocr" data-testid="lane-ocr" style={{ display: "flex", flexDirection: "column", gap: 6 }} ref={api.attach.ocr} />
    </div>
  );
}
const lane = (track: MisalignedTrack): HTMLElement => {
  const el = document.body.querySelector<HTMLElement>(`[data-testid="lane-${track}"]`);
  if (el === null) throw new Error(`找不到轨道容器：${track}`);
  return el;
};
/** DOM 侧读数（R8.2 的第二半）—— 位移量只从 `transform` 读，不碰任何布局量。 */
const yOf = (track: MisalignedTrack): number => shiftYOf(currentTransform(lane(track)));
const both = (): number[] => MISALIGNED_TRACKS.map((t) => yOf(t));
const timelines = () => seen.api!.handles.current.map((h) => h.timeline);
/** 触发一次（`act` 包住 ⇒ effect 真的跑、新时间线真的起来）。 */
const fire = (ms: number): void => {
  act(() => {
    seen.api!.trigger(ms);
  });
};
/** 确定性推进（R8.1）：paused timeline + `tl.time(t)`（逐条都推，两条轨同拍时读数才可比）。 */
const seek = (t: number): void => {
  act(() => {
    for (const tl of timelines()) freezeAt(tl, t);
  });
};
const seekEnd = (): void => {
  act(() => {
    for (const tl of timelines()) freezeAt(tl, tl.duration());
  });
};
/** 等「新的一组出口句柄」到位（动态 import 的到达窗口）。 */
const waitHandles = async (count: number): Promise<void> => {
  await waitFor(() => expect(seen.api!.handles.current).toHaveLength(count), WAIT);
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

describe("P1~P2 · 错位量与档位的纯函数（真源与读数口）", () => {
  it("P1 · 「错位」= 两条**非参考轨**反向各偏 ≤8px：第三轨是 OCR、转写轨是时间基、量值恰在上限上", () => {
    expect(MISALIGNED_TRACKS, "🔴 第三轨 = OCR（§8.6 的批 5 加注逐字）；转写轨是时间基 ⇒ 不施加偏移").toEqual(["screen", "ocr"]);
    expect([misalignOffset("screen"), misalignOffset("ocr")], "两条派生轨朝**相反**方向错开（相对错位量翻倍）").toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]);
    expect(SHIFT_MAX_PX, "§8.4 的位移上限（R3.5 是**上限**，不是目标值）").toBe(8);
    expect([offsetOf("screen", true), offsetOf("ocr", true)], "对齐态 = 0（「滑到对齐位」的终值）").toEqual([0, 0]);
    expect([offsetOf("screen", false), offsetOf("ocr", false)], "错位态 = 静态偏移").toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]);
    expect(START_ALIGNED, "起始态 = 错位（R5.1「从错位**滑到**对齐」）").toBe(false);
  });

  it("P2 · `shiftYOf` 读 y 分量（不是 x）· 三档时长与错开逐序对拍", () => {
    expect([shiftYOf(""), shiftYOf("translate(0, 0)")], "无 translate 子句 / 落定形态 ⇒ 0（未被位移）").toEqual([0, 0]);
    expect(shiftYOf("translate(3px, -8px)"), "取第 2 个实参（取第 1 个会把 scaleX 那种 x 当 y ⇒ 读数全错）").toBe(-8);
    expect(shiftYOf("translate3d(3px, 8px, 0px)")).toBe(8);
    expect(shiftYOf("translateY(8px)"), "单维形态").toBe(8);
    expect([alignDurationSec("eco"), alignDurationSec("standard"), alignDurationSec("rich")], "三档时长取自 token 真源").toEqual([0, 0.22, 0.5]);
    const std = alignTiming("standard");
    const rich = alignTiming("rich");
    expect([std.stagger, rich.stagger > 0], "standard 两条轨同拍 · rich **才**错开（「丰富」= 更长 + 错开更明显）").toEqual([0, true]);
    expect([laneDelaySec(0, "standard"), laneDelaySec(1, "standard")], "standard：两条轨同拍").toEqual([0, 0]);
    expect([laneDelaySec(0, "rich"), laneDelaySec(1, "rich")], "rich：只有第二条轨延后（错开更明显）").toEqual([0, rich.stagger]);
  });
});

describe("V2~V3 · 起始态被持有（可反向）与可中断（双断言）", () => {
  it("V2 · 挂载即物化「错位」⇒ 触发滑到对齐 ⇒ 再触发回错位（往返两次都断 DOM 静态值）", async () => {
    const view = render(<Probe />);
    await waitFor(() => expect(yOf("screen"), "挂载时零时长 tween 就把「错位」写进 DOM（起始态不是概念）").toBe(SHIFT_MAX_PX), WAIT);
    expect(both(), "错位位形：画面 +8px、OCR −8px").toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]);
    expect([seen.api!.aligned, seen.api!.ms], "两个**被持有**的量的起始值").toEqual([false, null]);
    expect(seen.api!.handles.current, "挂载只物化静态位形 ⇒ 零编排时间线").toHaveLength(0);

    fire(MS); // 第一次触发：对齐
    await waitHandles(2);
    expect([seen.api!.aligned, seen.api!.ms], "持有态被翻转且可读").toEqual([true, MS]);
    seekEnd();
    expect(both(), "滑到对齐位").toEqual([0, 0]);

    fire(MS); // 第二次触发：**同一个 ms** ⇒ 反向
    await waitHandles(2);
    expect(seen.api!.aligned, "再次触发 ⇒ 对齐 → 错位（反向靠**持有**的 aligned，不靠重放）").toBe(false);
    seekEnd();
    expect(both(), "往返第一轮：回到错位位形").toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]);

    fire(MS); // 第三、四次：再往返一轮（「切走再回」之外的「再次触发」反向）
    await waitHandles(2);
    expect(seen.api!.aligned).toBe(true);
    seekEnd();
    expect(both(), "往返第二轮：又对齐").toEqual([0, 0]);
    fire(MS);
    await waitHandles(2);
    seekEnd();
    expect(both(), "往返第二轮：又错位").toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]);
    view.unmount();
  });

  it("V3 · 下一个输入接管：时间线不累积（两种口径都断）· 旧句柄推播放头不再写 DOM · 值归新 tween", async () => {
    expect(gsap.globalTimeline.getChildren(), "同文件前置用例有残留 ⇒ 下面的精确计数会被做假").toHaveLength(0);
    const view = render(<Probe />);
    await waitFor(() => expect(yOf("screen")).toBe(SHIFT_MAX_PX), WAIT);
    fire(MS);
    await waitHandles(2);
    const first = timelines();
    seek(0.11);
    // 🔴 双断言第一半：**两种口径都断**（2 条时间线 + 各自的 1 条 tween ⇒ 默认递归 = 4 / 直接子项 = 2，R35①）
    expect(gsap.globalTimeline.getChildren(), "2 条时间线 + 2 条 tween（默认**递归**口径）").toHaveLength(4);
    expect(gsap.globalTimeline.getChildren(false, true, true), "只数直接子项（= 2 条时间线）").toHaveLength(2);
    expect([tweenCount(lane("screen")), tweenCount(lane("ocr"))]).toEqual([1, 1]);
    const mid = both();
    expect([mid[0] > 0, mid[0] < SHIFT_MAX_PX], "防空真：中途读数必须严格落在两端之间").toEqual([true, true]);

    fire(MS); // 反向：第二个输入接管
    await waitHandles(2);
    const second = timelines();
    expect(second[0], "旧时间线仍是句柄里那条 ⇒ 没有接管").not.toBe(first[0]);
    expect(gsap.globalTimeline.getChildren(), "旧时间线还在 ⇒ 那是「覆盖」不是「接管」（M3 死在这里）").toHaveLength(4);
    expect(gsap.globalTimeline.getChildren(false, true, true)).toHaveLength(2);
    expect([tweenCount(lane("screen")), tweenCount(lane("ocr"))], "两条轨上都只许剩新 tween 一条").toEqual([1, 1]);
    const frozen = yOf("screen");
    act(() => {
      freezeAt(first[0], 1); // 旧句柄：kill 之后推它的播放头**不许**再写 DOM
    });
    expect(yOf("screen"), "旧时间线还能写 DOM ⇒ 没真 kill（子 tween 变成孤儿）").toBeCloseTo(frozen, 6);
    seek(0);
    // 🔴 双断言第二半（DOM）：只看计数会假绿（R8.2）
    expect(both(), "DOM 半边：起点 = 本次被物化的起始态（对齐态 0），不是旧轨迹上的中途值").toEqual([0, 0]);
    seekEnd();
    expect(both(), "DOM 半边：终值归**新** tween（旧 tween 已 kill）").toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]);
    // 反空真放在**最后**：结束时场上只许剩「当前那两条时间线 + 各自的 tween」
    expect(gsap.globalTimeline.getChildren()).toHaveLength(4);
    expect(gsap.globalTimeline.getChildren(false, true, true)).toHaveLength(2);
    view.unmount();
  });
});

describe("V4~V5 · reduced-motion 降级与三档自消费（R35.4）", () => {
  it("V4 · reduced-motion（系统优先于档位）⇒ 跳终态：零 tween **且** 元素已在终态静态值", async () => {
    localStorage.setItem(MOTION_INTENSITY_KEY, "standard"); // 档位记忆 = standard ⇒ 不走 eco 分支
    const stub = installMatchMediaStub({ reduce: true });
    try {
      const view = render(<Probe />);
      await waitFor(() => expect(both()).toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]), WAIT);
      expect([tweenCount(lane("screen")), tweenCount(lane("ocr"))], "命中 reduce 仍建 tween ⇒ 有运动（§8.6.1 第 4 条）").toEqual([0, 0]);
      fire(MS);
      await waitFor(() => expect(both(), "「跳终态」= 落终值，不是「不播」（M4 死在这一行）").toEqual([0, 0]), WAIT);
      expect([tweenCount(lane("screen")), tweenCount(lane("ocr"))]).toEqual([0, 0]);
      await waitHandles(2);
      expect(seen.api!.handles.current.every((h) => h.timeline.getChildren().length === 0), "出口的惰性时间线里不许有 tween").toBe(true);
      expect(seen.api!.aligned, "持有态照常翻转（降级只改运动，不改语义）").toBe(true);
      view.unmount();
    } finally {
      stub.restore();
    }
  });

  it("V5 · 三档：eco 不建编排 timeline（跳终态）· standard 220ms · rich 500ms + 第二条轨错开 —— 位移逐档都 ≤8px", async () => {
    const durations: (number | null)[] = [];
    const offsets: number[][] = [];
    for (const tier of ["eco", "standard", "rich"] as const) {
      localStorage.setItem(MOTION_INTENSITY_KEY, tier);
      const view = render(<Probe />);
      await waitFor(() => expect(both(), "挂载物化的错位位形**逐档相同**（档位不改幅度）").toEqual([SHIFT_MAX_PX, -SHIFT_MAX_PX]), WAIT);
      offsets.push(both());
      fire(MS);
      if (tier === "eco") {
        await waitFor(() => expect(both(), "§8.5：节能档 ⇒ 编排层直接跳终态").toEqual([0, 0]), WAIT);
        expect(seen.api!.handles.current, "eco 不建编排 timeline").toHaveLength(0);
        expect([tweenCount(lane("screen")), tweenCount(lane("ocr"))]).toEqual([0, 0]);
        durations.push(null);
      } else {
        await waitHandles(2);
        const tls = timelines();
        durations.push(tls[0].duration());
        expect(tls[1].duration(), "rich：第二条轨多一个 delay（时长 + 错开）⇒ 不短于第一条").toBeGreaterThanOrEqual(tls[0].duration());
        seekEnd();
        expect(both(), "三档都滑到对齐位").toEqual([0, 0]);
      }
      view.unmount();
    }
    expect(durations).toEqual([null, 0.22, 0.5]);
    expect(durations[2] as number, "「丰富」= 更长，不是更少").toBeGreaterThan(durations[1] as number);
    expect(offsets, "三档的错位量完全相同（R3.5 的 8px 是上限，档位不加幅度）").toEqual([
      [SHIFT_MAX_PX, -SHIFT_MAX_PX],
      [SHIFT_MAX_PX, -SHIFT_MAX_PX],
      [SHIFT_MAX_PX, -SHIFT_MAX_PX],
    ]);
    expect(offsets.flat().filter((v) => Math.abs(v) > SHIFT_MAX_PX), "有一档越过 8px ⇒ 违反 §8.4").toEqual([]);
  });
});

describe("V6~V7 · 位移只经唯一出口（R3.5）与 engine 的动态到达（R41.3）", () => {
  const SRC = stripComments(readFileSync(join(HERE, "useTriTrackAlign.ts"), "utf8"));
  const bareGsap = (code: string): boolean => /\bgsap\./.test(code); // 越过出口直接调 `gsap.*`（M6 的形态）
  /** 只扫**传给出口**的位移实参（`startControllable(target, { … })` 的第一个对象里的 `y:`）。 */
  const shifts = (code: string): string[] =>
    [...code.matchAll(/startControllable\(\s*[^,]+,\s*\{([^}]*)\}/g)].flatMap((call) =>
      [...(call[1] ?? "").matchAll(/\by:\s*([^,}\n]+)/g)].map((m) => (m[1] ?? "").trim()),
    );
  /** 越界实参。⚠️ 取段在**第一个逗号**处截断（`offsetOf(track, to)` 取到 `offsetOf(track`）—— 判据要的是
   *  「表达式是不是那个出口」，截断不影响这个判定 ⇒ 如实登记该边界。 */
  const offenders = (code: string): string[] => shifts(code).filter((v) => !/^offsetOf\(/.test(v));

  it("V6 · 位移只经唯一出口：`startControllable` 的 `y:` 实参**全部**是 `offsetOf(...)`，且本文件零裸 `gsap.`", () => {
    expect(shifts(SRC).length, "一条位移实参都没扫到 ⇒ 仪器失效（或位移换了通道 ⇒ 本条空真）").toBeGreaterThan(0);
    expect(offenders(SRC), "出现绕过 `clampShift` 唯一出口的位移实参").toEqual([]);
    expect(SRC, "唯一出口必须真被调用（否则「绕不绕过」都无所谓）").toContain("clampShift(");
    expect(bareGsap(SRC), "本文件直接调 `gsap.*` ⇒ 绕开出入口（M6 的形态）").toBe(false);
    // 阳性对照：同一台扫描器在违规样本上必须命中（否则「0 命中」不算数，R8.7）
    expect([offenders('startControllable(el, { y: 8, duration: 0 })'), offenders("startControllable(el, { y: -12 })")]).toEqual([["8"], ["-12"]]);
    expect(offenders('startControllable(el, { y: offsetOf(track, to), duration: 0 })'), "合法写法不许误判").toEqual([]);
    expect(bareGsap("gsap.to(el, { y: 8 });"), "裸 gsap 样本没被扫到 ⇒ 上面那半是空真").toBe(true);
  });

  it("V7 · `controls.ts` 只经 `await import()` 到达（静态边只许是 `import type`）—— R41.3 / §三十四 #23", () => {
    expect(SRC, "运行时入口必须是动态 import（否则 engine 进首屏静态闭包）").toContain('import("../../motion/controls")');
    expect(/^\s*import\s+(?!type\b)[^;]*from\s*["'][^"']*motion\/controls["']/m.test(SRC), "出现静态值边").toBe(false);
    expect(/^\s*import\s+type\s[^;]*from\s*["'][^"']*motion\/controls["']/m.test(SRC), "类型边是允许的唯一静态边").toBe(true);
  });

  it("V8 · 属性集合审计（R8.4）：被写的内联属性里，越出合成族白名单的**只有夹具自己写的布局属性**", async () => {
    const view = render(<Probe />);
    await waitFor(() => expect(yOf("screen")).toBe(SHIFT_MAX_PX), WAIT);
    fire(MS);
    await waitHandles(2);
    seekEnd();
    const props = animatedProps(lane("screen"));
    expect(props, "transform 必须真被写（否则本条是空真）").toContain("transform");
    expect(props.filter((p) => !CONTROL.includes(p)), "越界集合必须**恰是**夹具的布局属性（delta 口径，同 T33 W4）").toEqual(LAYOUT_PROPS);
    expect(() => assertAnimatable(props.filter((p) => CONTROL.includes(p)))).not.toThrow();
    expect(props.filter((p) => ["width", "height", "margin", "top", "left"].includes(p)), "位移不许动 layout 属性").toEqual([]);
    expect(() => assertAnimatable(["opacity", "height"])).toThrow(); // 阳性对照：审计器本身有牙
    view.unmount();
  });
});
