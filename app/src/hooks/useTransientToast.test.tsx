// @vitest-environment jsdom
/**
 * useTransientToast.test.tsx — 自绘 toast hook 计时器生命周期契约（批 7 审查 P2-8）。
 *
 * @ai-context: 覆盖卸载清理语义——原实现把 timerRef.current 快照在 effect
 *              建立时（恒 null——toast 尚未显示），卸载清的是空快照=死守卫，
 *              挂起的自动消失计时器在卸载后仍会触发 setState；修复后 cleanup
 *              直接读 ref，卸载即清。契约以「卸载后无残留计时器」为判定
 *              （vi.getTimerCount 可观测泄漏；React 卸载后 setState 静默无感）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useTransientToast } from "./useTransientToast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useTransientToast 计时器生命周期", () => {
  it("卸载清理挂起的自动消失计时器（P2-8 死守卫回归）", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTransientToast(3000));
    // Arrange/Act：显示一条 toast → 挂起一个自动消失计时器
    act(() => result.current.showToast("临时提示", "ok"));
    expect(result.current.toast).toBeTruthy();
    expect(vi.getTimerCount()).toBe(1);
    // Act：卸载（cleanup 须清掉挂起计时器——旧实现清的是 effect 建立时的
    // 空快照，挂起计时器泄漏=卸载后仍会触发 setState）
    act(() => unmount());
    // Assert：零残留（推进时间也不再有回调触发卸载后 setState）
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(4000));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("正常到时自动消失后卸载无残留", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTransientToast(1000));
    act(() => result.current.showToast("到时消失", "ok"));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toast).toBeNull();
    act(() => unmount());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("连续 toast 重置计时（单计时器语义——新消息覆盖旧消息）", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTransientToast(3000));
    act(() => result.current.showToast("第一条", "ok"));
    act(() => vi.advanceTimersByTime(1000));
    // Act：第二条重置计时（旧计时器清掉、只挂一个）
    act(() => result.current.showToast("第二条覆盖", "err"));
    expect(vi.getTimerCount()).toBe(1);
    // 注：fake timers 下断言 state（toast 内容在**原语节点的 `message` prop** 上）。
    // 批 4 T10（控制方 2026-09-12 授权，按 B13/B15 先例的机械改写）：迁移前 hook 返回的是自绘
    // `<div>{msg}</div>`，文案在 `props.children`；迁移后渲染交给 `ui/primitives/Toast`（文案走
    // `message` prop）⇒ 读取口径随之搬家。语义（「第二条覆盖旧消息」）与强度不变，用例数不变。
    const props = result.current.toast?.props as { message?: string } | undefined;
    expect(props?.message).toBe("第二条覆盖");
    // Assert：重置后的 3s 内仍在展示，越过则消失
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.toast).not.toBeNull();
    act(() => vi.advanceTimersByTime(501));
    expect(result.current.toast).toBeNull();
    act(() => unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
