// @vitest-environment jsdom
/**
 * @ai-context `useColumnFlip` 的**行为级判据**（批 6 波 C · T33 · 控制方 2026-09-13 裁决「授权路径 B」）。
 *
 * Why 必须有本文件（裁决第 3 条逐字：「hook **无测试 = 无判据**」）：本 hook 是列折叠 Flip 的**唯一**编排点，
 *   而它的正确性在 jsdom 里**没有几何证据**（R5.7 实测：`elementStates[0].bounds` 全 0、位移恒
 *   `translate3d(0px,0px,0px)`、`Flip.fit` 退化成 `scale(0,0)`）⇒ 只能判「**身份契约 + 调用不抛 + timeline 存在 +
 *   **增量**属性集合 ⊆ 合成属性白名单 + 降级 + 三档真源**」这些**弱判据**；**真实几何位移 / 观感 / 帧率本批未测**
 *   （逐字登记在 `task-33-report.md` §5/§9）。
 *
 * 判据与**各自专属**的变异体（变异只在导出副本里做 ⇒ 见报告「变异体实测」节）：
 *   C1 身份契约（跨两棵子树：引用不等 ∧ 同一 `data-flip-id` ∧ 选择器恰命中 1）—— M1：`ColumnBar.tsx` 摘掉 `data-flip-id` ⇒ 红
 *   C1b/C1c **两个真实落点**（`ChatSidebar` / `GoalsPage`）的两态带同一身份 —— M1 同样打红这两条
 *   C2 调用不抛 + 真 Timeline（计划 V1 的**有牙**形态）—— M2：`engine.ts` 的 `registerPlugin` 摘掉 `Flip` ⇒ 红
 *      （⚠️ 计划原写法 `typeof Flip.getState === "function"` 是**空真**：未注册时它照样是 function，T33 实测）
 *   C3 `scale: true` 的机器抓手（R12.3）：Flip **自身写入**的属性增量 ⊆ 白名单 —— M3：hook 去掉 `scale: true` ⇒ 红
 *   C4 reduced-motion 降级（不建 timeline）—— M4：hook 删掉 reduced 分支 ⇒ 红
 *   C5 三档时长取自 token 真源 —— M5：`rich` 回落到 `card` 档 ⇒ 红
 *
 * ⚠️ 仪器边界：jsdom **不排版** ⇒ 本文件**一条几何断言都没有**；动效确定性走 `paused: true` + `timeline.time(t)`
 *   （R8.1）；本仓未装 jest-dom / user-event ⇒ 断言用原生 API、交互用 `fireEvent`；无 `globals` ⇒ 显式 `cleanup`。
 * 副作用：临时装 `matchMedia` 桩（`installMatchMediaStub`，每例 `restore()`）、清 `localStorage`、改 `innerWidth`（例末复原）；
 *   `@tauri-apps/api/core` 走 mock ⇒ 不连 IPC、不碰真实数据。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { animatedProps, installMatchMediaStub } from "../test/motionHarness";
import { gsap } from "../motion/engine";
import { ANIMATABLE_PROPERTIES } from "../motion/shift";
import { DURATION_TOKENS } from "../ui/tokens.gen";
import { flipDurationSec, flipSelector, useColumnFlip, type ColumnFlip } from "./useColumnFlip";
import type { ColumnLayout } from "../hooks/useColumnLayout";
import ColumnBar from "../components/ColumnBar";
import ChatSidebar, { type ChatSidebarProps } from "../components/ChatSidebar";
import GoalsPage from "../pages/GoalsPage";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const ID = "col-harness";
const CHAT_KEY = "chat-sidebar";
const GOALS_KEY = "goals-left";

/** 等动态 `import("../motion/engine")` 与它的 `.then` 落地（**不是** GSAP 时基：本文件的 timeline 恒 `paused`）。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** 折叠态的注入式列状态（判据只关心 `folded`；其余成员给足接口面）。 */
function colStub(folded: boolean): ColumnLayout {
  return {
    width: 260, folded, manuallyFolded: folded,
    resizeBy: vi.fn(), resetWidth: vi.fn(), setManualFolded: vi.fn(), expand: vi.fn(),
  };
}

const CHAT_BASE: Omit<ChatSidebarProps, "col"> = {
  sessions: [], tasks: [], activeChatId: null, activeTaskId: null,
  onSelectChat: vi.fn(), onSelectTask: vi.fn(), onNewChat: vi.fn(),
  onRenameChat: vi.fn(), onDeleteChat: vi.fn(),
  sessionTitles: new Map<number, string>(), noteTitles: new Map<number, string>(),
};

