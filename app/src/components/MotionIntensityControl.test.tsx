// @vitest-environment jsdom
/**
 * @ai-context MotionIntensityControl.test.tsx —— 「动效强度」三段控件的行为级契约（批 6 Task 7），
 *   并承担 **R16.3② 的连带硬要求**：T6 的 `intensity.test.ts` 是 **node 环境**文件（不写 jsdom 头）
 *   ⇒ 「hook 挂载即写 `<html data-motion>`」这一事实在 node 环境**不可判**（那里只能拿假元素判 DOM
 *   写入）⇒ 由本文件补 jsdom 判据：① 挂载即写 ② 切换即改（属性 + 持久化双写）③ 卸载/复挂载读回。
 *
 * Why 每条判据都在这里：
 *   V1 选中态**恰一段**且等于当前档（受控值不是「看着像」，是可数出来的）；
 *   V2 点击 ⇒ `<html data-motion>` **与** `motion:intensity` **双写**（只看 DOM 会被「只 setState
 *      不落地」骗过；只看存储会被「只写属性不记忆」骗过 —— 两半各配一个专属变异体）；
 *   V3 段清单与真源同源：段数 / 文案 / 顺序三项对拍（硬字面量对照，**不从真源派生期望值**，否则
 *      「真源多一档」这类变异不会被发现 —— 与 T6 V7 的 CSS 侧值域判据双向互补）；
 *   V3b 每段点击都落到**自己**那个档位（一一对应，防「三段都写同一个值」）；
 *   V4 **零行内 style**（ADR-033 §4）：扫**整棵子树**而不只根节点（防「包一层带 style 的壳」）；
 *   ⑤ **状态可观测**（控制方 2026-09-13 追加，来自 T6 评审 I-1）：T6 的 `intensity.test.ts` 是 node
 *      环境 + SSR 探针（`renderToString` **返回后**才调 `select` ⇒ 不重渲染 ⇒ 探针永远读到切换**前**
 *      的值，删掉 `setValue(next)` 12 条全绿）⇒ 本文件用 jsdom 的 `renderHook` **切换后再读一次**，
 *      断言读到的是**新档**；同一次切换的另两半（`<html data-motion>` / `motion:intensity`）各自单列，
 *      三半互不代偿（专属变异体 m2a / m2b / m7）。
 *
 * 副作用：只挂 React 树 + 只写 jsdom 的 `<html data-motion>` / `localStorage` 桩 + 局部
 *   `vi.stubGlobal("matchMedia")`（**不动全局 `src/test/setup.ts`**，先例 `usePresence.test.tsx`
 *   `:54-93` 与 `Toast.test.tsx:58-66`）。
 * 边界（诚实登记）：本仓**未装 `jest-dom` / `user-event`** ⇒ 断言一律**原生 DOM API**、交互一律
 *   `fireEvent`；jsdom **不是真浏览器** ⇒ 「三档动画看起来不一样」不可机器判据（同 T6 诚实边界①）。
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionIntensityControl } from "./MotionIntensityControl";
import { MOTION_INTENSITIES, MOTION_INTENSITY_KEY, useMotionIntensity } from "../motion/intensity";

/** §8.5 三档：段名 ↔ 档位取值。**硬字面量**（判据的期望值不许从被测真源派生） */
const TIERS = [
  { key: "eco", label: "节能" },
  { key: "standard", label: "标准" },
  { key: "rich", label: "丰富" },
] as const;
/** T6 `intensity.ts:19` 的唯一入参（逐字） */
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

type MqlListener = (event: MediaQueryListEvent) => void;
interface MatchMediaStub {
  readonly impl: (query: string) => MediaQueryList;
  readonly queries: readonly string[];
  readonly legacyAdded: readonly MqlListener[];
  readonly legacyRemoved: readonly MqlListener[];
}

/**
 * 造一个最小 `matchMedia` 桩（jsdom 30.0.1 **没有** `window.matchMedia` —— 本文件 ④ 自证）。
 * 🔴 `addListener` / `removeListener` **必须**实现：GSAP 与部分库走 **legacy 分支**，只实现
 *   `addEventListener` 时它们**永远不会被调用**（R3.2 的连带口径）。
 */
