/**
 * @ai-context L1 原语：**卸载时机内核**（批 0-D Task 6）。`Modal` / `ConfirmDialog` / `Toast` 共用。
 *
 * Why：React 的卸载是同步的 —— 写成 `open === false` 就 `return null` 根本没有出场路径（现状
 * 「早退式卸载」11 行/10 文件，recon §8.3），而 GSAP 只驱动 tween、**不管"什么时候可以从 DOM 摘掉"**。
 * 规格 §8.4 把这件事显式划给本 hook：它只产出 `mounted` + `phase` 三态，进退场的"样子"由消费方的
 * `[data-phase]` CSS 决定（本 hook 不碰 DOM、不写样式、不 import 动画库）。
 *
 * 三条规格硬要求（§8.4 末段，逐条落点）：
 *   ① **只负责卸载时机** —— 无 DOM 引用、无样式、无动画库依赖，只有计时器与一个媒体查询订阅；
 *   ② **`transitionend` + 超时兜底** —— reduced-motion（或 `display:none`、属性未变化）下**永远不会有
 *      `transitionend`**，只等事件就是「关不掉的弹层」；故退场时同时挂 `exitMs + timeoutSlackMs`
 *      兜底计时器，到点强制卸载（两条路谁先到谁生效，另一条随即清掉）；
 *   ③ **`matchMedia` 自带守卫** —— vitest 全局 `environment: "node"`、`setup.ts` 只桩了 `Range`
 *      （本仓 jsdom 30 也没实现 `window.matchMedia`）⇒ 直调会 `undefined is not a function`；
 *      故一律经 `getMediaQueryList()`，环境缺能力时按「不命中」处理。
 *
 * 副作用：至多一个 `setTimeout`（进场下一 tick / 退场兜底）与一个 `matchMedia` 的 `change` 监听；
 * 卸载时全部清理（照 `app/src/hooks/useTransientToast.tsx:45-50` 的「cleanup 里直接读 ref」写法 ——
 * 快照 ref 会变成死守卫，那里修过一个同款 bug）。
 *
 * 边界：① 只认**本节点自身**的 `transitionend`（`event.target === event.currentTarget`）—— 子元素
 * 的过渡冒泡上来不得卸载本节点；② `phase !== "exit"` 时的 `transitionend`（进场过渡）不得卸载；
 * ③ **可中断 / 可反向**（规格 §8.6.1 第 3 条）：退场途中 `open` 回 `true` ⇒ 清计时器、直回
 * `"entered"`，**不回 `"enter"`**（重新进场 = 起点重放 = 弹层闪一下）；④ 一次绘制都没发生过的关闭
 * 不排退场窗口（`enter` 的下一 tick 是宏任务，浏览器的绘制机会在它之前 ⇒ 没画过就别等），直接
 * `mounted=false`；⑤ 「下一 tick」用 `setTimeout(…, 0)` 而非 effect 级联：必须让出一次绘制机会，
 * 否则 `enter` 与 `entered` 被合并进同一帧 ⇒ CSS transition 没有起点（瞬跳），中间态也不可测。
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 三相位：`enter` = 已挂载的起点态（等一帧让 CSS 过渡起步）、`entered` = 终态、`exit` = 退场中 */
export type PresencePhase = "enter" | "entered" | "exit";

/**
 * `transitionend` 事件的**最小结构契约**。React 的 `TransitionEvent<T>` 结构上满足它
 * （`target` / `currentTarget` 都赋给 `unknown`），故消费方可直接 `onTransitionEnd={onTransitionEnd}`；
 * 测试也用普通对象构造事件 —— 不需要真元素、不需要真过渡（类型层断言见 `usePresence.test.tsx`）。
 */
export interface TransitionEndLike {
  readonly target: unknown;
  readonly currentTarget: unknown;
}

export interface PresenceOptions {
  /** 出场名义时长（= CSS 的 `--ed-dur-overlay-out` / `--ed-dur-toast-out`），默认 `160` */
  exitMs?: number;
  /** 兜底冗余窗口（`transitionend` 可能被抢占或永不到达），默认 `80` */
  timeoutSlackMs?: number;
  /** 媒体查询串，默认 `"(prefers-reduced-motion: reduce)"` */
  reducedMotionQuery?: string;
}

