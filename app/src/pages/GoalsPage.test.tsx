// @vitest-environment jsdom
/**
 * @ai-context 目标左列接线守卫（批 3 T9 / 规格 §6.2「🎯 目标 左列：接入列基础设施；
 *   默认 380 → **320**」+ M4）。
 *
 * Why 用**真执行器 + 真注册表规格**（不是复刻一个假列）：本文件要证的正是
 *   「`useColumnLayout("goals-left", columnSpec("goals-left"))` 的结果真的走到了 DOM」，
 *   且默认值确实从 380 变成规格的 320（`NotesReadingColumn.outline.test.tsx` 同款口径）。
 *
 * 判据（每条都配了能红的变异体，见 task-9-report §变异体实测）：
 *   ① 未记忆时左列宽 = 注册表默认 320（接线前写死 380 ⇒ 红）；
 *   ② 窄窗（< `BREAKPOINTS.twoCol`）自动折叠 → 26px 窄条；点窄条走 expand() 能展开；
 *   ③ 拖拽手柄（`column-resizer`）在列上 —— §6.2 要求本列「接入列基础设施」而不是只换个数。
 *
 * ⚠️ 仪器边界：jsdom 不排版 ⇒ 只判 `style.width` 与元素有无，**不判像素**（归 T14 探针）；
 *   全部 IPC 走 mock（不连真实数据 —— 测试隔离纪律）；视口在 afterEach 复原。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { columnSpec } from "../shell/columnRegistry";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import GoalsPage from "./GoalsPage";

/** 页面根 → 行容器（`flex:1` 那一层）→ 左列（折叠态是 column-bar 窄条） */
const leftColumn = (root: Element | null) =>
  (root?.children[1]?.firstElementChild ?? null) as HTMLElement | null;

beforeEach(() => {
  // jsdom 默认视口恰为 1024 < twoCol(1100) ⇒ 不显式声明会让左列静默变折叠态
  // （批 3 T5 实测；1280 = 规格 §1 决策 17 的默认窗宽）。断言不改，改的只是测试环境。
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  window.localStorage.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]); // list_goals / list_note_groups / list_goal_graduations 全空
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
});

describe("GoalsPage 左列接线（规格 §6.2）", () => {
  it("① 未记忆时 = 注册表默认（320，接线前写死 380）+ 拖拽手柄在列上", () => {
    expect(columnSpec("goals-left").default).toBe(320); // 规格锚点：注册表被改错先在这里红
    const { container } = render(<GoalsPage />);
    expect(leftColumn(container.firstElementChild)?.style.width).toBe("320px");
    expect(screen.getByTestId("column-resizer")).toBeTruthy();
  });

  it("② localStorage 记忆的列宽走到 DOM", () => {
    window.localStorage.setItem("layout:col-width:goals-left", "400");
    const { container } = render(<GoalsPage />);
    expect(leftColumn(container.firstElementChild)?.style.width).toBe("400px");
  });

  it("③ 窄窗自动折叠渲染窄条；点窄条走 expand() 能展开（J1-3 死局形态）", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
    const { container } = render(<GoalsPage />);
    expect(leftColumn(container.firstElementChild)?.getAttribute("data-testid")).toBe("column-bar");
    fireEvent.click(screen.getByTestId("column-bar"));
    expect(leftColumn(container.firstElementChild)?.style.width).toBe("320px");
  });
});
