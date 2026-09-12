/**
 * @ai-context usePlayheadJump.ts — #5「时间码回跳」的**唯一动效编排点**（批 6 波 C · T31）。
 *   规格 §8.6 第 5 行逐字「**播放头沿时间轨滑到目标位置，掠过几帧缩略**」（产品理由逐字：
 *   「把**每句话可追溯**变成**可见动作**」）· §8.6.1 第 1/3/4 条 · 裁决 R3.5 / R5.5（+ R5.5-b 三条
 *   硬约束）/ R8.1 / R8.2 / R8.4 / R35.4 / R50.1 / R51.2⑧ / R60.1 · 触发入口 = **既有时间码点击**
 *   （T27 的 `align.trigger` 同址，**不新造按钮、不新造手势**）。
 *
 * 🔴 「滑」的两条通道（分工写死，互不重叠）：
 *   ① **轴向落位 = 元素级滚动**（`seekTo` 由调用方注入，真源 = `TimeRail` 的 `scrollLeftFor` +
 *      `scrollToLeft` 两个既有出口）—— 这条把播放头送到目标点。⚠️ 它**不是**按进度推进的补间：
 *      T25 的判据把 `scrollLeft` 钉成「随 `playheadMs` 同步落位」（四点 `0/52.5/90/120` **逐序**），
 *      改成补间会让那条既有判据变红；且 §8.4 把 GSAP **位移**上限钉在 8px ⇒ 长距离的**轴向**位移
 *      只能用元素级滚动表达。⇒ 本件如实登记：交付的是**轴向落位 + 方向性掠过**，
 *      **不是**逐帧连续的轨道滑动（见报告「诚实边界」）。
 *   ② **GSAP 位移 = ≤8px 的「掠过」**（**只经** `motion/shift.ts` 的 `clampShift`）：起点 =
 *      `clampShift(方向 × 8px)`（方向由**被持有的**上一个目标算出 ⇒ 往回跳时起手方向相反），
 *      终点恒 0（= 落位）。播放头标记与掠过条**各一条** tween ⇒ 观感 = 「轨道就位 + 播放头与
 *      缩略在这一跳的方向上滑入」。
 *
 * 🔴 起始态被持有（R5 通则①）：`from` / `to` 是 **state**（`from` = 上一次的目标 ⇒ 第二次跳转从
 *   **当前位置**反向滑，不回到起点）；`targetMs === null` ⇒ 什么都不做（**不猜位置**）。
 * 🔴 可中断（R5 通则②）：每次跳转**先** `interrupt()` 收尸在飞的旧时间线、再起新的 —— **不排队**；
 *   `interrupt()` 的两步顺序由出口保证（`motion/controls.ts` 文件头：先 `killTweensOf`、后 `kill`）。
 * 🔴 三档自消费（R35.4：出口**不**内置档位分支 ⇒ 波 C 每条动效自己消费）：`eco` = **跳终态**
 *   （0 时长、零在场 tween）· `standard` = `--ed-dur-card`(220ms) · `rich` = `--ed-dur-reveal`(500ms)；
 *   **三档的位移量完全相同**（§8.4 的 8px 是上限，档位只改时长、不改幅度）。帧数由
 *   `screensFor.framesFor` 派生（**不在这里另写一份数字**）。
 * 🔴 reduced-motion（§8.5「系统偏好优先于档位」）：命中 ⇒ **跳终态**（零 tween 且位移 0）+ 掠过条
 *   只渲染目标那一帧。判定在出口（`matchMedia` 只有那一个真源）；本件只**复制那一个查询串**
 *   （先例 `shell/useColumnFlip.ts:37`），不复制出口的降级分支。
 *
 * 🔴 `motion/controls` **静态 import 是安全的**（R60.1 对 R41.3 适用范围的更正）：本件在
 *   `views/session/**` —— 注册表里 `load: () => import("./session/SessionTriTrackView")` 的**惰性链**
 *   上。实测（`engine.guard.test.ts` 的同一支遍历器）：首屏静态可达闭包 **89 文件**里**不含**本目录
 *   ⇒ 静态引入 `controls` 不会把 GSAP 拉进首屏（T27 的 `await import()` 是照抄当时过宽的旧措辞）。
 *
 * 副作用：建 GSAP 时间线（≤2 条）+ 写两个元素的行内 `transform` + 一次元素级滚动写入（经注入的
 *   `seekTo`）。无 IPC、无网络、无存储（档位记忆归 `useMotionIntensity`）。
 * 边界：① `targetMs === null` ⇒ 零动作（不落位、不建时间线）；② 目标未变 ⇒ React 不重渲 ⇒ 不重播；
 *   ③ 掠过条未挂上（`screens` 稀疏 / 缺 `imageUrl` 槽）⇒ 只动播放头标记，**不抛、不占位**；
 *   ④ `paused` 是**判据用的确定性时基**（R8.1 的唯一正解），生产不传 ⇒ ticker 驱动；
 *   ⑤ **观感与真实帧率本批未测**（jsdom 无排版、无 paint）—— 机器抓手只有「被动画的**增量**属性
 *   ⊆ 合成属性白名单」（R8.4）；`<audio>` 的真实 seek 在本环境不可验证（**不得声称「seek 已验证」**）；
 *   ⑥ 定位精度残余 = **块粒度 ±200 ms**（R51.2⑧）—— 本件不碰音频轴，也不声称毫秒级定位。
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { startControllable } from "../../motion/controls";
import type { Controllable } from "../../motion/controls";
import { useMotionIntensity } from "../../motion/intensity";
import type { MotionIntensity } from "../../motion/intensity";
import { SHIFT_MAX_PX, clampShift } from "../../motion/shift";
import { toneEase } from "../../motion/tone";
import { DURATION_TOKENS } from "../../ui/tokens.gen";
import type { DurationTokenName } from "../../ui/tokens.gen";
import { framesFor } from "./screensFor";

/** 系统无障碍查询串（逐字；与 `motion/controls.ts`、`motion/intensity.ts` 同串）。 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** 基调曲线（R3.4：#5 是「读数」面 ⇒ 精密仪器；真源 `motion/tone.ts`，**零新造曲线**）。 */
const EASE = toneEase("instrument");