/** 判据用的句柄读取口（渲染期赋值 —— 只有测试 harness 会这么做）。 */
let handle: ColumnFlip["handle"] | null = null;

/** 与生产同形的接线：折叠三元的两棵子树各带同一个 `data-flip-id`（`ChatSidebar` / `GoalsPage` 同款）。 */
function Harness(): React.ReactElement {
  const [folded, setFolded] = useState(false);
  handle = useColumnFlip(ID, folded, { paused: true }).handle;
  return (
    <div>
      <button data-testid="toggle" onClick={() => setFolded((f) => !f)}>t</button>
      {folded ? (
        <ColumnBar flipId={ID} icon="📁" title="户" onClick={() => setFolded(false)} />
      ) : (
        <div data-flip-id={ID} data-testid="panel" style={{ width: 240 }}>面板</div>
      )}
    </div>
  );
}

beforeEach(() => {
  handle = null;
  window.localStorage.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
});

describe("T33 · 列折叠 Flip（路径 B：`data-flip-id` 跨元素配对）", () => {
  it("C1 身份契约：折叠前后是**两棵子树**（引用不等），但两者带**逐字相同**的 `data-flip-id`，且选择器恰命中 1 个", () => {
    const { container } = render(<Harness />);
    const panel = container.querySelector('[data-testid="panel"]');
    expect(panel?.getAttribute("data-flip-id"), "展开态面板未带列身份").toBe(ID);
    expect(document.querySelectorAll(flipSelector(ID)).length, "展开态选择器命中数").toBe(1);

    fireEvent.click(screen.getByTestId("toggle"));
    const bar = screen.getByTestId("column-bar");
    expect(bar.getAttribute("data-flip-id"), "折叠态窄条未带同一个列身份").toBe(ID);
    expect(bar === panel, "折叠前后竟是同一个 DOM 节点（那是路径 A 的形态，不是本路径）").toBe(false);
    expect(document.querySelectorAll(flipSelector(ID)).length, "折叠态选择器命中数").toBe(1);
    expect(panel?.isConnected, "旧子树应已卸载").toBe(false);
  });

  it("C1b 真实落点 1/2 `ChatSidebar`：展开态面板与折叠态窄条带同一个 `data-flip-id`", () => {
    const expanded = render(<ChatSidebar {...CHAT_BASE} col={colStub(false)} />);
    expect(
      expanded.container.querySelector(`[data-flip-id="col-${CHAT_KEY}"]`),
      "ChatSidebar 展开态未带列身份（T33 的 2/8 落点之一）",
    ).not.toBeNull();
    expect(screen.queryByTestId("column-bar")).toBeNull();
    cleanup();

    render(<ChatSidebar {...CHAT_BASE} col={colStub(true)} />);
    expect(screen.getByTestId("column-bar").getAttribute("data-flip-id"), "折叠态窄条未带同一身份").toBe(
      `col-${CHAT_KEY}`,
    );
  });

  it("C1c 真实落点 2/2 `GoalsPage`：展开态左列与折叠态窄条带同一个 `data-flip-id`", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
    const expanded = render(<GoalsPage />);
    expect(
      expanded.container.querySelector(`[data-flip-id="col-${GOALS_KEY}"]`),
      "GoalsPage 展开态左列未带列身份（T33 的 2/8 落点之二）",
    ).not.toBeNull();
    cleanup();

    window.localStorage.setItem(`layout:col-fold:${GOALS_KEY}`, "1"); // 手动折叠记忆
    render(<GoalsPage />);
    expect(screen.getByTestId("column-bar").getAttribute("data-flip-id")).toBe(`col-${GOALS_KEY}`);
  });

  it("C2 调用不抛 + 真 Timeline（计划 V1 的**有牙**形态）：折叠变化后句柄里有一条 `duration()` = card 档的真时间线", async () => {
    render(<Harness />);
    await flush(); // 先让首挂载存下基线（`Flip.getState` 必须不抛：未注册时抛 TypeError）
    expect(handle?.current, "首挂载不该建时间线（只存基线）").toBeNull();

    fireEvent.click(screen.getByTestId("toggle"));
    await flush();
    const tl = handle?.current?.timeline ?? null;
    expect(tl, "折叠后没有时间线 ⇒ `Flip.getState`/`Flip.from` 没跑成（未注册时会抛 `_toArray`）").not.toBeNull();
    expect(typeof tl?.duration(), "返回值不是真 Timeline").toBe("number");
    expect(tl?.duration(), "时长未接 token 真源").toBeCloseTo(flipDurationSec("standard") ?? -1, 5);
    expect(tl?.getChildren().length, "Flip.from 的补间数（位置 + 尺寸两条）").toBe(2);
  });

  it("C3 `scale: true`（R12.3）**增量**口径：Flip 自身写入的属性 ⊆ 合成属性白名单（含 `transform`，不含 layout 属性）", async () => {
    render(<Harness />);
    await flush();
    fireEvent.click(screen.getByTestId("toggle"));
    const bar = screen.getByTestId("column-bar") as HTMLElement;
    const before = animatedProps(bar); // 折叠刚提交、Flip 还没跑：此刻的行内集合全是渲染期写的
    await flush();
    handle?.current?.timeline.time(0.25); // 确定性推进（R8.1）
    const delta = animatedProps(bar).filter((p) => !before.includes(p));

    expect(delta, "Flip 一条属性都没写 ⇒ 本判据会退化成空真").not.toEqual([]);
    expect(delta, "Flip 写出的属性越出白名单（默认 `scale:false` 会写 width/height/max-*/min-*）").toEqual(
      delta.filter((p) => ANIMATABLE_PROPERTIES.includes(p)),
    );
    expect(delta, "transform 路径未生效").toContain("transform");
    expect(before.filter((p) => ANIMATABLE_PROPERTIES.includes(p)), "渲染期不该写合成属性").toEqual([]);
  });

  it("C4 reduced-motion 优先于档位：命中 `reduce` ⇒ **不建**时间线（同树下 `reduce:false` 为**阳性对照**）", async () => {
    // 🔴 档位必须**显式**记成 standard：`useMotionIntensity` 的初值**跟随系统** ⇒ reduce 命中时档位自身就变成
    // `eco`，那样本判据会被「eco 不播」这条旁路**假绿**（T33 变异体 M4 实测踩到：删掉 reduced 分支仍全绿）。
    window.localStorage.setItem("motion:intensity", "standard");
    const noReduce = installMatchMediaStub({ reduce: false });
    try {
      render(<Harness />);
      await flush();
      fireEvent.click(screen.getByTestId("toggle"));
      await flush();
      expect(handle?.current, "阳性对照失败：未 reduce 时本该建时间线（否则本判据测不到东西）").not.toBeNull();
    } finally {
      noReduce.restore();
    }
    cleanup();

    const reduce = installMatchMediaStub({ reduce: true });
    try {
      render(<Harness />);
      await flush();
      fireEvent.click(screen.getByTestId("toggle"));
      await flush();
      expect(handle?.current, "reduced-motion 下仍建了时间线（§8.5 要求跳终态）").toBeNull();
      expect(screen.getByTestId("column-bar").getAttribute("data-flip-id"), "降级不该破坏结构契约").toBe(ID);
    } finally {
      reduce.restore();
    }
  });

  it("C5 三档时长取自 token 真源（逐档数组相等）：`eco` 不播 · `standard` = card · `rich` = reveal", () => {
    const ms = (name: string): number => DURATION_TOKENS.find((t) => t.name === name)?.ms ?? -1;
    const tiers = ["eco", "standard", "rich"] as const;
    expect(tiers.map((t) => flipDurationSec(t))).toEqual([null, ms("card") / 1000, ms("reveal") / 1000]);
    expect(tiers.map((t) => flipDurationSec(t))).toEqual([null, 0.22, 0.5]);
  });

  it("C6 中断（R8.2 **双断言**）：第二次折叠接管后，句柄换成**新**时间线，且**旧时间线已从 globalTimeline 摘除**（收尸）", async () => {
    render(<Harness />);
    await flush();
    fireEvent.click(screen.getByTestId("toggle")); // 展开 → 折叠
    await flush();
    const first = handle?.current?.timeline ?? null;
    expect(first, "第一次折叠没建时间线（本判据的前提）").not.toBeNull();
    // 前提自证（仪器看得见时间线）：新时间线在场上时确实挂在 globalTimeline 上
    expect(gsap.globalTimeline.getChildren().includes(first as never), "仪器看不到时间线 ⇒ 下面的「已摘除」会假绿").toBe(true);

    fireEvent.click(screen.getByTestId("toggle")); // 折叠 → 展开：下一个输入接管，**不排队**
    await flush();
    const second = handle?.current?.timeline ?? null;
    expect(second === first, "旧时间线仍是句柄里那条 ⇒ 没有接管").toBe(false);
    expect(
      gsap.globalTimeline.getChildren().includes(first as never),
      "旧时间线仍挂在 globalTimeline ⇒ 没被收尸（下一个输入接管失败；M6 变异体正是这一条）",
    ).toBe(false);
  });
});
