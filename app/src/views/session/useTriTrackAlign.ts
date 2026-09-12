/**
 * @ai-context useTriTrackAlign.ts — #1「对齐」的**唯一动效编排点**（批 6 波 C · T27）。
 *   规格 §8.6 第 1 行「转写/画面/笔记三轨从错位滑到对齐」—— 🔴 **第三轨 = OCR 文字**（§8.6 的
 *   批 5 加注逐字：会话三轨 = `segments` / `screens` / `ocr_blocks`，三份数据全在 `SessionDetail`
 *   里；「笔记轨」是产物不是原料 ⇒ 未交付）· §8.6.1 第 1/3/4 条 · 裁决 R3.5 / R5.1 / R8.1 /
 *   R8.2 / R8.4 / R35.4。
 *
 * 🔴 **「错位」的形态 = R5.1 的裁定，本文件是它的唯一实现（实施者不得另行发明）**：
 *   · 三轨条目按 **`data-ms`** 共轴；**非对齐轨** = 画面 / OCR 两条派生轨（转写轨是**时间基**，
 *     不施加偏移）⇒ 各带一个**位移偏移**（±8px，**只经** `motion/shift.ts` 的唯一出口
 *     `clampShift`，见 `misalignOffset`）；
 *   · 交互触发 ⇒ 两条轨**滑到对齐位**（`y → 0`）＋ **同 ms 的三个条目高亮共轴关系**（修饰类由视图
 *     按 `aligned && item.ms === ms` 加；本件不碰 DOM 类名）；
 *   · **反向** = 再次触发（对齐 → 错位）或切走再回（视图重挂 ⇒ 起始态 = 错位）；
 *   · **可中断** = 新输入接管：每次触发**先** `interrupt()` 收尸在飞的旧时间线，**不排队**。
 *   ⚠️ R5.1 未规定**触发入口** ⇒ 本任务取视图**既有**的那个交互（时间码点击 = 视图唯一的用户动作），
 *     不新造按钮、不新造手势。
 *
 * 🔴 **起始态被持有**（R5 通则①）：`aligned` 是 React **state**（`false` = 错位 = 起始态，由
 *   `START_ALIGNED` 冻结），**不是**一次性 tween 的副作用 —— 触发时从**当前持有态**反向播到另一端；
 *   `ms` 同样是被持有的量（共轴组的唯一凭据；`null` = 尚未触发 ⇒ 高亮为空集，不是「全部」）。
 *   挂载时**立即**把错位偏移物化进 DOM（零时长 tween）⇒ 「错位」在没有任何交互时也真实存在。
 *
 * 🔴 **两条 GSAP 陷阱（R50.1；T30 实测，勿再犯）**：① `startAt` 被 GSAP 另建为一条 **lazy** 的
 *   zero-duration set ⇒ **paused 时间线下到不了 DOM**；② **手写 `style.transform` 无效**
 *   （CSSPlugin 的 `_getComputedTransformMatrixAsArray` 只认 `matrix(...)`，且元素一旦有 GSAP 缓存
 *   就干脆不看 DOM）⇒ 写起始态 / 终态的**唯一正解** = 出口的**零时长 tween**：
 *   `startControllable(el, {…, duration: 0}, {paused: true})` → `seek(0)` → `interrupt()`
 *   （kill **不还原**已写出的值）。
 *
 * 🔴 `controls.ts` **只许经 `await import()` 到达**（R41.3 / §三十四 #23）：它内部静态
 *   `import "./engine"`（见 `motion/controls.ts` 的文件头「使用纪律」）⇒ 静态引入它会把 GSAP 拉进
 *   **首屏静态闭包**（`engine.guard.test.ts` 的闭包交集判据会红，不是静默洞）。`import type` 不进
 *   产物、也不建静态边（那条守卫的正则显式排除 `import type`）。
 *
 * 🔴 三档（R35.4：出口**不**内置档位分支 ⇒ 波 C 每条动效自己消费）：`useMotionIntensity()` 读
 *   `data-motion`，**档位变化时重新取值**；`eco` = §8.5「编排层直接跳终态」（**不建编排 timeline**）·
 *   `standard` = `--ed-dur-card`(220ms)、两条轨同拍 · `rich` = `--ed-dur-reveal`(500ms) + 第二条轨
 *   **错开** 25%（复用 T29 `staggeredFreeze` 的同一比例，零新数字）。**三档的位移量完全相同** ——
 *   R3.5 的 8px 是**上限**：档位只加时长与错开，**不改幅度**。
 *   reduced-motion 与 `eco` 走**同一条**跳终态路径：命中判定在出口（`matchMedia` 只有那一个真源），
 *   本件**不复制**第二个 `matchMedia` 分支。
 *
 * 副作用：建 GSAP 时间线 + 写两条非参考轨的 `transform`；经 `useMotionIntensity` 读写档位记忆与
 *   `<html data-motion>`。无 IPC、无网络、无订阅、无存储。
 * 边界：① 两条轨容器未挂上（含整块空态）⇒ **不建时间线、不抛、不猜**；② `eco` / reduce / 无相位差
 *   （挂载物化、档位变化）⇒ 只写静态终态、零在场 tween；③ `opts.paused` 是**判据用的确定性时基**
 *   （R8.1 的唯一正解），生产不传 ⇒ ticker 驱动；④ **观感与真实帧率本批未测**（jsdom 无排版、
 *   无 paint）—— 机器抓手只有「被动画属性 ⊆ 合成属性白名单」（R8.4）。
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

/** 三轨的轨名 —— **`data-track` 锚的唯一字面量来源**（转写轨在首位 = 时间基）。 */
export type TrackKey = "transcript" | "screen" | "ocr";

