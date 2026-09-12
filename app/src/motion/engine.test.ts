// @vitest-environment jsdom
/**
 * @ai-context engine.test.ts — 唯一 GSAP 入口 `motion/engine.ts` 的**行为级契约**
 *   （ADR-035 §2 · 裁决 R2.2 · 计划 T3 的 Verification V2/V3/V4）。
 *
 * Why 每条判据都在这（编号 ↔ 计划 V 号，逐条各带专属变异体，见 task-3-report.md）：
 *   B1（V2）StrictMode 单 tween：证明顶层 `registerPlugin(useGSAP, …)` 那一行**真的在防** React 19
 *        StrictMode 的双 tween —— 尖刺 S3.2 的核心发现是「不注册时 `useGSAP` 与裸 `useEffect`
 *        表现完全一样」（各留 2 个 tween，且不报错、不警告），所以这条判据是**唯一**能钉住那行的。
 *   B2（V3）卸载清净：`context.revert()` **同时**清 inline `transform` 与 tween；手写 `tween.kill()`
 *        只移除 tween、inline 值会留下（尖刺 S3.3）⇒「无残留」是独立判据，不是 B1 的推论。
 *   B3/B4/B5（V4）四插件真的注册（第四个 useGSAP 由 B1/B2 覆盖）：CustomEase（具名 ease 进得了
 *        `gsap.parseEase` 的表且曲线值正确）· Flip（`getState` 读得到状态 —— 未注册时 `Flip` 的
 *        `_toArray` 未注入，直接 `TypeError`）· ScrollToPlugin（元素级 `scrollTop` 真的被写；
 *        未注册时 GSAP 只打印 `Invalid property scrollTo … Missing plugin` 并静默不动）。
 *
 * 判据纪律（R8.1/R8.3）：确定性推进**只用** `gsap.timeline({ paused: true })` + `tl.time(t)`；
 *   本文件**不**用 `gsap.updateRoot` / `gsap.ticker.tick` / `gsap.ticker.sleep` / `await sleep`，
 *   **不**把 jsdom 的 `performance` 挂到 `globalThis`（会自调用栈溢出）。断言全部同步。
 * 为什么 B3/B4 用 `await import("gsap/CustomEase")` 取句柄：GSAP 家族的**静态** import 只许出现在
 *   `motion/engine.ts`（R2.1③ / R11.1 的闭包判据），测试要拿插件类只能走**动态** import；
 *   动态与静态最终解析到同一个 `node_modules/gsap/<Plugin>.js`（ESM 按 URL 缓存），
 *   因此拿到的正是 `engine.ts` 注册过的那一个类对象 —— 这正是本条判据要断的东西。
 * 边界：本文件**不**验证 `vendor-gsap` 懒 chunk（那要真实构建产物 ⇒ 归 T4 的 `engine.guard.test.ts`）；
 *   Flip 的**几何位移**在 jsdom 里恒为 0（尖刺 S2.6）⇒ 只断「注册生效」，不断位移量；
 *   `ScrollToPlugin` 的 `window` 目标读数恒 0（尖刺 S2.7）⇒ 只断元素级。
 * 本文件是 `.ts`（照计划 T3 的 Files 表命名）⇒ 用 `createElement` 而不是 JSX 语法
 *   （仓内同款先例：`ui/primitives/usePresence.node.test.ts` · `views/useViewMemory.test.ts`）。
 */
import { StrictMode, createElement, useRef } from "react";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { gsap, useGSAP } from "./engine";

type Timeline = ReturnType<typeof gsap.timeline>;

/** B2 要 seek 的 timeline 句柄：paused timeline 不 seek 就写不出 inline `transform`，判据会假绿。 */
const handles: { timeline: Timeline | null } = { timeline: null };

/** 取最近一次 `useGSAP` 回调建的 timeline；取不到就显式抛（判据不得静默通过）。 */
function lastTimeline(): Timeline {
  if (handles.timeline === null) throw new Error("useGSAP 回调没有建立 timeline —— 探针失效");
  return handles.timeline;
}

/** B1 探针：根级非 paused tween（读数口径 = tween 数，不 seek）。 */
function StrictProbe(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.to(ref.current, { x: 100, duration: 0.5, ease: "none" });
  }, []);
  return createElement("div", { ref });
}

/** B2 探针：paused timeline（R8.1 唯一正解）—— seek 后 `transform` 有确定值，卸载后必须被清。 */
function PausedProbe(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    handles.timeline = gsap.timeline({ paused: true });
    handles.timeline.to(ref.current, { x: 100, duration: 0.5, ease: "none" });
  }, []);
  return createElement("div", { ref });
}

/** 造一个游离元素（B4/B5 的载体；不需要挂在 React 树上）。 */
function detachedDiv(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("engine：唯一 GSAP 入口的行为契约", () => {
  it("B1 StrictMode 下 useGSAP 只留 1 个 tween（双断言：元素级 + globalTimeline）", () => {
    // 本文件第一条用例 ⇒ 全局时间线必须是空的（否则「恰好 1」这条读数会被跨用例残留做假）
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    const { unmount, container } = render(
      createElement(StrictMode, null, createElement(StrictProbe)),
    );
    const el = container.firstElementChild as HTMLElement;

    expect(gsap.getTweensOf(el)).toHaveLength(1);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(1);

    unmount();
    expect(gsap.getTweensOf(el)).toHaveLength(0);
  });

  it("B2 卸载后 revert 同时清掉 inline transform 与 tween（手写 kill 只清 tween）", () => {
    handles.timeline = null;
    const { unmount, container } = render(createElement(PausedProbe));
    const el = container.firstElementChild as HTMLElement;

    lastTimeline().time(0.25);
    expect(el.style.transform).toBe("translate3d(50px, 0px, 0px)");

    unmount();
    expect(el.style.transform).toBe("");
    expect(gsap.getTweensOf(el)).toHaveLength(0);
  });

  it("B3 CustomEase 已注册：具名 ease 进得了 ease 表，且曲线值逐点正确", async () => {
    const { CustomEase } = await import("gsap/CustomEase");
    CustomEase.create("ed-t3-probe", "0.2,0,0,1");

    const ease = gsap.parseEase("ed-t3-probe");
    expect(typeof ease).toBe("function");
    // 曲线值 = 尖刺 S2.2 的实测读数（t=0.25 ⇒ 60.7029%）：证明 ease 真进了 GSAP 的表，
    // 而不是「碰巧有个同名函数」。未注册 CustomEase 时 parseEase 返回 undefined ⇒ 本条即红。
    expect(ease(0.25)).toBeCloseTo(0.607029, 4);
  });

  it("B4 Flip 已注册：getState 读得到元素状态（未注册时 _toArray 未注入 ⇒ TypeError）", async () => {
    const { Flip } = await import("gsap/Flip");
    const el = detachedDiv();

    const state = Flip.getState(el);
    expect(state).toBeTypeOf("object");
    expect(state.targets).toHaveLength(1);
    expect(state.targets[0]).toBe(el);
  });

  it("B5 ScrollToPlugin 已注册：元素级 scrollTo 真的写 scrollTop", () => {
    const el = detachedDiv();
    expect(el.scrollTop).toBe(0);

    const tl = gsap.timeline({ paused: true });
    tl.to(el, { scrollTo: { y: 120 }, duration: 1, ease: "none" });
    tl.time(0.5);

    expect(el.scrollTop).toBe(60);
  });
});
