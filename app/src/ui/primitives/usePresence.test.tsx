// @vitest-environment jsdom
/**
 * @ai-context usePresence.test.tsx — 卸载时机内核的状态机契约（批 0-D Task 6）。
 *
 * Why jsdom：本 hook 用 `renderHook`（`@testing-library/react` 需 `document`）。**不派发真 DOM 事件** ——
 * `TransitionEndLike` 是结构类型（`{ target, currentTarget }`，T7 可直接挂 `onTransitionEnd`），
 * 所以出场事件用普通对象构造即可：不需要真元素、不需要真 CSS transition（jsdom 不做布局与动画）。
 * 计时一律 `vi.useFakeTimers()`：兜底窗口与「下一 tick 进场」都不真 sleep（整套用例毫秒级完成）。
 *
 * 计划 Task 6 的 9 行状态机 → 用例名对照（报告同表）：
 *   ① 初始 open=false            → "初始 open=false：…"
 *   ② open 假→真 enter→entered   → "open 假→真：…"
 *   ③ 已 entered 后真→假         → "已 entered 后 open 真→假：…"
 *   ④ 本节点 transitionend 卸载  → "出场期间收到本节点 transitionend：…"
 *   ⑤ 出场期间反向（可中断可反向）→ "出场期间 open 又回 true：…"
 *   ⑥ 兜底计时器到点卸载         → "没有 transitionend 时兜底到点卸载：…" + "默认兜底窗口…"
 *   ⑦ reducedMotion=true 直跳终态 → "reducedMotion 命中：…"
 *   ⑧ 子元素冒泡被忽略           → "子元素冒泡：…"
 *   ⑨ 卸载清理                   → "卸载清理：…"
 *
 * 副作用：无（只挂载 React 树；不写磁盘、不发请求）。每个用例后恢复真实计时器并清桩。
 * 边界：断言全部落在状态机上；「有没有真的动起来」是消费方 `[data-phase]` CSS 的职责（T7/T9）。
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { TransitionEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePresence } from "./usePresence";
import type { PresenceOptions, TransitionEndLike } from "./usePresence";

/** 「本节点自身」的替身：同一引用即 `target === currentTarget`（不需要真元素） */
const SELF: unknown = {};
const OWN_EVENT: TransitionEndLike = { target: SELF, currentTarget: SELF };
/** 子元素冒泡：`target` 是另一个对象 ⇒ 必须被忽略 */
const CHILD_EVENT: TransitionEndLike = { target: {}, currentTarget: SELF };

/** 契约里的默认值（`PresenceOptions` 的注释真源；此处独立写死 = 默认值变更必须过这一关） */
const DEFAULT_EXIT_MS = 160;
const DEFAULT_SLACK_MS = 80;

function setup(initialOpen: boolean, options?: PresenceOptions) {
  return renderHook(({ open }: { open: boolean }) => usePresence(open, options), {
    initialProps: { open: initialOpen },
  });
}