/** 非参考轨 = 施加错位偏移的两条（R5.1「非对齐轨」）。🔴 **第三轨 = OCR**（§8.6 批 5 加注逐字）。 */
export const MISALIGNED_TRACKS = ["screen", "ocr"] as const;
export type MisalignedTrack = (typeof MISALIGNED_TRACKS)[number];

/** 起始态 = **错位**（未对齐）：对齐只在交互触发后发生（R5.1「从错位滑到对齐」）。 */
export const START_ALIGNED = false;

/** `rich` 档第二条轨的错开比例（delay = 时长 × 该比例）—— 复用 T29 `staggeredFreeze` 的 25%。 */
const RICH_STAGGER = 0.25;

/** 基调曲线（R3.4：#1 是「读数」面 ⇒ 精密仪器；真源在 `motion/tone.ts`，零新造曲线）。 */
const EASE = toneEase("instrument");

/**
 * 错位态下某条非参考轨的位移量 —— **位移只经这一个出口**（R3.5 的 8px 是硬上限）。
 * 符号只用来让两条派生轨朝**相反**方向错开（相对错位量翻倍 ⇒ 「错位」看得见）；量值恒 ≤ `SHIFT_MAX_PX`。
 */
export function misalignOffset(track: MisalignedTrack): number {
  return clampShift(track === "screen" ? SHIFT_MAX_PX : -SHIFT_MAX_PX);
}

/** 错位态 / 对齐态 ⇒ 该轨的静态位移（**纯函数**：判据直接钉它；对齐态恒 0）。 */
export function offsetOf(track: MisalignedTrack, aligned: boolean): number {
  return aligned ? 0 : misalignOffset(track);
}

/** 从 `transform` 串读 `translate` 的 y 分量（无 translate 子句 ⇒ 0 = 未被位移）。读数口的唯一实现。 */
export function shiftYOf(transform: string): number {
  const m = /translate(Y|3d|X|Z)?\(([^)]*)\)/.exec(transform);
  if (m === null) return 0;
  const args = (m[2] ?? "").split(",").map((s) => Number.parseFloat(s));
  const v = args[m[1] === "Y" ? 0 : 1]; // `translateY` 只有一维；`translate`/`translate3d` 的第 2 个实参才是 y
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** 档位 ⇒ 时长（秒）：`eco` = **0**（§8.5「节能档…编排层直接跳终态」）· standard 220ms · rich 500ms。 */
export function alignDurationSec(tier: MotionIntensity): number {
  if (tier === "eco") return 0;
  const name: DurationTokenName = tier === "rich" ? "reveal" : "card";
  const token = DURATION_TOKENS.find((t) => t.name === name);
  if (token === undefined) throw new Error(`时长真源缺 --ed-dur-${name}（tokens.gen.ts 与生成器分叉）`);
  return token.ms / 1000;
}

/** 档位 ⇒ `{ 时长, 错开 }`：只有 `rich` 错开（`standard` / `eco` 两条轨同拍）。 */
export function alignTiming(tier: MotionIntensity): { readonly sec: number; readonly stagger: number } {
  const sec = alignDurationSec(tier);
  return { sec, stagger: tier === "rich" ? sec * RICH_STAGGER : 0 };
}

/** 第 `index` 条非参考轨的 delay（逐序 = `MISALIGNED_TRACKS`）；`eco` ⇒ 0（不建时间线）。 */
export function laneDelaySec(index: number, tier: MotionIntensity): number {
  return index * alignTiming(tier).stagger;
}

