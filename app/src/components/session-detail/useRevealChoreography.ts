/**
 * @ai-context useRevealChoreography.ts — #2「显影编排」的**唯一动效编排点**（批 6 波 C · T28）。
 *   规格 §8.6 第 2 行逐字「沿时间轴逐段显影，节奏 = 语速函数」· §8.6.1 第 1/3/4 条 · 裁决 R5.2
 *   （落点 = **课后** `SessionRawView` 的 `detail.segments`）· R11.3（与低置信墨度起伏**共用同一个
 *   元素**）· R8.1 / R8.2 / R8.4 · R35.4（出口不内置档位 ⇒ 本件自消费三档）· R50.1（两条 GSAP
 *   陷阱）· R60.1（`controls.ts` 的 import 纪律）。
 *
 * 🔴 **这是字符率近似；规格未定义语速函数。**
 *   公式 = `text.length / (end_ms − start_ms)`（量纲 = **字符/毫秒**）。规格 §8.6 的「节奏 = 语速函数」
 *   在本批**只有这一个可用近似**（R5.2 逐字）—— 它**不是**语速，**不是**音节率 / 音素率，也**不是**
 *   任何后端时序量；本文件与全部报告/文档一律**不得**把它说成真实语速。两条已知偏差**逐字登记、
 *   不修正**（修正需要语言判定 = 发明）：① `text.length` 对中日文 ≈ 字数、对英文 ≈ 字母数 ⇒ 同一段
 *   时长下英文段「看起来更慢」；② 退化段（`end_ms === start_ms`）取 `len / 1`。
 *
 * 节奏的落法（本件是它的唯一定义）：段 `i` 的显影时长 `dur_i = 档位总时长 × w_i / Σw`，其中
 *   `w_i = 1 / charRate_i`（毫秒/字符）⇒ **语速越慢的段，显影越久**；`delay_i = Σ_{j<i} dur_j`
 *   （沿时间轴**逐段接续**，段的先后 = 数组序 = 时间轴序）。⇒ 档位**只改总时长**、**不改顺序**，
 *   且 `max(delay + dur)` 恒 = 档位总时长（§8.1 编排层「400–900ms」由 `revealBudgetSec` 钉住）。
 *
 * 🔴 **与 R11.3 共存（本件最重要的一条边界）**：低置信段落的墨度由 `Text.css` 的
 *   `.ed-text--low-confidence`（CSS `animation` 动 **`opacity`**）独占 ⇒ 本件**只动 `transform`**，
 *   **一个 `opacity` 都不写**（两个动效共用同一个元素，谁都不许覆盖谁）。「显影」的可见通道因此是
 *   **位移**（`y: +8px → 0` 的逐段升起），墨度通道留给环境层。
 *
 * 🔴 **起始态被持有**（R5 通则①）：`revealEpoch` 是 React **state**（`replay()` 递增）；每次世代变化
 *   都**先把起始态物化进 DOM** 再从它播到终态 ⇒ 「重播 / 折叠往返」可反向（M3 变异体钉这一点）。
 *   🔴 **可中断**（R5 通则②）：`skip()` 与任何一次新的 `replay()` 都**先** `interrupt()` 收尸在飞的旧
 *   时间线（**不排队**）；在飞期间窗口**捕获相位**的 `scroll`（含元素级滚动，实测 jsdom 下
 *   `bubbles:false` 的元素 scroll 也走 window 捕获路径）⇒ `skip()` 立即落终态。
 *
 * 🔴 **两条 GSAP 陷阱（R50.1）**：`startAt` 是 lazy 的零时长 set（paused 下到不了 DOM）· 手写
 *   `style.transform` 无效（CSSPlugin 只认 `matrix(...)`，且元素有缓存后不看 DOM）⇒ 写起点 / 终态的
 *   **唯一正解** = 出口的零时长 tween（`jumpTo`）。
 *
 * 副作用：建 GSAP 时间线 + 写段落的行内 `transform`；在飞期间挂一个 window 级 `scroll` 监听
 *   （卸载 / 落终态即摘）；经 `useMotionIntensity` 读写档位记忆与 `<html data-motion>`。无 IPC、无网络。
 * 边界：① 容器未挂上 / 零段落（空态）⇒ **不建时间线、不抛、不猜**；② `eco` / reduced-motion ⇒ 只落
 *   静态终态、零在场 tween（reduce 的判定**只在出口**，本件不复制第二个 `matchMedia` 分支）；
 *   ③ `opts.paused` 是**判据用的确定性时基**（R8.1 的唯一正解），生产不传 ⇒ ticker 驱动；④ 段数很多时
 *   单段时长会被摊薄（N=40、standard ⇒ ≈12ms/段）—— 总时长仍是档位预算，**逐段观感与真实帧率本批
 *   未测**（jsdom 无排版、无 paint）；机器抓手只有「被动画属性 ⊆ 合成属性白名单」（R8.4）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useMotionIntensity } from "../../motion/intensity";
import type { MotionIntensity } from "../../motion/intensity";
import { SHIFT_MAX_PX, clampShift } from "../../motion/shift";
import { toneEase } from "../../motion/tone";
import { DURATION_TOKENS } from "../../ui/tokens.gen";
import type { DurationTokenName } from "../../ui/tokens.gen";
// 🔴 **只取类型**：`controls.ts` 只许经 `await import()` **到达**（见文件头；判据 = `engine.guard.test.ts`）。
import type { Controllable } from "../../motion/controls";

/** 段落锚点选择器 —— 视图侧只写 `data-seg-id`（R8.5 的结构锚点；本件不碰类名）。 */
export const SEGMENT_SELECTOR = "[data-seg-id]";
/** 显影的起始位移（px）：量值**只经** `motion/shift.ts` 的唯一出口（§8.4 的 8px 是上限，不是目标值）。 */
export const REVEAL_FROM_PX = clampShift(SHIFT_MAX_PX);
/** §8.1 编排层的时间带（逐字「400–900ms」）：档位总时长必须落在带内，900ms 是**硬上限**。 */
export const REVEAL_FLOOR_MS = 400;
export const REVEAL_CEIL_MS = 900;
/** 曲线（R3.4：会话是「有文字的界面」⇒ 活的纸；真源 `motion/tone.ts`，零新造曲线）。 */
const EASE = toneEase("paper");
/** 接管源的监听参数（捕获相位 ⇒ 元素级滚动也经过 window；见文件头）。 */
const SCROLL_OPTS = { capture: true, passive: true } as const;
/** 段的时间轴投影（**只读这三列** —— 字符率近似只需要它们）。 */
export interface RevealSegment {
  readonly text: string;
  readonly start_ms: number;
  readonly end_ms: number;
}