export interface Presence {
  /** 是否仍应渲染：退场期间保持 `true`，直到 `transitionend` 或兜底到点 */
  mounted: boolean;
  /** 消费方挂在元素上的 `data-phase` 值 */
  phase: PresencePhase;
  /** 直接挂 `onTransitionEnd` */
  onTransitionEnd: (event: TransitionEndLike) => void;
  /** reduced-motion 是否命中（本 hook 已据此直跳终态；消费方可据此跳过编排层动效） */
  reducedMotion: boolean;
}

/** 见 @ai-context 边界⑤：`0` ms = 让出一次绘制机会的宏任务 */
const ENTER_TICK_MS = 0;

/**
 * 读媒体查询 —— **唯一允许触碰 `window.matchMedia` 的地方**（守卫在此收口）。
 * 返回 `null` = 环境不支持（node 全局环境无 `window`；本仓 `setup.ts` 无桩、jsdom 30 未实现），
 * 调用方一律当「不命中」，绝不直调。
 */
function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  if (typeof window.matchMedia !== "function") return null;
  return window.matchMedia(query);
}

/** 订阅 reduced-motion（初始值走惰性 state，避免每次渲染都读媒体查询） */
function useReducedMotion(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => getMediaQueryList(query)?.matches ?? false);

  useEffect(() => {
    const mql = getMediaQueryList(query);
    if (mql === null) {
      setMatches(false);
      return;
    }
    setMatches(mql.matches);
    // 老实现只有 addListener/removeListener；缺任一能力时退化为「只读一次快照」，不抛错
    if (typeof mql.addEventListener !== "function" || typeof mql.removeEventListener !== "function") return;
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * 卸载时机内核。`open` 由消费方控制，返回值里的 `mounted` / `phase` 驱动渲染与 `[data-phase]`。
 */
export function usePresence(open: boolean, options: PresenceOptions = {}): Presence {
  const {
    exitMs = 160,
    timeoutSlackMs = 80,
    reducedMotionQuery = "(prefers-reduced-motion: reduce)",
  } = options;

  const reducedMotion = useReducedMotion(reducedMotionQuery);
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<PresencePhase>(open ? "enter" : "exit");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 是否已经完成过一次进场（= 被画到过屏上）；区分「首次进场」与「退场中被反向打开」 */
  const enteredRef = useRef(false);
  /** 事件处理器要读当前相位，又不该因相位变化换身份 ⇒ 用 ref 镜像（事件总在 effect 之后到达） */
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimer = useCallback((): void => {
    const timer = timerRef.current;
    if (timer !== null) {
      clearTimeout(timer);
      timerRef.current = null;
    }
  }, []);

  // 主状态机：只由 open / reducedMotion 驱动（其余输入都在事件处理器与计时器里）
  useEffect(() => {
    clearTimer();
    if (open) {
      setMounted(true);
      if (reducedMotion) {
        enteredRef.current = true;
        setPhase("entered");
        return;
      }
      if (enteredRef.current) {
        setPhase("entered"); // 可反向：接管退场流程；不经过 "enter"，避免重新进场闪一下
        return;
      }
      setPhase("enter");
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        enteredRef.current = true;
        setPhase("entered");
      }, ENTER_TICK_MS);
      return;
    }
    if (reducedMotion) {
      enteredRef.current = false;
      setMounted(false); // 直跳终态：reduced-motion 下不会有 transitionend，等它就是「关不掉的弹层」
      setPhase("exit");
      return;
    }
    if (!enteredRef.current) {
      setMounted(false); // 从没画到屏上（见 @ai-context 边界④）：不必等退场
      setPhase("exit");
      return;
    }
    setPhase("exit");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      enteredRef.current = false;
      setMounted(false); // 兜底：「关不掉的弹层」防线（reduced-motion 下没有 transitionend）
    }, exitMs + timeoutSlackMs);
  }, [open, reducedMotion, exitMs, timeoutSlackMs, clearTimer]);

  // 卸载清理：cleanup 里**直接读 ref**（快照 ref = 死守卫，见 useTransientToast.tsx:45-50 的先例）
  useEffect(
    () => () => {
      const timer = timerRef.current;
      if (timer !== null) clearTimeout(timer);
    },
    [],
  );

  const onTransitionEnd = useCallback(
    (event: TransitionEndLike): void => {
      if (event.target !== event.currentTarget) return; // 子元素冒泡：不是本节点的过渡
      if (phaseRef.current !== "exit") return; // 进场/终态的过渡不得卸载
      clearTimer();
      enteredRef.current = false;
      setMounted(false);
    },
    [clearTimer],
  );

  return { mounted, phase, onTransitionEnd, reducedMotion };
}
