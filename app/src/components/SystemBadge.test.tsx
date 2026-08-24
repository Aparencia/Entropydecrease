// @vitest-environment jsdom
/**
 * SystemBadge.test.tsx — 体系徽标（v0.13.7 触点①）。
 *
 * @ai-context: 纯展示组件——组行小字区显示关联体系名；无引用计数时
 *              只显示名字，有计数时显示"名 · N 引用"。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SystemBadge from "./SystemBadge";

describe("SystemBadge", () => {
  it("显示体系名与引用计数（有计数）", () => {
    render(<SystemBadge name="摄影" linkCount={3} onClick={vi.fn()} />);
    expect(screen.getByTestId("system-badge").textContent).toContain("摄影");
    expect(screen.getByTestId("system-badge").textContent).toContain("3");
  });

  it("无引用计数时不显示计数", () => {
    render(<SystemBadge name="摄影" linkCount={0} onClick={vi.fn()} />);
    expect(screen.getByTestId("system-badge").textContent).not.toContain("0");
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(<SystemBadge name="摄影" linkCount={0} onClick={onClick} />);
    screen.getByTestId("system-badge").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => cleanup());