/** 推进假计时器（必须包 `act`：状态更新由计时器回调触发） */
function tick(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** 造一个最小 `matchMedia` 实现（jsdom 30 **没有** `window.matchMedia`，故必须自己造） */
function stubMatchMedia(matches: boolean): {
  impl: (query: string) => MediaQueryList;
  queries: string[];
  listeners: Array<(e: { matches: boolean }) => void>;
  removed: Array<(e: { matches: boolean }) => void>;
  setMatches: (next: boolean) => void;
} {
  type Listener = (e: { matches: boolean }) => void;
  const queries: string[] = [];
  const listeners: Listener[] = [];
  const removed: Listener[] = [];
  let current = matches;
  const mql = {
    get matches(): boolean {
      return current;
    },
    media: "",
    onchange: null,
    addEventListener: (_type: "change", listener: Listener): void => {
      listeners.push(listener);
    },
    removeEventListener: (_type: "change", listener: Listener): void => {
      removed.push(listener);
    },
  };
  return {
    impl: (query: string): MediaQueryList => {
      queries.push(query);
      return mql as unknown as MediaQueryList;
    },
    queries,
    listeners,
    removed,
    setMatches: (next: boolean): void => {
      current = next;
      for (const listener of listeners) listener({ matches: next });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("状态机（计划 Task 6 表 9 行逐行）", () => {
  it("① 初始 open=false：mounted=false 且 phase='exit'（什么都不渲染）", () => {
    const { result } = setup(false);
    expect(result.current.mounted).toBe(false);
    expect(result.current.phase).toBe("exit");
  });

  it("② open 假→真：mounted=true 且 phase='enter'；下一 tick 才切 'entered'（transition 需要起点）", () => {
    const { result, rerender } = setup(false);
    rerender({ open: true });
    expect(result.current.mounted).toBe(true);
    expect(result.current.phase).toBe("enter");
    expect(vi.getTimerCount(), "应挂着一个「下一 tick 进球」计时器").toBe(1);
    tick(0);
    expect(result.current.phase).toBe("entered");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("③ 已 entered 后 open 真→假：phase='exit' 且仍 mounted=true（不早退，才有出场动效）", () => {
    const { result, rerender } = setup(true);
    tick(0);
    expect(result.current.phase).toBe("entered");
    rerender({ open: false });
    expect(result.current.phase).toBe("exit");
    expect(result.current.mounted, "退场期间必须仍挂载").toBe(true);
  });

  it("④ 出场期间收到本节点 transitionend：清兜底计时器并立即 mounted=false", () => {
    const { result, rerender } = setup(true);
    tick(0);
    rerender({ open: false });
    act(() => result.current.onTransitionEnd(OWN_EVENT));
    expect(result.current.mounted).toBe(false);
    expect(vi.getTimerCount(), "transitionend 到达后兜底计时器应被清掉").toBe(0);
  });

  it("⑥ 没有 transitionend 时兜底到点卸载（reduced-motion 下永不触发 transitionend 的防线）", () => {
    // 注入 exitMs/timeoutSlackMs ⇒ 兜底窗口可测、不真 sleep
    const { result, rerender } = setup(true, { exitMs: 1000, timeoutSlackMs: 20 });
    tick(0);
    rerender({ open: false });
    tick(1019);
    expect(result.current.mounted, "窗口未到不得卸载").toBe(true);
    tick(1);
    expect(result.current.mounted).toBe(false);
    expect(result.current.phase).toBe("exit");
  });

  it("⑥ 默认兜底窗口 = exitMs 160 + timeoutSlackMs 80 = 240ms（默认值即契约）", () => {
    const { result, rerender } = setup(true);
    tick(0);
    rerender({ open: false });
    tick(DEFAULT_EXIT_MS + DEFAULT_SLACK_MS - 1);
    expect(result.current.mounted).toBe(true);
    tick(1);
    expect(result.current.mounted).toBe(false);
  });

  it("⑤ 出场期间 open 又回 true（可中断/可反向）：清计时器、直回 'entered'、不重新进场", () => {
    const { result, rerender } = setup(true);
    tick(0);
    rerender({ open: false });
    expect(result.current.phase).toBe("exit");
    rerender({ open: true });
    expect(result.current.mounted).toBe(true);
    expect(result.current.phase, "反向必须直回 entered（回 'enter' = 重新进场 = 闪一下）").toBe("entered");
    expect(vi.getTimerCount(), "退场兜底计时器必须被清掉（否则到点会把弹层卸掉）").toBe(0);
    tick(10_000);
    expect(result.current.mounted, "反向接管后不得再被退场流程卸载").toBe(true);
  });

  it("⑦ reducedMotion 命中：进场立即 'entered'、出场立即 mounted=false（不等 transitionend）", () => {
    const stub = stubMatchMedia(true);
    vi.stubGlobal("matchMedia", stub.impl);
    const { result, rerender } = setup(false);
    expect(result.current.reducedMotion).toBe(true);
    rerender({ open: true });
    expect(result.current.mounted).toBe(true);
    expect(result.current.phase).toBe("entered");
    expect(vi.getTimerCount(), "reduced-motion 下不排任何计时器").toBe(0);
    rerender({ open: false });
    expect(result.current.mounted).toBe(false);
  });

  it("⑧ 子元素冒泡（target !== currentTarget）被忽略：仍挂载，直到兜底到点", () => {
    const { result, rerender } = setup(true);
    tick(0);
    rerender({ open: false });
    act(() => result.current.onTransitionEnd(CHILD_EVENT));
    expect(result.current.mounted, "子元素的过渡不得卸载本节点").toBe(true);
    tick(DEFAULT_EXIT_MS + DEFAULT_SLACK_MS);
    expect(result.current.mounted).toBe(false);
  });

  it("⑧' 进场过渡的 transitionend 不得卸载（phase 不是 'exit' 时忽略）", () => {
    const { result } = setup(true);
    act(() => result.current.onTransitionEnd(OWN_EVENT));
    expect(result.current.mounted).toBe(true);
    expect(result.current.phase).toBe("enter");
  });

  it("⑨ 卸载清理：清掉挂起的兜底计时器（照 useTransientToast 的「cleanup 直接读 ref」写法）", () => {
    const { rerender, unmount } = setup(true);
    tick(0);
    rerender({ open: false });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount(), "卸载后不得留计时器（防卸载后 setState）").toBe(0);
  });

  it("②' 初始 open=true 也走 enter → entered 两拍（不是直跳 entered）", () => {
    const { result } = setup(true);
    expect(result.current.phase).toBe("enter");
    tick(0);
    expect(result.current.phase).toBe("entered");
  });
});

describe("matchMedia 守卫（规格 §8.4：本仓无桩，直调即崩）", () => {
  it("环境本身没有 matchMedia（vitest 全局 node + 本仓 jsdom 30 都未实现该 API）", () => {
    expect(
      typeof window.matchMedia,
      "此断言变红说明 jsdom 升级后实现了 matchMedia；守卫对 node 全局环境仍然必需",
    ).toBe("undefined");
  });

  it("matchMedia 不存在 ⇒ reducedMotion=false 且不抛错（渲染本身即断言）", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = setup(true);
    expect(result.current.reducedMotion).toBe(false);
  });

  it("matchMedia 不命中（matches=false）⇒ false；change 改判后跟随变 true", () => {
    const stub = stubMatchMedia(false);
    vi.stubGlobal("matchMedia", stub.impl);
    const { result } = setup(true);
    expect(result.current.reducedMotion).toBe(false);
    act(() => stub.setMatches(true));
    expect(result.current.reducedMotion).toBe(true);
  });

  it("自定义 reducedMotionQuery 被透传给 matchMedia（调用点可换查询串）", () => {
    const stub = stubMatchMedia(true);
    vi.stubGlobal("matchMedia", stub.impl);
    const { result } = setup(true, { reducedMotionQuery: "(prefers-contrast: more)" });
    expect(stub.queries).toContain("(prefers-contrast: more)");
    expect(result.current.reducedMotion).toBe(true);
  });

  it("卸载后移除 change 监听（removeEventListener 收到同一个处理器）", () => {
    const stub = stubMatchMedia(false);
    vi.stubGlobal("matchMedia", stub.impl);
    const { unmount } = setup(true);
    expect(stub.listeners).toHaveLength(1);
    unmount();
    expect(stub.removed).toEqual(stub.listeners);
  });
});

describe("契约（T7 / T8 / T9 依赖）", () => {
  it("React 的 TransitionEvent 结构上满足 TransitionEndLike（可直接挂 onTransitionEnd）", () => {
    const handler: (e: TransitionEvent<HTMLDivElement>) => void = (e: TransitionEndLike): void => {
      void e;
    };
    expect(typeof handler).toBe("function");
  });
});
