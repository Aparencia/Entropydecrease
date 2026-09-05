// @vitest-environment jsdom
/**
 * ColumnResizer.test.tsx — 拖拽增量语义回归测试（REQ-285，v0.19.6）。
 *
 * @ai-context: 覆盖根因「加速」：旧实现每次 move 传距起点累计位移，而调用方
 *              resizeBy 为增量语义（cur + delta）→ 重复累加。断言 move 回调
 *              收到**相邻增量**（50→70→80 = [20, 10]），up 后不再发；side="left"
 *              符号反向；键盘 ←/→ 步进（Shift=8px）与双击复位（§2.9 矩阵）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ColumnResizer from "./ColumnResizer";

afterEach(cleanup);

describe("ColumnResizer 增量拖拽（REQ-285）", () => {
  it("move 序列发出相邻增量而非累计位移（右拖宽）", () => {
    const onResize = vi.fn();
    render(<ColumnResizer onResize={onResize} />);
    const handle = screen.getByTestId("column-resizer");
    fireEvent.pointerDown(handle, { clientX: 50 });
    fireEvent.pointerMove(handle, { clientX: 70 });
    fireEvent.pointerMove(handle, { clientX: 80 });
    fireEvent.pointerUp(handle);
    // 旧实现（累计）：[20, 30] → 加速；修复后相邻增量：[20, 10]
    expect(onResize.mock.calls.map((c) => c[0])).toEqual([20, 10]);
  });

  it("pointerUp 后不再响应 move（拖拽结束）", () => {
    const onResize = vi.fn();
    render(<ColumnResizer onResize={onResize} />);
    const handle = screen.getByTestId("column-resizer");
    fireEvent.pointerDown(handle, { clientX: 50 });
    fireEvent.pointerUp(handle);
    fireEvent.pointerMove(handle, { clientX: 90 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("side=left 方向反向（拖左手柄收窄自身列）", () => {
    const onResize = vi.fn();
    render(<ColumnResizer side="left" onResize={onResize} />);
    const handle = screen.getByTestId("column-resizer");
    fireEvent.pointerDown(handle, { clientX: 50 });
    fireEvent.pointerMove(handle, { clientX: 70 });
    fireEvent.pointerUp(handle);
    expect(onResize.mock.calls.map((c) => c[0])).toEqual([-20]);
  });

  it("键盘 ←/→ 步进 ±16px（Shift=±8px）——键盘可达性（§2.9）", () => {
    const onResize = vi.fn();
    render(<ColumnResizer onResize={onResize} />);
    const handle = screen.getByTestId("column-resizer");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(onResize.mock.calls.map((c) => c[0])).toEqual([16, -16, 8]);
  });

  it("双击触发复位（onReset）", () => {
    const onReset = vi.fn();
    render(<ColumnResizer onResize={vi.fn()} onReset={onReset} />);
    fireEvent.doubleClick(screen.getByTestId("column-resizer"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
