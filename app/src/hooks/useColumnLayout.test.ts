// @vitest-environment jsdom
/**
 * useColumnLayout.test.ts — 列布局 hook 契约（v0.15）。
 *
 * @ai-context: 宽度记忆与夹取（min..max）/ 手动折叠优先于自动折叠（窗口回宽恢复
 *              用户选择）/ expand 立即展开并清双折叠态 / localStorage 持久化键。
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useColumnLayout } from "./useColumnLayout";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.innerWidth = 1024;
});

describe("useColumnLayout", () => {
  it("默认宽度与夹取：resizeBy 越界收口 min/max", () => {
    const { result } = renderHook(() => useColumnLayout("t1", { default: 320, min: 240, max: 420 }));
    expect(result.current.width).toBe(320);
    act(() => result.current.resizeBy(-999));
    expect(result.current.width).toBe(240);
    act(() => result.current.resizeBy(999));
    expect(result.current.width).toBe(420);
  });

  it("宽度记忆持久化：卸载重挂恢复（localStorage）", () => {
    const { result, unmount } = renderHook(() => useColumnLayout("t2", { default: 320, min: 240, max: 420 }));
    act(() => result.current.resizeBy(60));
    expect(result.current.width).toBe(380);
    unmount();
    const { result: r2 } = renderHook(() => useColumnLayout("t2", { default: 320, min: 240, max: 420 }));
    expect(r2.current.width).toBe(380);
  });

  it("手动折叠 + expand 立即展开", () => {
    const { result } = renderHook(() => useColumnLayout("t3", { default: 320, min: 240, max: 420 }));
    expect(result.current.folded).toBe(false);
    act(() => result.current.setManualFolded(true));
    expect(result.current.folded).toBe(true);
    act(() => result.current.expand());
    expect(result.current.folded).toBe(false);
  });

  it("窄窗自动折叠：窗口变窄折叠、回宽恢复（手动态保留）", () => {
    const { result } = renderHook(() =>
      useColumnLayout("t4", { default: 320, min: 240, max: 420, autoFoldBelow: 900 }),
    );
    expect(result.current.folded).toBe(false);
    window.innerWidth = 800;
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(result.current.folded).toBe(true);
    // 回宽 → 自动折叠解除
    window.innerWidth = 1024;
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(result.current.folded).toBe(false);
  });

  it("手动折叠后回宽仍保持折叠（用户手动态优先）", () => {
    const { result } = renderHook(() =>
      useColumnLayout("t5", { default: 320, min: 240, max: 420, autoFoldBelow: 900 }),
    );
    act(() => result.current.setManualFolded(true));
    window.innerWidth = 1024;
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(result.current.folded).toBe(true);
    act(() => result.current.expand());
    expect(result.current.folded).toBe(false);
  });

  it("折叠态持久化（resize 后重挂保持手动折叠）", () => {
    const { result, unmount } = renderHook(() => useColumnLayout("t6", { default: 320, min: 240, max: 420 }));
    act(() => result.current.setManualFolded(true));
    unmount();
    expect(window.localStorage.getItem("layout:col-fold:t6")).toBe("1");
    const { result: r2 } = renderHook(() => useColumnLayout("t6", { default: 320, min: 240, max: 420 }));
    expect(r2.current.folded).toBe(true);
  });
});