/** 带守卫的系统偏好读取：无 `window` / 无 `matchMedia`（jsdom 30 实测没有它）⇒ 视为「未 reduce」，不抛。 */
function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mm = (window as { matchMedia?: (q: string) => MediaQueryList }).matchMedia;
  return typeof mm === "function" && mm(REDUCED_MOTION_QUERY).matches === true;
}

/** 档位 ⇒ 滑动时长（秒）：`eco` = **0**（§8.5「节能档…编排层直接跳终态」）· standard 220ms · rich 500ms。 */
export function jumpDurationSec(tier: MotionIntensity): number {
  if (tier === "eco") return 0;
  const name: DurationTokenName = tier === "rich" ? "reveal" : "card";
  const token = DURATION_TOKENS.find((t) => t.name === name);
  if (token === undefined) throw new Error(`时长真源缺 --ed-dur-${name}（tokens.gen.ts 与生成器分叉）`);
  return token.ms / 1000;
}

/**
 * 「掠过」的**起点位移**：方向 = 前进 / 回退（由**被持有的**上一个目标判定），量值恒 ≤8px
 * （只经 `clampShift`）。
 *
 * ⚠️ 首跳（`fromMs === null`）**按「向前」取方向**：播放头首次出现时它位于轨的起点之后 ⇒ 来向是前方。
 * 这是一条**约定**（不是实测的历史位移）—— 位移本身恒 ≤8px，**不宣称任何距离**；若本件要把
 * 「首跳不动」当语义，改这一行即可（判据 V4 只钉「往回跳时方向相反」）。
 * 原地跳（`fromMs === toMs`）⇒ 0（无方向可言 ⇒ 调用方走「跳终态」）。
 */
export function sweepStartPx(fromMs: number | null, toMs: number): number {
  if (toMs === fromMs) return 0;
  return clampShift(fromMs === null || toMs > fromMs ? SHIFT_MAX_PX : -SHIFT_MAX_PX);
}

/** 从 `transform` 串读 `translate` 的 **x** 分量（无 translate 子句 / 单维 y/z 形态 ⇒ 0）。读数口的唯一实现。 */
export function shiftXOf(transform: string): number {
  const m = /translate(X|Y|Z|3d)?\(([^)]*)\)/.exec(transform);
  if (m === null) return 0;
  if (m[1] === "Y" || m[1] === "Z") return 0; // 单维 y/z 形态没有 x 分量（把它的实参当 x 会读反方向）
  const v = Number.parseFloat((m[2] ?? "").split(",")[0] ?? "");
  return Number.isFinite(v) ? v : 0;
}

