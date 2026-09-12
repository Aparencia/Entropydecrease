/**
 * @ai-context useColumnFlip.ts — 列折叠的 **Flip 编排**（批 6 波 C · T33；依据 R5.7 + R12.3 + 控制方 2026-09-13 裁决「授权路径 B」）。
 *
 * Why 单独成件（B 路径的立论，逐字）：R5.7 陈述的问题是「折叠是**条件渲染两棵不同子树** ⇒ **无共享元素可测差**」，
 *   而 `data-flip-id` **正是 GSAP Flip 用来跨不同子树配对的机制** ⇒ **B 直接解决该问题**，且**不动结构**
 *   （追认 B 为 R5.7「先改结构」的等价形态）。⇒ 本 hook 按**选择器**取目标
 *   （`[data-flip-id="…"]`），**不需要**调用方传 ref；面板与窄条各带同一个 `data-flip-id` 即可。
 *
 * Why 经 `await import("../motion/engine")` 取 Flip：按 `engine.guard.test.ts` ③′/③‴，`gsap` / `gsap/*` 的静态与
 *   动态说明符**只许**出现在 `motion/engine.ts` ⇒ `Flip` 由 engine 转出（这是本任务对 engine.ts 的唯一改动，
 *   **不是**第二个 importer；新建第二个 importer 文件会让 ③′ 的集合相等判据当场红）。
 *
 * 🔴 起始态被持有（§8.6.1-1）：Flip 需要「变更前」的形态，而 React 提交后 DOM 已是新形态 ⇒ 本 hook 在**每次提交后**
 *   把当时的形态存进 ref（`stored`），下一次 `folded` 变化时用它做 `Flip.from` 的起点；首次变更之前必须已存过基线
 *   （挂载时的 layout effect 负责）。⚠️ 因此「挂载后 GSAP 尚未装载就立刻折叠」这一窗口里不会播动画（如实登记，见报告）。
 *
 * 🔴 `scale: true`（R12.3 硬要求；本任务实测）：Flip 默认用 `width`/`height` 做补间（实测写入 `width`/`height`/
 *   `max-*`/`min-*`，**越出 R8.4 的合成属性白名单**）；`scale: true` 改走 `transform: scale()` 路径 ⇒ 实测 Flip
 *   **自身**只写 `{"rotate","scale","translate","transform"}` ⊆ 白名单（对照读数与源码旁证
 *   `gsap/Flip.js:702-707` / `:728-746` 见 task-33-report §5）。⇒ **不许**退回 `scale: false`。
 *
 * reduced-motion（§8.5）：命中时**不播**（跳终态，宽度照旧瞬跳）；`matchMedia` 自带守卫（jsdom 30 无它 ⇒ 视为未 reduce）。
 * 三档（R35.4）：`eco` = 不播（§8.5「编排层直接跳终态」）· standard = `--ed-dur-card`(220ms) · rich = `--ed-dur-reveal`(500ms)；
 *   曲线经 `toneEase("paper")` 取 T8 真源（零新造曲线）。
 * 副作用：建 GSAP 时间线 + 写目标元素的行内 `transform`；读 `<html data-motion>`；无 IPC、无网络。
 * 边界：① jsdom **几何零可观测**（R5.7：`elementStates[0].bounds` 全 0、位移恒 `translate3d(0px,0px,0px)`、
 *   `Flip.fit` 退化成 `scale(0,0)`）⇒ 机器判据只有「身份契约 + 调用不抛 + timeline 存在 + **增量**属性集合 ⊆ 白名单」；
 *   ② **真实几何位移 / 观感 / 帧率本批未测**；③ `paused` 只给判据用（确定性时基 R8.1）。
 */
import { useLayoutEffect, useRef } from "react";
import { DURATION_TOKENS, type DurationTokenName } from "../ui/tokens.gen";
import { useMotionIntensity, type MotionIntensity } from "../motion/intensity";
import { toneEase } from "../motion/tone";
import type { GsapTimeline } from "../motion/engine";