/** 对齐动效的读取口：两个**被持有**的量 + 触发口 + 两条轨的登记口 + 出口句柄。 */
export interface TriTrackAlign {
  /** 持有的对齐态（`false` = 错位 = 起始态）。下一次触发的方向由它反转 ⇒ 「可反向」靠的是它。 */
  readonly aligned: boolean;
  /** 选中的共轴 ms（`null` = 尚未触发 ⇒ 高亮为空集）。 */
  readonly ms: number | null;
  /** 交互触发：**同一个 ms** 再触发 ⇒ 反向（对齐 ⇄ 错位）；换一个 ms ⇒ 在新的一刻重新对齐。 */
  readonly trigger: (next: number) => void;
  /** 两条非参考轨的登记口（`useMemo` ⇒ 身份稳定，不会每次渲染重挂）。 */
  readonly attach: Readonly<Record<MisalignedTrack, (el: HTMLElement | null) => void>>;
  /** 最近一次的出口句柄（逐序 = `MISALIGNED_TRACKS`）；`[]` = 无编排时间线（eco / 轨未挂上）。 */
  readonly handles: RefObject<readonly Controllable[]>;
}

/** 把「触发一次对齐」变成可中断、可反向的位移；返回两个持有量。 */
export function useTriTrackAlign(opts?: { paused?: boolean }): TriTrackAlign {
  const [aligned, setAligned] = useState<boolean>(START_ALIGNED);
  const [ms, setMs] = useState<number | null>(null);
  const els = useRef<Record<MisalignedTrack, HTMLElement | null>>({ screen: null, ocr: null });
  const handles = useRef<readonly Controllable[]>([]);
  const previous = useRef<boolean>(START_ALIGNED);
  const epoch = useRef(0);
  const [tier] = useMotionIntensity();
  const paused = opts?.paused ?? false;

  const attach = useMemo(() => {
    const out = {} as Record<MisalignedTrack, (el: HTMLElement | null) => void>;
    for (const track of MISALIGNED_TRACKS) out[track] = (el) => { els.current[track] = el; };
    return out as Readonly<Record<MisalignedTrack, (el: HTMLElement | null) => void>>;
  }, []);

  useEffect(() => {
    const from = previous.current; // 起始态**被持有**：从当前持有态反向播，不重放
    const to = aligned;
    previous.current = to;
    const lanes = MISALIGNED_TRACKS.map((track) => els.current[track]);
    if (lanes.some((el) => el === null)) return; // 轨容器未挂上（含空态）⇒ 不建时间线（不抛、不猜）
    epoch.current += 1;
    const mine = epoch.current;
    for (const h of handles.current) h.interrupt(); // 新输入接管：**先**收尸在飞的旧时间线（不排队）
    handles.current = [];
    const { sec } = alignTiming(tier);
    void import("../../motion/controls").then(({ startControllable }) => {
      if (mine !== epoch.current) return; // 已被更新的触发接管 ⇒ 丢弃这次（不排队）
      /** 出口的**零时长 tween** = 写静态值的唯一正解（R50.1 的两条陷阱见文件头）。 */
      const write = (el: Element, y: number): void => {
        const jump = startControllable(el, { y, duration: 0, ease: EASE }, { paused: true });
        jump.seek(0);
        jump.interrupt(); // 立刻收尸：kill 不还原已写出的值，也不留时间线
      };
      const targets = MISALIGNED_TRACKS.map((track, i) => [track, lanes[i] as Element] as const);
      if (from === to || sec === 0) {
        // 无相位差（挂载时物化错位态 / 档位变化）/ eco（"编排层直接跳终态"）⇒ 只落静态值，不建 timeline
        for (const [track, el] of targets) write(el, offsetOf(track, to));
        return;
      }
      for (const [track, el] of targets) write(el, offsetOf(track, from)); // 起始态物化（本次相位的起点）
      handles.current = targets.map(([track, el], i) =>
        startControllable(
          el,
          { y: offsetOf(track, to), duration: sec, delay: laneDelaySec(i, tier), ease: EASE },
          { paused },
        ),
      );
    });
  }, [aligned, tier, paused]);

  // 卸载（切走）：收尸在飞的时间线，并让晚到的动态 import 结果作废（`epoch` 一推即弃）。
  useEffect(() => () => {
    epoch.current += 1;
    for (const h of handles.current) h.interrupt();
    handles.current = [];
  }, []);

  /** 触发：同一 ms ⇒ 反向；换 ms ⇒ 先置「对齐」（那一刻是新输入，不是回退）。 */
  const trigger = useCallback((next: number) => {
    setAligned((prev) => (next === ms ? !prev : true));
    setMs(next);
  }, [ms]);

  return { aligned, ms, trigger, attach, handles };
}