/** 回跳的读取口：两个**被持有**的量 + 掠过帧数 + 出口句柄 + 两个登记口（`mark` / `strip`）。 */
export interface PlayheadJump {
  /** 最近一次被接住的目标（`null` = 尚未跳转）。 */
  readonly targetMs: number | null;
  /** 本次滑动的**起点**（= 上一次的目标；首跳为 `null`）—— 「可反向」靠它，不靠重放。 */
  readonly fromMs: number | null;
  /** 掠过帧数（档位 × reduced-motion 派生；真源 `screensFor.framesFor`）。 */
  readonly frames: number;
  /** 最近一次的出口句柄（逐序 = 播放头标记、掠过条）；`[]` = 跳终态（eco / reduce / 无方向）。 */
  readonly handles: RefObject<readonly Controllable[]>;
  /** 播放头标记的登记口（`TimeRail` 的 `.ed-timerail__mark`）。 */
  readonly mark: RefObject<HTMLSpanElement | null>;
  /** 掠过条容器的登记口（`ThumbStrip` 的根）。 */
  readonly strip: RefObject<HTMLDivElement | null>;
}

/**
 * 把「目标 ms」变成一次可中断、可反向、三档各异的回跳。`opts.viewport` = 时间轨的滚动容器，
 * `opts.seekTo` = **元素级落位的唯一口**（调用方注入 ⇒ 本件不新造第二套换算）。
 */
export function usePlayheadJump(opts: {
  readonly targetMs: number | null;
  readonly viewport: RefObject<HTMLElement | null>;
  readonly seekTo: (viewport: HTMLElement, ms: number) => void;
  readonly paused?: boolean;
}): PlayheadJump {
  const mark = useRef<HTMLSpanElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  const handles = useRef<readonly Controllable[]>([]);
  /** 被持有的「当前所在位置」= 上一次的目标（ref 版，供同一 effect 内同步读取） */
  const held = useRef<number | null>(null);
  const [landed, setLanded] = useState<{ readonly from: number | null; readonly to: number } | null>(null);
  const [tier] = useMotionIntensity();
  const paused = opts?.paused ?? false;
  const reduced = systemPrefersReducedMotion();
  const targetMs = opts.targetMs;
  const { viewport, seekTo } = opts;

  useEffect(() => {
    if (targetMs === null) return; // 无目标 ⇒ 零动作（不落位、不建时间线）
    const from = held.current;
    held.current = targetMs;
    setLanded({ from, to: targetMs });
    for (const h of handles.current) h.interrupt(); // 新输入接管：**先**收尸在飞的旧时间线（不排队）
    handles.current = [];
    const vp = viewport.current;
    if (vp !== null) seekTo(vp, targetMs); // ① 轴向落位（元素级；与 T25 的 effect 同址同值 ⇒ 幂等）
    const els = [mark.current, strip.current].filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return; // 两个登记口都没挂上 ⇒ 只落位（不抛、不猜）
    /** 出口的**零时长 tween** = 写静态值的唯一正解（R50.1 的两条陷阱：`startAt` 到不了 DOM /
     *  手写 `style.transform` 无效）。kill **不还原**已写出的值 ⇒ 终态留得住。 */
    const write = (el: Element, x: number): void => {
      const settle = startControllable(el, { x, duration: 0, ease: EASE }, { paused: true });
      settle.seek(0);
      settle.interrupt();
    };
    const start = sweepStartPx(from, targetMs);
    const sec = jumpDurationSec(tier);
    if (sec === 0 || reduced || start === 0) {
      // 跳终态（eco / reduced-motion / 无方向）：零时长、零在场 tween，位移落 0
      for (const el of els) write(el, 0);
      return;
    }
    for (const el of els) write(el, start); // 起始态物化（本次相位的起点；R50.1 的正解）
    handles.current = els.map((el) => startControllable(el, { x: 0, duration: sec, ease: EASE }, { paused }));
  }, [targetMs, tier, paused, reduced, seekTo, viewport]);

  // 卸载（切走视图）：收尸在飞的时间线（`epoch` 已不需要 —— 本件无异步到达）
  useEffect(
    () => () => {
      for (const h of handles.current) h.interrupt();
      handles.current = [];
    },
    [],
  );

  return { targetMs: landed?.to ?? null, fromMs: landed?.from ?? null, frames: framesFor(tier, reduced), handles, mark, strip };
}