type Controls = typeof import("../../motion/controls");

/** 🔴 字符率近似（**不是语速**）：字符/毫秒。退化段（`end_ms === start_ms`）取 `len / 1`；空文本 ⇒ 0。 */
export function charRate(text: string, startMs: number, endMs: number): number {
  return text.length / Math.max(endMs - startMs, 1);
}

/** 段的相对停留权重 = 字符率的**倒数**（毫秒/字符）；空文本 / 非正字符率 ⇒ 0（不产生 Infinity）。 */
export function dwellWeight(text: string, startMs: number, endMs: number): number {
  const rate = charRate(text, startMs, endMs);
  return rate > 0 ? 1 / rate : 0;
}

/** 档位 ⇒ 编排层**总时长**（秒）：`eco` = 0（§8.5「编排层直接跳终态」）· standard = `--ed-dur-reveal`（§8.4 逐字「显影」）· rich = §8.1 上界 900ms。 */
export function revealBudgetSec(tier: MotionIntensity): number {
  if (tier === "eco") return 0;
  if (tier === "rich") return REVEAL_CEIL_MS / 1000;
  const name: DurationTokenName = "reveal";
  const token = DURATION_TOKENS.find((t) => t.name === name);
  if (token === undefined) throw new Error(`时长真源缺 --ed-dur-${name}（tokens.gen.ts 与生成器分叉）`);
  return token.ms / 1000;
}

/** 逐段 delay（秒，逐序 = segments）：`dur_i = 总时长 × w_i / Σw`、`delay_i = Σ_{j<i} dur_j` ⇒ 顺序只由数组序定，档位只改总时长。 */
export function revealDelays(segments: readonly RevealSegment[], tier: MotionIntensity): number[] {
  const budget = revealBudgetSec(tier);
  const weights = segments.map((s) => dwellWeight(s.text, s.start_ms, s.end_ms));
  const sum = weights.reduce((a, b) => a + b, 0);
  // 权重全为 0（全空文本）⇒ 退化为**等分**（而不是 NaN / 某段永显影不完）
  const shares = sum > 0 ? weights.map((w) => w / sum) : weights.map(() => (weights.length > 0 ? 1 / weights.length : 0));
  const out: number[] = [];
  let at = 0;
  for (const share of shares) {
    out.push(at);
    at += share * budget;
  }
  return out;
}

/** 第 `index` 段的显影时长（秒）：下一段的起始 − 本段起始；末段补到档位预算 ⇒ 全段总时长恰 = 预算。 */
export function revealSpanSec(delays: readonly number[], index: number, tier: MotionIntensity): number {
  const at = delays[index];
  if (at === undefined) return 0;
  return (delays[index + 1] ?? revealBudgetSec(tier)) - at;
}

/** 显影编排的读取口：持有的世代号 + 两个入口 + 出口句柄 + 逐段 delay。 */
export interface RevealChoreography {
  /** 持有的世代号（每次 `replay()` 递增）—— 「起始态被持有」的唯一状态源。 */
  readonly revealEpoch: number;
  /** **反向 / 重播**入口：每次都从**初态**重放（折叠 ⇄ 展开往返都经它）。 */
  readonly replay: () => void;
  /** **中断**入口（下一个输入接管）：kill 在飞时间线 + **立即**落终态（不排队）。 */
  readonly skip: () => void;
  /** 最近一次的出口句柄（逐序 = 段落序）；`[]` = 无编排时间线（eco / reduced-motion / 无段落）。 */
  readonly handles: RefObject<readonly Controllable[]>;
  /** 逐段 delay（秒，逐序 = 段落序）—— 判据直接读它，不猜。 */
  readonly delays: readonly number[];
}

