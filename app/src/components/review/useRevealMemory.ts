/**
 * @ai-context useRevealMemory.ts — #6「记忆浮现」的**唯一动效编排点**（批 6 波 C · T32）。
 *   规格 §8.6 第 6 行逐字「**墨色洇开** + **字距极轻收敛（用 `x` 而非 `letterSpacing`）** + **剪报底纹左刷** +
 *   **评分按钮随后浮起** | 揭晓是有节奏的一件事」· §8.6.1 第 1/3/4 条 · 裁决 R5.6 / R8.1–R8.4 / R35.4 / R48.1。
 *
 * 🔴 **字距收敛为什么用 `x` 而不是 `letterSpacing`**（R5.6 的硬判据逐字）：`letter-spacing` 是 **layout 属性**
 *   —— 动它会让整段文本**逐帧重排**（line-box 重算），既越出 R8.4 的合成属性白名单
 *   `{transform, translate, rotate, scale, opacity, filter}`，也让「未动 layout 属性」这条代理判据失效。
 *   `x` 走 `transform` ⇒ 合成层位移、零重排。⇒ **本模块与调用点一个 `letterSpacing` 字面量都没有**
 *   （判据 = `useRevealMemory.test.tsx` 的 V1：两文件剥注释后 0 命中，且全仓读数仍为 **5**）。
 *
 * 🔴 `Text.css:15-20` 的「墨度 + letter-spacing」钩子**怎么接上的**（§8.6.1 第 3 条的接缝兑现）：
 *   · **墨度那半 = 真的在用**：答案文本交回 `Text` 原语渲染（`.ed-text` 是该钩子的唯一出口）；本 hook 在
 *     揭晓**挂载之后**把墨度档位从 `ink-3` 翻到 `ink-1`（两相：先低墨度，再翻档）⇒ 浏览器**真的**会跑
 *     那条 `color` 的 CSS transition（挂载即高墨度 ⇒ 没有 from 值 ⇒ transition 永不触发）。`inkTone()` 是
 *     那次翻档的纯函数；低档取 `ink-3` 而**不是** `ink-4` —— `Text.css:30-33` 逐字「`ink-4` 是过渡态…
 *     不得承载唯一关键信息」，而答案是复习面上唯一的关键信息。
 *   · **letter-spacing 那半 = 被 `x` 取代**（理由见上）：接缝的声明仍留在 `Text.css`（`.ed-text` 的既有
 *     契约，本任务不改），但**不参与本动效** —— 同一件事改由 `track` 段的 `x` 表达。
 *   · 该 transition 是 **transition-only 落点**，但 `.ed-text` 恰是 reduced-motion 名单的 12 个基类之一
 *     （`motion.css:301`，`transition-duration: 1ms !important`）⇒ **不落 R48.1 的机制缺口**（见报告）。
 *
 * 四段（**唯一** timeline；起点互不相同 = 错开；相对位置全是总时长的**分数** ⇒ 不引入新的时长数字）：
 *   ① `ink`   = `back` 块 `opacity: 0.35 → 1`（墨色洇开）+ 上面那次墨度翻档
 *   ② `track` = 答案文本层 `x: 4px → 0`（字距极轻收敛的**位移**表达；4 = `SHIFT_MAX_PX / 2`，「极轻」取上界一半）
 *   ③ `clip`  = 剪报底纹条 `scaleX: 0 → 1`，`transform-origin: left`（左刷 = 从左侧长出去，R5.6 逐字）
 *   ④ `rate`  = 评分行 `opacity: 0 → 1` + `y: 8px → 0`（「随后」= `at` 最大 ⇒ 最后一段才动；8 = §8.4 硬上限）
 *   `INK_FROM = 0.35` 是**视觉振幅**（§8.4 只封顶位移、未给不透明度真源）：取 0 会让答案「不存在」（那是弹入
 *   不是洇开），取 1 则没有落差。
 *
 * 🔴 起始态**被持有**（§8.6.1-1）：`progress: 0..1` 逐帧从 `timeline.progress()` 折回（跨渲染存活 ⇒ 不给
 *   React 加每帧 setState）。重入（档位变化 / 再次揭晓）时起始形态由 `revealStateAt(progress)` 给出 ⇒ 从
 *   **当前进度**续播、不跳回起点；**收起**（评分后必经路径）把持有量归零 ⇒ 下一张卡从起点浮现（M5：不归零
 *   ⇒ 下一张「从终态开始」= 看不出浮现）。
 * 🔴 可中断（§8.6.1-3）：每次揭晓**先** `interrupt()` 收尸在飞的旧时间线（kill 不还原已写出的值），再起新的
 *   一条 ⇒ 下一个输入接管、**不排队**；动态 import 到达时若 epoch 已变 ⇒ 丢弃这次（晚到的旧输入不许再起一条）。
 * 🔴 收起 = 立即落终态（机制②逐字）：四件写终态后交出。面板里四件随条件渲染**卸载** ⇒ 该写法对面板是空转
 *   （DOM 侧无观测面，诚实边界见报告）；对 hook 契约（宿主保留元素时）是可观测的。
 * 🔴 reduced-motion（系统优先于档位）：**不自己分支** —— 出口命中时已 `gsap.set` 落终态并返回**零 tween** 的
 *   惰性时间线 ⇒ 本 hook 据此（`getChildren()` 为空）把其余三件一并落终态（V7 的 M7 死在这一行）。
 * 🔴 三档（R35.4：出口**不**内置档位分支 ⇒ 每条波 C 动效自己消费）：`eco` = §8.5「编排层直接跳终态」
 *   （**不建编排 timeline**）· standard = `--ed-dur-reveal`(500ms) · rich = reveal + card(720ms，仍 ≤900)。
 *   基调取 `instrument`（§8.3 逐字把「复习」列在「精密仪器」面），曲线经 `toneEase()` 取 T8 真源。
 *
 * 副作用：建 GSAP 时间线 / 写目标元素内联样式；读档位记忆与 `<html data-motion>`；无 IPC、无网络。
 * 边界：① 元素由调用点给（本模块不渲染 DOM）⇒ 任一 ref 未挂上即防御性返回（不抛、不猜）；
 *   ② 观感与真实帧率**本批未测**（jsdom 无排版 / 无 paint）—— 机器抓手只有「被动画属性 ⊆ 合成属性白名单」；
 *   ③ 动态 import 失败 ⇒ `.catch` 把四件落终态（不把用户留在半墨的答案 / 不可见的评分行上）；
 *   ④ 「剪报底纹」今天**不是**复习面板里的既有资产（`--ed-mark-clip` 的既有载体在 `NoteMarkdown` 的
 *   blockquote 与 `SessionProofView`，R5.6 的诚实边界②已登记）⇒ 本模块只给**行为**，承载层由调用点新建。
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { DURATION_TOKENS, type DurationTokenName } from "../../ui/tokens.gen";
import { useMotionIntensity, type MotionIntensity } from "../../motion/intensity";
import { SHIFT_MAX_PX } from "../../motion/shift";
import { toneEase } from "../../motion/tone";
import type { TextTone } from "../../ui/primitives/Text";
// 🔴 **只取类型**（`import type` 不进产物、也不建静态边 —— `engine.guard.test.ts` 的遍历正则显式排除它）：
// `controls.ts` 自己静态 `import { gsap } from "./engine"` ⇒ **不许从「首屏静态可达」的模块静态引入
// 它**（旧措辞「只许经 `await import()` 到达」**过宽**，R60.1 更正 R41.3 的适用范围；**惰性视图 /
// 注册表驱动静态引入是安全的**）。本件在惰性链上（`ReviewSessionPanel` ← `ReviewPage` 经
// `shell/navRegistry.ts:27` 的 `lazy()`）⇒ 今天仍只取类型 + 动态 `import()`（**形态不变**；首屏模块
// 一旦静态取值引入它，`engine.guard.test.ts` 的闭包交集会红 —— 不是静默洞）。
import type { Controllable, startControllable } from "../../motion/controls";

/** 出口的 vars 类型别名（`gsap.TweenVars` 的同义表达 —— 不必 import gsap 命名空间）。 */
type RevealVars = Parameters<typeof startControllable>[1];

