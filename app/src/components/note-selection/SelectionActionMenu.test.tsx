// @vitest-environment jsdom
/**
 * SelectionActionMenu.test.tsx — 共享选区菜单（批 8 REQ-317）补测。
 *
 * @ai-context: 覆盖审查 P3-4——坐标钳制一次性：位置在打开瞬间按「含状态行区」
 *              的最终高度计算（复制成功状态行出现不再重钳上跳）；贴底场景下
 *              style.top 从打开到状态行出现全程不变。invoke 无依赖（复制走
 *              navigator.clipboard mock；菜单组件自身零后端调用）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SelectionActionMenu from "./SelectionActionMenu";

const { writeText } = vi.hoisted(() => ({ writeText: vi.fn() }));

const originalInner = { w: window.innerWidth, h: window.innerHeight };
const originalClipboard = navigator.clipboard;

const baseProps = {
  x: 500,
  y: 500,
  mode: "editing" as const,
  text: "选中文字快照",
  onClose: vi.fn(),
  onAction: vi.fn(),
};

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  // jsdom 无 navigator.clipboard——按可用注入（configurable 属性，afterEach 还原）
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  // 小视口：底部钳制必命中（贴底 y=500 > vh-h-4）
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 480 });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInner.w });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInner.h });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
});

describe("SelectionActionMenu 坐标钳制一次性（审查 P3-4）", () => {
  it("贴底场景：打开位置即终位——复制状态行出现后 top 不变（预留状态行区钳制）", async () => {
    // 编辑态 5 项：HEAD(34) + 5×ROW(30) + 状态行预留(26) + padding(8) = 218
    // 视口 480 → clamp 上限 = 480 - 218 - 4 = 258；y=500 贴底 → top=258
    const { baseElement } = render(<SelectionActionMenu {...baseProps} />);
    const menu = screen.getByTestId("note-sel-menu");
    expect(menu.style.top).toBe("258px");
    // 点击复制 → 状态行出现（菜单保持打开）——位置不得因高度重算而位移
    fireEvent.click(screen.getByTestId("note-sel-copy"));
    expect(await screen.findByTestId("note-sel-copy-status")).toBeTruthy();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("选中文字快照"));
    expect(menu.style.top).toBe("258px");
    expect(baseElement.querySelector('[data-testid="note-sel-copy-status"]')?.textContent).toContain("已复制");
  });

  it("常规位置不受预留影响（上方不越界时按请求坐标定位）", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    render(<SelectionActionMenu {...baseProps} x={120} y={200} />);
    const menu = screen.getByTestId("note-sel-menu");
    expect(menu.style.top).toBe("200px");
    expect(menu.style.left).toBe("120px");
  });
});
