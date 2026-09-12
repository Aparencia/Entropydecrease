/**
 * @ai-context controls.ts — **可中断 / 可反向动效的唯一出口**（批 6 T11 · 裁决 R8.2 · R5 通则②）。
 *
 * Why 单独成件：规格 §8.6 的六个签名动效（#1 对齐 · #2 显影编排 · #3 相变凝固 · #4 刻度生长 ·
 *   #5 时间码回跳 · #6 记忆浮现）与列折叠都要满足 R5 通则②「下一个输入接管，**不排队**」，而各落点
 *   自建 timeline 会踩同一个**会假绿**的坑 —— 裁决 R8.2 逐字：「GSAP 3 默认 `overwrite:false` ⇒
 *   覆盖同属性时**旧 tween 仍在跑**，**只看 `style.transform` 会假绿**」。⇒ 本出口一次做对两件事：
 *   ① 每个 tween 强制 `overwrite: "auto"`（新动画首次渲染时杀掉同属性的旧 tween）；
 *   ② `interrupt()` **真 kill**，**不是**「起一条新 tween 覆盖同属性」—— 尖刺 S2.4(b) 实测：默认
 *   `overwrite:false` 下两条 tween 并存（`globalTimeline` 子项计数 2）、旧句柄 `totalTime()` 一路到 1.0，
 *   而 DOM 看起来「已被接管」。
 *
 * 🔴 `interrupt()` 的两步**顺序不可颠倒**（T11 在 jsdom 实测）：必须 `gsap.killTweensOf(target)` **先**、
 *   `timeline.kill()` **后**。反序时子 tween 变成孤立 tween —— `timeline.kill()` 只把时间线从
 *   `globalTimeline` 摘除、**不动**其子 tween，而孤立 tween 此后 `killTweensOf` 再也够不着：实测再推那条
 *   旧时间线的播放头，它照样写 DOM（`translate3d(30px…)` 冻不住、`totalTime()` 0.3 → 1）。
 *
 * 🔴 **两条 API 陷阱（R8.3）**：① `timeline.to()` 返回的是 **Timeline 本身、不是 Tween** ⇒ 要 tween 句柄
 *   只能用 `timeline.getChildren()[0]`（把返回值当 tween 用会让「旧 tween 冻结」一类断言**恒真 = 假绿**）；
 *   ② **绝不可**把 jsdom 的 `performance` 挂到 `globalThis`（`Performance-impl.js:14` 自调用 ⇒ 栈溢出）。
 *
 * reduced-motion（§8.5「系统 `prefers-reduced-motion` 优先于档位」）：命中时**直接落终态、不建 tween**
 *   （`tweenCount(target)` = 0），调用方无需分支；`matchMedia` **自带守卫**（尖刺实测 jsdom 30.0.1 没有它
 *   ⇒ 视为「未 reduce」，不抛）。
 *
 * 副作用：建 GSAP 时间线 / 写目标元素的内联样式；无存储、无 IPC、无网络。
 * 边界：① 本出口**不判**观感与真实帧率 —— R8.4 逐字：真实帧率**本批未测**（jsdom 不可达），机器抓手只有
 *   「被动画属性集合 ⊆ 合成属性白名单」（`assertAnimatable`）；② 本出口**不**做三档强度（`data-motion`）
 *   分支 —— 档位是 CSS 侧的幅度通道（R3.1），在 JS 侧再实现一遍会造成双写真相；③ `assertAnimatable` 只看
 *   **传进来的属性名**，读数口由调用方给（`test/motionHarness.ts` 的 `animatedProps` 读 `el.style` 内联集合，
 *   看不见类规则里的属性）；④ 出口**挡不住**绕过它直接调 tween 的写法 —— 那由属性集合审计与评审兜。
 */
import { gsap } from "./engine";
import type { GsapTimeline } from "./engine";
import { ANIMATABLE_PROPERTIES } from "./shift";

/** 系统无障碍查询串（逐字；与 `ui/primitives/motion.css` 的 reduced-motion 块、`motion/intensity.ts` 同串）。 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 波 C 六个动效共用的句柄（计划 T11 Interfaces 的冻结快照）。 */
export interface Controllable {
  readonly timeline: GsapTimeline;
  /** 下一个输入接管：kill 当前 + 可选**立即**起下一个（不是排队）。 */
  interrupt(next?: () => void): void;
  /** 反向：只改方向、不改播放头（尖刺 S2.5(a)）。 */
  reverse(): void;
  /** 播放头定位（测试用；确定性推进走 `test/motionHarness.ts` 的 `freezeAt`）。 */
  seek(t: number): void;
}

/** 带守卫的系统偏好读取（R3.2）：无 `window` / 无 `matchMedia`（jsdom 30）⇒ 视为「未 reduce」，不抛。 */
function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mm = (window as { matchMedia?: (query: string) => MediaQueryList }).matchMedia;
  return typeof mm === "function" && mm(REDUCED_MOTION_QUERY).matches === true;
}

/** 句柄装配（两条路径共用 —— `interrupt` 的 kill 顺序正是本文件的核心语义，不许各写一遍）。 */
function handleFor(timeline: GsapTimeline, target: Element): Controllable {
  return {
    timeline,
    interrupt: (next) => {
      gsap.killTweensOf(target); // 🔴 必须**先**摘 tween，再 kill 时间线（见文件头：反序会留下够不着的孤立 tween）
      timeline.kill();
      if (next !== undefined) next(); // 立即起下一个：接管语义，不是排队
    },
    reverse: () => {
      timeline.reverse();
    },
    seek: (t) => {
      timeline.time(t);
    },
  };
}

/**
 * 建一条**可中断、可反向、可 seek** 的动效。`opts.paused` = 建 paused 时间线（测试的确定性推进需要它）。
 * 🔴 调用方给的 `overwrite` 一律被本出口覆盖为 `"auto"`（**覆盖不是合并**）—— 那是「接管」语义的一半。
 */
export function startControllable(target: Element, vars: gsap.TweenVars, opts?: { paused?: boolean }): Controllable {
  if (systemPrefersReducedMotion()) {
    // 降级：直接落终态。`gsap.set` 是零时长 set（实测不留在场 tween ⇒ `tweenCount` = 0）；再摘掉在飞的旧 tween，
    // 否则旧动画会继续覆盖终态。返回的**惰性时间线**里没有任何 tween（seek / reverse 皆为空操作）。
    gsap.set(target, vars);
    gsap.killTweensOf(target);
    return handleFor(gsap.timeline({ paused: true }), target);
  }
  const timeline = gsap.timeline({ paused: opts?.paused ?? false });
  timeline.to(target, { ...vars, overwrite: "auto" });
  return handleFor(timeline, target);
}

/** 属性集合审计（R8.4 的机器抓手）：越出合成属性白名单即**抛**（不静默通过）。 */
export function assertAnimatable(props: readonly string[]): void {
  const offenders = props.filter((p) => !ANIMATABLE_PROPERTIES.includes(p));
  if (offenders.length > 0) {
    throw new Error(`assertAnimatable: 被动画属性越出合成属性白名单（会触发排版）：${offenders.join(", ")}`);
  }
}