/** 洇开的**浓度起点**（视觉振幅，不是数据真源：§8.4 只封顶位移）。0 = 答案「不存在」（弹入，不是洇开）。 */
export const INK_FROM = 0.35;
/** 「极轻」收敛的位移起点 = 上界的一半（`shift.ts` 边界①逐字：8px 是**上界、不是目标值**）。 */
export const TRACK_FROM_PX = SHIFT_MAX_PX / 2;
/** 「浮起」的位移起点 = §8.4 的硬上限本身（逐字「位移上限 8px」的合法上界）。 */
export const RATE_FROM_PX = SHIFT_MAX_PX;

/** 基调曲线（R3.4：§8.3 把「复习」列在「精密仪器」面 ⇒ 本面四段一律 instrument；真源在 `motion/tone.ts`）。 */
const EASE = toneEase("instrument");

/** 四段的**相对**编排（总时长的分数）：起点 0 / 1/6 / 1/3 / 1/2 互不相同 = 错开；末段在 1.0 处收口。 */
export const REVEAL_SEGMENTS = {
  ink: { at: 0, len: 1 / 2 },
  track: { at: 1 / 6, len: 1 / 2 },
  clip: { at: 1 / 3, len: 1 / 2 },
  rate: { at: 1 / 2, len: 1 / 2 },
} as const;
export type RevealSegment = keyof typeof REVEAL_SEGMENTS;