function stubMatchMedia(matches: boolean): MatchMediaStub {
  const queries: string[] = [];
  const legacyAdded: MqlListener[] = [];
  const legacyRemoved: MqlListener[] = [];
  const mql = {
    matches,
    media: REDUCED_QUERY,
    onchange: null,
    addEventListener: (_type: string, _listener: MqlListener): void => undefined,
    removeEventListener: (_type: string, _listener: MqlListener): void => undefined,
    addListener: (listener: MqlListener | null): void => {
      if (listener !== null) legacyAdded.push(listener);
    },
    removeListener: (listener: MqlListener | null): void => {
      if (listener !== null) legacyRemoved.push(listener);
    },
    dispatchEvent: (): boolean => true,
  } as unknown as MediaQueryList; // 先例：`usePresence.test.tsx:83`（jsdom 无该 API，只能造）
  return {
    impl: (query: string): MediaQueryList => {
      queries.push(query);
      return mql;
    },
    queries,
    legacyAdded,
    legacyRemoved,
  };
}

/** `<html>` 上的档位属性（判据一律读真 DOM，不读组件内部状态） */
const htmlMotion = (): string | null => document.documentElement.getAttribute("data-motion");
/** 三段（段类来自 `ViewSwitcher`：`ed-btn ed-btn--segment`） */
const segs = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>(".ed-btn--segment")];
const segByLabel = (label: string): HTMLButtonElement => {
  const seg = segs().find((s) => s.textContent === label);
  if (seg === undefined) throw new Error(`找不到文案为「${label}」的段`);
  return seg;
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-motion");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-motion");
});

describe("R16.3② ①挂载即写（T6 在 node 环境判不到的那一条）", () => {
  it("挂载前 `<html>` 无 `data-motion`（先证起点干净，防残留属性让断言空真）；挂载后 = standard", () => {
    expect(htmlMotion()).toBeNull();
    render(<MotionIntensityControl />);
    expect(htmlMotion()).toBe("standard");
  });

  it("`prefers-reduced-motion: reduce` ⇒ 初值 eco，且查询串逐字透传给 matchMedia", () => {
    const stub = stubMatchMedia(true);
    vi.stubGlobal("matchMedia", stub.impl);
    render(<MotionIntensityControl />);
    expect(htmlMotion()).toBe("eco");
    expect([...stub.queries]).toEqual([REDUCED_QUERY]);
  });
});

describe("R16.3② ④桩自证：本环境没有 `matchMedia`，且桩实现了 legacy 的 addListener/removeListener", () => {
  it("`typeof window.matchMedia === \"undefined\"`（桩不是奢侈品）", () => {
    expect(typeof window.matchMedia).toBe("undefined");
  });

  it("桩的 addListener/removeListener 真被调用得到（只实现 addEventListener 的桩会漏掉 legacy 分支）", () => {
    const stub = stubMatchMedia(false);
    const mql = stub.impl(REDUCED_QUERY);
    const listener: MqlListener = () => undefined;
    expect(typeof mql.addListener).toBe("function");
    expect(typeof mql.removeListener).toBe("function");
    mql.addListener(listener);
    mql.removeListener(listener);
    expect([...stub.legacyAdded]).toEqual([listener]);
    expect([...stub.legacyRemoved]).toEqual([listener]);
  });
});

describe("V1 当前档反映在 DOM：`aria-pressed=\"true\"` 恰一段且等于当前档", () => {
  it("初值 ⇒ 恰「标准」为 true；点「丰富」后 true 段随之搬走", () => {
    render(<MotionIntensityControl />);
    expect(segs().length).toBe(TIERS.length);
    const pressed = (): string[] =>
      segs().filter((s) => s.getAttribute("aria-pressed") === "true").map((s) => s.textContent ?? "");
    expect(pressed()).toEqual(["标准"]);
    fireEvent.click(segByLabel("丰富"));
    expect(pressed()).toEqual(["丰富"]);
  });
});