/** 系统无障碍查询串（逐字；与 `motion/controls.ts`、`motion/intensity.ts` 同串）。 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** R3.4：#7 列折叠属「有文字的界面」⇒ 活的纸（真源 `motion/tone.ts`，零新造曲线）。 */
const EASE = toneEase("paper");

type EngineModule = typeof import("../motion/engine");
let cache: EngineModule | null = null;
let inflight: Promise<EngineModule> | null = null;

/** 引擎懒加载（模块级缓存：翻转路径上的 `await import()` 只付一次）。 */
function loadEngine(): Promise<EngineModule> {
  if (cache !== null) return Promise.resolve(cache);
  inflight ??= import("../motion/engine").then((m) => {
    cache = m;
    return m;
  });
  return inflight;
}

/** 带守卫的系统偏好读取：无 `window` / 无 `matchMedia`（jsdom 30）⇒ 视为「未 reduce」，不抛。 */
function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mm = (window as { matchMedia?: (q: string) => MediaQueryList }).matchMedia;
  return typeof mm === "function" && mm(REDUCED_MOTION_QUERY).matches === true;
}

/** 列折叠的 Flip 目标选择器（面板与窄条共用同一个 `data-flip-id` ⇒ 跨元素匹配）。 */
export function flipSelector(id: string): string {
  return `[data-flip-id="${id}"]`;
}

/** 档位 ⇒ 时长（秒）；`eco` ⇒ `null` = **不播**（§8.5：编排层直接跳终态）。 */
export function flipDurationSec(tier: MotionIntensity): number | null {
  if (tier === "eco") return null;
  const name: DurationTokenName = tier === "rich" ? "reveal" : "card";
  const token = DURATION_TOKENS.find((t) => t.name === name);
  if (token === undefined) throw new Error(`时长真源缺 --ed-dur-${name}（tokens.gen.ts 与生成器分叉）`);
  return token.ms / 1000;
}

/** 最近一次的编排句柄（`null` = 尚无 Flip 在飞）——确定性推进口 = `handle.current.timeline`。 */
export interface ColumnFlip {
  readonly handle: { current: { timeline: GsapTimeline } | null };
}

/** 把 `folded` 的翻转变成一次 Flip（`data-flip-id` 跨元素配对）；返回最近一次的句柄读取口。 */
export function useColumnFlip(id: string, folded: boolean, opts?: { paused?: boolean }): ColumnFlip {
  const handle = useRef<{ timeline: GsapTimeline } | null>(null);
  const stored = useRef<Flip.FlipState | null>(null);
  const [tier] = useMotionIntensity();
  const paused = opts?.paused ?? false;
  const prevFolded = useRef(folded);

  useLayoutEffect(() => {
    const sel = flipSelector(id);
    // `folded` 真的变了才播（档位/`paused` 变化也会重跑本效果 —— 那不该造出一条「原地 Flip」）
    const changed = prevFolded.current !== folded;
    prevFolded.current = folded;
    void loadEngine().then((m) => {
      const before = stored.current;
      stored.current = m.Flip.getState(sel); // 下一次变更的起点（本次提交后的形态）
      if (before === null || !changed) return; // 首次挂载只存基线；非折叠态变化不播
      // 下一个输入接管（R8.2）。🔴 **两步顺序不可颠倒** —— `motion/controls.ts` 的文件头记着 T11 的实测：
      // 反序（先 `timeline.kill()`）会把子 tween 变成**孤立体**，此后 `killTweensOf` 再也够不着它，
      // 旧动画会继续写 DOM（「看起来已被接管」的假绿）。
      m.gsap.killTweensOf(sel);
      handle.current?.timeline.kill();
      const duration = flipDurationSec(tier);
      if (duration === null || systemPrefersReducedMotion()) return; // eco / reduced ⇒ 跳终态
      handle.current = {
        // `scale: true` 是 R12.3 的硬要求（transform 路径）—— 见文件头，不许改回默认的 width/height 路径
        timeline: m.Flip.from(before, { targets: sel, scale: true, duration, ease: EASE, paused }),
      };
    });
  }, [id, folded, tier, paused]);

  return { handle };
}