/** 四件在某一时刻的**形态**（归一量：`track`/`lift` 是 px，其余 0..1）。 */
export interface RevealState {
  /** ① 墨色洇开：`back` 块的不透明度 */
  readonly ink: number;
  /** ② 字距极轻收敛：答案文本层的位移（px） */
  readonly track: number;
  /** ③ 剪报底纹左刷：底纹条的横向缩放（0..1，left 原点 ⇒ 从左侧长出去） */
  readonly clip: number;
  /** ④ 评分按钮浮起：评分行的不透明度 */
  readonly rate: number;
  /** ④ 评分按钮浮起：评分行的纵向位移（px） */
  readonly lift: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** 段内归一进度（段外夹到两端）—— 段窗口是**分数**口径，与总时长解耦。 */
function span(progress: number, seg: RevealSegment): number {
  const { at, len } = REVEAL_SEGMENTS[seg];
  if (len <= 0) return progress >= at ? 1 : 0;
  return clamp01((progress - at) / len);
}

/**
 * 播放头进度 ⇒ 四件的形态（**线性**插值：曲线真源在 GSAP/token，往本层复制一条曲线必然会与真源漂移）。
 * 这是「起始态被持有」的唯一兑现口：重入时从这里给出起点。
 */
export function revealStateAt(progress: number): RevealState {
  const p = Number.isFinite(progress) ? clamp01(progress) : 0;
  const i = span(p, "ink");
  const t = span(p, "track");
  const c = span(p, "clip");
  const r = span(p, "rate");
  return {
    ink: INK_FROM + (1 - INK_FROM) * i,
    track: TRACK_FROM_PX * (1 - t),
    clip: c,
    rate: r,
    lift: RATE_FROM_PX * (1 - r),
  };
}

/** 墨度档位（`.ed-text` 钩子的消费点）：揭晓挂载后由 `ink-3` 翻到 `ink-1`（见文件头「怎么接上的」）。 */
export function inkTone(inked: boolean): TextTone {
  return inked ? "ink-1" : "ink-3";
}

/** 时长真源查表（同 T30 的 `growthDurationSec`：token 缺失即**抛**，不许静默取默认值）。 */
function tokenMs(name: DurationTokenName): number {
  const token = DURATION_TOKENS.find((t) => t.name === name);
  if (token === undefined) throw new Error(`时长真源缺 --ed-dur-${name}（tokens.gen.ts 与生成器分叉）`);
  return token.ms;
}

/**
 * 档位 ⇒ 总时长（秒）：`eco` = **0**（§8.5「节能档…编排层直接跳终态」）· standard = `--ed-dur-reveal`(500ms，逐字
 * 「显影/编排层」) · rich = reveal + card（§8.5「编排层加长」⇒ 720ms，仍 ≤ §8.1 编排层带的上界 900ms）。
 */
export function revealDurationSec(tier: MotionIntensity): number {
  if (tier === "eco") return 0;
  return (tokenMs("reveal") + (tier === "rich" ? tokenMs("card") : 0)) / 1000;
}

/** 段在**秒**口径下的窗口（起点 / 时长）—— timeline 定位与判据读数共用这一个纯函数。 */
export function segmentWindow(total: number, seg: RevealSegment): { at: number; duration: number } {
  const { at, len } = REVEAL_SEGMENTS[seg];
  return { at: total * at, duration: total * len };
}

/**
 * `transform` 串里 `scale(...)` 的**第一个**实参（`scaleX` 简写只写一维时也是它）；无 `scale(...)` ⇒ 1。
 * ⚠️ 与 T30 的 `scaleYOf`（取**第二个**实参）**不可互相代用** —— 那是 scaleY 的读口，这是 scaleX 的。
 */
export function scaleXOf(transform: string): number {
  const args = (/scale\(([^)]*)\)/.exec(transform)?.[1] ?? "").split(",").map((s) => Number.parseFloat(s));
  const x = args[0];
  return typeof x === "number" && Number.isFinite(x) ? x : 1;
}