/** 出口的**零时长 tween** = 写静态值（起点 / 终态）的唯一正解（R50.1 的两条陷阱见文件头）。 */
function jumpTo(startControllable: Controls["startControllable"], el: Element, y: number): void {
  const zero = startControllable(el, { y, duration: 0, ease: EASE }, { paused: true });
  zero.seek(0);
  zero.interrupt(); // kill **不还原**已写出的值，也不在场上留时间线
}

/** 把「原文」视图的转写段变成一次**可中断、可反向**的逐段显影；返回持有的世代号与两个入口。 */
export function useRevealChoreography(
  container: RefObject<HTMLElement | null>,
  segments: readonly RevealSegment[],
  opts?: { paused?: boolean },
): RevealChoreography {
  const [revealEpoch, setRevealEpoch] = useState(0);
  const [inFlight, setInFlight] = useState(false);
  const [tier] = useMotionIntensity();
  const paused = opts?.paused ?? false;
  const handles = useRef<readonly Controllable[]>([]);
  const epoch = useRef(0);
  const delays = useMemo(() => revealDelays(segments, tier), [segments, tier]);
  const budget = revealBudgetSec(tier);
  const replay = useCallback(() => setRevealEpoch((n) => n + 1), []);
  const elsOf = useCallback((): HTMLElement[] => {
    const box = container.current;
    return box === null ? [] : [...box.querySelectorAll<HTMLElement>(SEGMENT_SELECTOR)];
  }, [container]);

  /** 落终态（`skip` 的另一半）：只经出口的零时长 tween 写 `y: 0`（M4 变异体钉这一半）。 */
  const settle = useCallback((): void => {
    const els = elsOf();
    if (els.length === 0) return;
    void import("../../motion/controls").then(({ startControllable }) => {
      for (const el of els) jumpTo(startControllable, el, 0);
    });
  }, [elsOf]);

  /** 「中断」：下一个输入接管 —— 先收尸在飞的时间线，**立即**落终态（不排队）。 */
  const skip = useCallback((): void => {
    epoch.current += 1; // 让晚到的动态 import 结果作废（不排队）
    for (const h of handles.current) h.interrupt();
    handles.current = [];
    setInFlight(false);
    settle();
  }, [settle]);

  useEffect(() => {
    const els = elsOf();
    if (els.length === 0) return; // 空态：不建时间线（不抛、不猜）
    epoch.current += 1;
    const mine = epoch.current;
    for (const h of handles.current) h.interrupt(); // 新输入接管：**先**收尸（不排队）
    handles.current = [];
    void import("../../motion/controls").then(({ startControllable }) => {
      if (mine !== epoch.current) return; // 已被更新的一次触发接管 ⇒ 丢弃本次（不排队）
      if (budget === 0) {
        // eco：§8.5 逐字「编排层直接跳终态」⇒ **不建**编排 timeline
        for (const el of els) jumpTo(startControllable, el, 0);
        setInFlight(false);
        return;
      }
      for (const el of els) jumpTo(startControllable, el, REVEAL_FROM_PX); // 起始态物化（本世代的起点）
      const next = els.map((el, i) =>
        startControllable(
          el,
          { y: 0, duration: revealSpanSec(delays, i, tier), delay: delays[i] ?? 0, ease: EASE },
          { paused },
        ),
      );
      // reduced-motion：出口已把 `y` 落终态并返回**零 tween** 的惰性时间线 ⇒ 场上没有在飞的东西
      // （惰性时间线一并收尸 ⇒ `handles` 与 `globalTimeline` 两侧读数一致：命中 reduce 就是「零在场」）
      const live = next.some((h) => h.timeline.getChildren().length > 0);
      if (!live) for (const h of next) h.interrupt();
      handles.current = live ? next : [];
      setInFlight(live);
    });
  }, [elsOf, budget, delays, tier, paused, revealEpoch]);

  // 「滚动接管」：只在编排在飞时挂监听；任何滚动（含元素级，见文件头）⇒ 立即落终态。
  useEffect(() => {
    if (!inFlight || typeof window === "undefined") return;
    const onScroll = (): void => skip();
    window.addEventListener("scroll", onScroll, SCROLL_OPTS);
    return () => window.removeEventListener("scroll", onScroll, SCROLL_OPTS);
  }, [inFlight, skip]);

  // 卸载（切走）：收尸在飞的时间线，并让晚到的动态 import 结果作废。
  useEffect(() => () => {
    epoch.current += 1;
    for (const h of handles.current) h.interrupt();
    handles.current = [];
  }, []);

  return { revealEpoch, replay, skip, handles, delays };
}
