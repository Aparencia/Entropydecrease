// @vitest-environment jsdom
/**
 * NoteColorPicker 组件测试（v0.14 B 视觉系统）。
 *
 * @ai-context: spec §6 组件层——选中态/回调/清除；点击不冒泡（组行内嵌时防
 *              误触行选中）。jsdom 无 matchMedia——组件回退 light 主题。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RTL 无 globals 配置时 auto-cleanup 不生效——显式清理防跨用例 DOM 残留
// （多元素匹配错误；与 GroupSidebar.test.tsx 同模式）
afterEach(cleanup);
import { COLOR_IDS } from "../utils/colorPalette";
import NoteColorPicker from "./NoteColorPicker";

describe("NoteColorPicker", () => {
  it("渲染 12 色 + 清除按钮", () => {
    render(<NoteColorPicker value={null} onChange={() => {}} />);
    for (const id of COLOR_IDS) {
      expect(screen.getByTestId(`color-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("color-clear")).toBeTruthy();
  });

  it("选中态：value 对应的色点标记 active 且显示对勾", () => {
    render(<NoteColorPicker value="blue" onChange={() => {}} />);
    const blue = screen.getByTestId("color-blue");
    expect(blue.dataset.active).toBeDefined();
    expect(blue.textContent).toBe("✓");
    expect(screen.getByTestId("color-red").dataset.active).toBeUndefined();
  });

  it("点击色点 → onChange(色板 id)", () => {
    const onChange = vi.fn();
    render(<NoteColorPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("color-purple"));
    expect(onChange).toHaveBeenCalledWith("purple");
  });

  it("点击已选色点 → 清除（toggle 回 null）", () => {
    const onChange = vi.fn();
    render(<NoteColorPicker value="purple" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("color-purple"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("点击清除 → onChange(null)", () => {
    const onChange = vi.fn();
    render(<NoteColorPicker value="red" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("color-clear"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("点击不冒泡（内嵌组行时防误触行选中）", () => {
    const onChange = vi.fn();
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <NoteColorPicker value={null} onChange={onChange} />
      </div>,
    );
    fireEvent.click(screen.getByTestId("color-green"));
    expect(outer).not.toHaveBeenCalled();
  });
});