/**
 * 出口的**零时长 tween**：把一组值立刻物化进 DOM。🔴 另两条「写起点」的路都被 T30 实测否掉：① `startAt`
 * 被 GSAP 另建为一条 **lazy** 的 zero-duration set（`gsap-core.js:2904-2917`）⇒ paused 时间线下**到不了 DOM**；
 * ② 手写 `style.transform = "…"` 无效 —— CSSPlugin 的 `_getComputedTransformMatrixAsArray`（`CSSPlugin.js:700-703`）
 * 只认 `matrix(...)`，且元素有 GSAP 缓存时 `_parseTransform`（`:813`）直接返回缓存、不看 DOM。
 * ⇒ 正解 = `seek(0)` 落值、`interrupt()` 立刻收尸（kill **不还原**已写出的值，也不留时间线）。
 */
function writeNow(start: typeof startControllable, el: HTMLElement, vars: RevealVars): void {
  const jump = start(el, { ...vars, duration: 0 }, { paused: true });
  jump.seek(0);
  jump.interrupt();
}

/** 四件的元素句柄 + 持有的编排进度 + 出口句柄（跨渲染存活）。 */
export interface RevealMemory {
  /** ① 墨色洇开：`back` 块 */
  readonly ink: RefObject<HTMLDivElement | null>;
  /** ② 字距极轻收敛：答案文本层 */
  readonly track: RefObject<HTMLDivElement | null>;
  /** ③ 剪报底纹左刷：底纹条（`transform-origin` 必须是 left —— 静态样式，不进被动画属性集合） */
  readonly clip: RefObject<HTMLDivElement | null>;
  /** ④ 评分按钮随后浮起：评分行 */
  readonly rate: RefObject<HTMLDivElement | null>;
  /** 持有的编排进度 0..1（**起始态被持有**的状态源；收起 ⇒ 归 0）。 */
  readonly progress: RefObject<number>;
  /** 墨度是否已翻到高墨度（答案文本的 `Text tone` 接这个值）。 */
  readonly inked: boolean;
  /** 最近一次的出口句柄（确定性推进口 = `handle.timeline` + `freezeAt`）。 */
  readonly handle: RefObject<Controllable | null>;
}

