// @vitest-environment jsdom
/**
 * @ai-context `loadingMigration.test.tsx` — 批 4 T14 的**渲染级**判据（源码级棘轮见 `loadingRatchet.test.ts`）。
 *
 * Why 需要渲染级：棘轮只证明「文件里不再有手写加载文案」，证明不了**用户看到的是原语**。本文件对
 * 三处已迁的形态各钉一条判据（每处各带自己的变异体，见报告）：
 *   ① `RefineStrategyPicker` 的 label 与默认值**不同**（「策略声明加载中…」）⇒ 必须显式传，删掉就红；
 *   ② `WebArticleView` 是「骨架 + 可读文案」成对的样板（骨架整组 `aria-hidden`，别只留骨架）；
 *   ③ `WindowSelectCard` 的按钮内忙碌态走 `busy`（不是原生 `disabled`，也不是 `Loading`）。
 * 另外每条都断言**根节点没有行内 style** —— ADR-033 §4 禁止用行内 style 覆盖类语义，而这三处的
 * 旧写法正是「手写灰字 + fontSize/color 内联」。
 *
 * 副作用：`invoke` 与 dialog 插件全 mock（AAA；不触真实后端、不写磁盘）。
 * 边界：jsdom **不排版、不加载样式表**（`vitest.config.ts` 的 `css` 默认 false）⇒ 判据只读 DOM
 *   事实（类名 / 文案 / role / aria / 行内 style 的有无），不断言像素与计算样式。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RefineStrategyPicker from "../../components/RefineStrategyPicker";
import WebArticleView from "../../components/WebArticleView";
import { WindowSelectCard } from "../../components/WindowSelectCard";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (p: string) => p,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: () => Promise.resolve(null) }));

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
});

/** 永不 resolve ⇒ 组件停在加载态（这就是要断言的相位） */
const pending = (): Promise<never> => new Promise<never>(() => undefined);

describe("① RefineStrategyPicker：文案与默认值不同 ⇒ 必须显式传 label（删了就红）", () => {
  it("meta=null 时渲染原语 `Loading`：role=status + 探针 + 文案逐字 + 根节点无行内 style", () => {
    const { container } = render(
      <RefineStrategyPicker meta={null} value={{ presetId: "", dims: {} }} onChange={vi.fn()} />,
    );
    const root = container.querySelector(".ed-loading");
    expect(root, "加载态不是 `Loading` 原语渲染的（缺 .ed-loading）").toBeTruthy();
    expect(root?.querySelector(".ed-probe"), "原语的探针没渲染出来").toBeTruthy();
    expect(root?.getAttribute("role"), "加载态应让辅助技术读到").toBe("status");
    // 文案逐字：删掉 `label` 会退回原语默认「加载中…」⇒ 这条立刻红
    expect(root?.textContent, "加载文案被改动或被默认值吃掉").toBe("策略声明加载中…");
    // ADR-033 §4：不许用行内 style 覆盖类语义（旧写法是 fontSize:11 + color:#9ca3af）
    expect(root?.getAttribute("style"), "加载态上出现了行内 style").toBeNull();
    expect(screen.queryByText("加载中…"), "加载文案退化成了默认值").toBeNull();
  });
});

describe("② WebArticleView：骨架与可读文案成对（骨架 aria-hidden，别只留骨架）", () => {
  it("文章未到时渲染 `Loading`（逐字）+ `Skeleton`（4 条 · aria-hidden）", () => {
    invokeMock.mockImplementation(() => pending());
    const { container } = render(<WebArticleView sessionId={7} onToNote={vi.fn()} onRemove={vi.fn()} />);
    const status = container.querySelector(".ed-loading");
    expect(status?.textContent, "加载文案被改动").toBe("文章加载中…");
    const skel = container.querySelector(".ed-skeleton");
    expect(skel, "结构已知（来源行 + 段落块）却没渲染骨架").toBeTruthy();
    // 骨架是纯视觉信息：整组 aria-hidden，可读语义由上面的 role=status 承载
    expect(skel?.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("③ WindowSelectCard：按钮内忙碌态走 `busy`（不是原生 disabled，也不是 `Loading`）", () => {
  it("loading=true 时刷新控件是 `.ed-btn` + aria-busy，文案仍是「加载中…」", () => {
    const { container } = render(
      <WindowSelectCard windows={[]} selected={null} onSelect={vi.fn()} onRefresh={vi.fn()} loading />,
    );
    // 打开浮层（第一颗按钮是「已选窗口」卡片）
    const toggle = container.querySelector("button");
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle as HTMLButtonElement);
    return waitFor(() => {
      const label = screen.getByText("加载中…");
      const btn = label.closest("button");
      expect(btn?.className, "按钮内忙碌态没走 `Button`（缺 .ed-btn）").toContain("ed-btn");
      expect(btn?.getAttribute("aria-busy"), "`busy` 应声明 aria-busy").toBe("true");
      expect(btn?.hasAttribute("disabled"), "原生 disabled 会把焦点丢掉 —— 忙碌态应用 `busy`").toBe(false);
    });
  });
});