describe("R16.3② ②切换即改 + V2 双写：`<html data-motion>` 与 `motion:intensity` 同时落地", () => {
  it("点「丰富」⇒ `data-motion=\"rich\"` 且持久化键 == rich", () => {
    render(<MotionIntensityControl />);
    fireEvent.click(segByLabel("丰富"));
    expect(htmlMotion()).toBe("rich");
    expect(window.localStorage.getItem(MOTION_INTENSITY_KEY)).toBe("rich");
  });
});

describe("R16.3② ⑤状态可观测（T6 评审 I-1 的盲区：node 探针只在渲染期取值）", () => {
  it("`renderHook`：切到 rich 后**再读一次** ⇒ 读到的是新档（删掉 `setValue(next)` 即红）", () => {
    const { result } = renderHook(() => useMotionIntensity());
    expect(result.current[0]).toBe("standard");
    act(() => {
      result.current[1]("rich");
    });
    expect(result.current[0], "读到的仍是切换**前**的值 ⇒ state 没被写").toBe("rich");
  });

  it("组件侧同一事实：点「丰富」后**重新渲染**所得的值 = 新档（`aria-pressed` 由 `value` 算出）", () => {
    render(<MotionIntensityControl />);
    fireEvent.click(segByLabel("丰富"));
    expect(segs().filter((s) => s.getAttribute("aria-pressed") === "true").map((s) => s.textContent)).toEqual(["丰富"]);
  });
});

describe("R16.3② ③卸载 / 复挂载：读回上次档位（持久化真的生效）", () => {
  it("选「丰富」→ 卸载 → 抹掉 `<html>` 上的属性 → 复挂载 ⇒ 又是 rich 且段仍选中", () => {
    const first = render(<MotionIntensityControl />);
    fireEvent.click(segByLabel("丰富"));
    expect(htmlMotion()).toBe("rich");
    first.unmount();
    document.documentElement.removeAttribute("data-motion"); // 防「读到上一次的残留」
    expect(htmlMotion()).toBeNull();
    render(<MotionIntensityControl />);
    expect(htmlMotion()).toBe("rich");
    expect(segByLabel("丰富").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("V3 三段与真源同源（段数 / 文案 / 顺序三项对拍）", () => {
  it("段数 == 3（§8.5）、文案逐字、顺序与 `MOTION_INTENSITIES` 一致", () => {
    render(<MotionIntensityControl />);
    expect(segs().length).toBe(3);
    expect(segs().map((s) => s.textContent)).toEqual(TIERS.map((t) => t.label));
    expect([...MOTION_INTENSITIES]).toEqual(TIERS.map((t) => t.key));
  });
});

describe("V3b 每段都落到自己那个档位（一一对应，防「三段写同一个值」）", () => {
  it("逐段点击 ⇒ `data-motion` 依次 = eco / standard / rich（属性与记忆同时跟手）", () => {
    render(<MotionIntensityControl />);
    for (const tier of TIERS) {
      fireEvent.click(segByLabel(tier.label));
      expect(htmlMotion(), `「${tier.label}」段没有把档位写成 ${tier.key}`).toBe(tier.key);
      expect(window.localStorage.getItem(MOTION_INTENSITY_KEY)).toBe(tier.key);
    }
  });
});

describe("V4 零行内 style（ADR-033 §4：不得用行内 style 覆盖类语义）", () => {
  it("控件**整棵子树**里没有一个元素带 `style` 属性（不只根节点）", () => {
    const { container } = render(<MotionIntensityControl />);
    const all = [...container.querySelectorAll<HTMLElement>("*")];
    expect(all.length, "子树为空 ⇒ 本判据会空真").toBeGreaterThan(2);
    expect(all.filter((el) => el.getAttribute("style") !== null).map((el) => el.tagName)).toEqual([]);
  });
});

describe("DOM 契约（本件 Produces；计划 Interfaces）", () => {
  it("根 = `data-testid=\"motion-intensity\"` + `role=group` + 可访问名「动效强度」", () => {
    render(<MotionIntensityControl />);
    const root = screen.getByTestId("motion-intensity");
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-label")).toBe("动效强度");
  });
});