/** 把 `revealed`（既有 state）变成一次**可中断、可反向**的四段揭晓；返回四件句柄与持有量。 */
export function useRevealMemory(revealed: boolean, opts?: { paused?: boolean }): RevealMemory {
  const ink = useRef<HTMLDivElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const clip = useRef<HTMLDivElement | null>(null);
  const rate = useRef<HTMLDivElement | null>(null);
  const progress = useRef(0);
  const handle = useRef<Controllable | null>(null);
  const epoch = useRef(0);
  const [inked, setInked] = useState(false);
  const [tier] = useMotionIntensity();
  const paused = opts?.paused ?? false;

  useEffect(() => {
    const mine = (epoch.current += 1);
    handle.current?.interrupt(); // 下一个输入接管：**先**收尸在飞的旧时间线（kill 不还原已写出的值）
    handle.current = null;
    if (!revealed) {
      progress.current = 0; // 收起 ⇒ 持有的进度归零（不归零 ⇒ 下一张从终态起播，看不出浮现）
      setInked(false); // 墨度也回起点（否则下一张挂载即高墨度 ⇒ 那条 color transition 永不触发）
      const leaving = [ink.current, track.current, clip.current, rate.current];
      if (leaving.some((node) => node === null)) return; // 元素已随条件渲染卸载 ⇒ 无观测面（见文件头边界）
      const [inkOut, trackOut, clipOut, rateOut] = leaving as [HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement];
      const end = revealStateAt(1); // 终形态的唯一真源（零新数字）
      void import("../../motion/controls").then(({ startControllable }) => {
        if (mine !== epoch.current) return; // 期间已有新输入 ⇒ 这次落终态作废（不排队）
        writeNow(startControllable, inkOut, { opacity: end.ink });
        writeNow(startControllable, trackOut, { x: end.track });
        writeNow(startControllable, clipOut, { scaleX: end.clip });
        writeNow(startControllable, rateOut, { opacity: end.rate, y: end.lift });
      });
      return;
    }
    // 挂载**之后**翻档 ⇒ 浏览器看到「低墨度 → 高墨度」两相 ⇒ Text.css 的 color transition 真的跑（接缝兑现）
    setInked(true);
    const total = revealDurationSec(tier);
    const els = [ink.current, track.current, clip.current, rate.current];
    if (els.some((el) => el === null)) return; // 元素未挂上：防御性返回（不抛、不猜）
    const [inkEl, trackEl, clipEl, rateEl] = els as [HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement];
    const start = revealStateAt(progress.current); // 起始态**被持有** ⇒ 从这里起播，不回起点
    void import("../../motion/controls")
      .then(({ startControllable }) => {
        if (mine !== epoch.current) return; // 已被更新的输入接管 ⇒ 丢弃这次（不排队）
        // 起始态物化（§8.6.1-1；正解与两条被否掉的路见 `writeNow` 的注释）
        const write = (el: HTMLDivElement, vars: RevealVars): void => writeNow(startControllable, el, vars);
        write(inkEl, { opacity: start.ink });
        write(trackEl, { x: start.track });
        write(clipEl, { scaleX: start.clip });
        write(rateEl, { opacity: start.rate, y: start.lift });
        const settle = (): void => {
          write(inkEl, { opacity: 1 });
          write(trackEl, { x: 0 });
          write(clipEl, { scaleX: 1 });
          write(rateEl, { opacity: 1, y: 0 });
          progress.current = 1;
        };
        if (total === 0) {
          // eco（§8.5 逐字「编排层直接跳终态」）⇒ **不建编排 timeline**（终态由零时长 tween 写）
          settle();
          return;
        }
        const w = (seg: RevealSegment): { at: number; duration: number } => segmentWindow(total, seg);
        const first = startControllable(
          inkEl,
          { opacity: 1, duration: w("ink").duration, ease: EASE },
          { paused },
        );
        if (first.timeline.getChildren().length === 0) {
          settle(); // reduced-motion：出口已把 ink 落终态 ⇒ 其余三件一并落终态，**零 tween**
          handle.current = first; // 惰性时间线（零 tween）：seek / reverse 皆为空操作
          return;
        }
        // 后三段挂到**同一条** timeline 上（唯一 timebase ⇒ 唯一的 seek/reverse/interrupt 面；
        // `overwrite: "auto"` 与出口同口径 —— 新动画首次渲染时杀掉同属性的旧 tween）。
        first.timeline.to(trackEl, { x: 0, duration: w("track").duration, ease: EASE, overwrite: "auto" }, w("track").at);
        first.timeline.to(clipEl, { scaleX: 1, duration: w("clip").duration, ease: EASE, overwrite: "auto" }, w("clip").at);
        first.timeline.to(rateEl, { opacity: 1, y: 0, duration: w("rate").duration, ease: EASE, overwrite: "auto" }, w("rate").at);
        // 持有量逐帧折回（ref 写入 ⇒ 不给 React 加每帧 setState）；`tl.time(t)`（判据的确定性推进）同样会触发。
        first.timeline.eventCallback("onUpdate", () => {
          progress.current = clamp01(first.timeline.progress());
        });
        handle.current = first;
      })
      .catch(() => {
        // 降级（防御性）：引擎不可得 ⇒ 把四件的终态直接写进内联样式，不把用户留在半墨的答案 / 不可见的
        // 评分行上。⚠️ 这里手写 `style` 可以：GSAP 从未到达这些元素 ⇒ 不存在 R50.1 的「缓存不看 DOM」问题。
        inkEl.style.opacity = "1";
        trackEl.style.transform = "";
        clipEl.style.transform = "scaleX(1)";
        rateEl.style.opacity = "1";
        rateEl.style.transform = "";
        progress.current = 1;
      });
  }, [revealed, tier, paused]);

  return { ink, track, clip, rate, progress, inked, handle };
}
