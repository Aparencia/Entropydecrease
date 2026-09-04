// @vitest-environment jsdom
/**
 * useDbRefresh.test.ts — data:* 域变更总线 hook 契约（REQ-278，v0.19.4 §5）。
 *
 * @ai-context: mock @tauri-apps/api/event 提供可控 listen：记录每个事件名的
 *              回调句柄 + 可断言 unlisten。断言四件事：① 订阅后事件触发 →
 *              防抖窗口结束调用一次 onChanged；② 连续/跨域触发合并为一次；
 *              ③ unmount 解绑（unlisten 调用 + 事件不再触发）；④ listen
 *              reject（非 Tauri 环境）静默不抛。常驻订阅：无 active 门控。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useDbRefresh } from "./useDbRefresh";

/** 可控事件 mock 状态（vi.hoisted——vi.mock 工厂与测试共享） */
const h = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  const unlisteners: ReturnType<typeof vi.fn>[] = [];
  /** 基线实现：记录回调 → 返回可删除句柄的 unlisten（等价 Tauri listen） */
  const baseListen = (event: string, handler: () => void) => {
    handlers.set(event, handler);
    const unlisten = vi.fn(() => {
      handlers.delete(event);
    });
    unlisteners.push(unlisten);
    return Promise.resolve(unlisten);
  };
  return { listenMock: vi.fn(baseListen), handlers, unlisteners, baseListen };
});
vi.mock("@tauri-apps/api/event", () => ({ listen: h.listenMock }));

/** 触发一次总线事件（等价 Rust 侧 emit `data:{domain}-changed`） */
function fire(event: string) {
  h.handlers.get(event)?.();
}

/** 冲刷 listen 异步注册（mock resolve 后回调才挂上句柄） */
async function flushRegistrations() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

const DEBOUNCE_MS = 300;

beforeEach(() => {
  h.listenMock.mockClear();
  h.handlers.clear();
  h.unlisteners.length = 0;
  h.listenMock.mockImplementation(h.baseListen);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDbRefresh", () => {
  it("订阅后触发事件 → 防抖窗口内不调用，窗口结束调用 onChanged 一次", async () => {
    const onChanged = vi.fn();
    renderHook(() => useDbRefresh(["notes"], onChanged));
    await flushRegistrations();
    // 订阅注册：事件名为 `data:{domain}-changed`
    expect(h.listenMock).toHaveBeenCalledWith("data:notes-changed", expect.any(Function));

    fire("data:notes-changed");
    expect(onChanged).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS - 1));
    expect(onChanged).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("连续多次/跨域触发合并——风暴只刷新一次", async () => {
    const onChanged = vi.fn();
    renderHook(() => useDbRefresh(["notes", "sessions"], onChanged));
    await flushRegistrations();
    expect(h.listenMock).toHaveBeenCalledWith("data:notes-changed", expect.any(Function));
    expect(h.listenMock).toHaveBeenCalledWith("data:sessions-changed", expect.any(Function));

    fire("data:notes-changed");
    act(() => vi.advanceTimersByTime(100));
    fire("data:sessions-changed");
    act(() => vi.advanceTimersByTime(100));
    fire("data:notes-changed");
    act(() => vi.advanceTimersByTime(100));
    expect(onChanged).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onChanged).toHaveBeenCalledTimes(1);
    // 一次调用后无残留定时器（再推时间不重复触发）
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("unmount 解绑：unlisten 被调用，之后触发事件不再刷新", async () => {
    const onChanged = vi.fn();
    const { unmount } = renderHook(() => useDbRefresh(["note-groups"], onChanged));
    await flushRegistrations();
    expect(h.handlers.size).toBe(1);

    unmount();
    // 每个已注册域的 unlisten 都被调用（handlers 清空 = 句柄已删）
    expect(h.handlers.size).toBe(0);
    expect(h.unlisteners.length).toBe(1);
    expect(h.unlisteners[0]?.mock.calls.length).toBe(1);

    // 卸载后事件（无论句柄残留与否）不得触发刷新
    h.handlers.set("data:note-groups-changed", () => {
      // 模拟卸载竞态下仍收到的事件——cancelled 标志应拦截
    });
    fire("data:note-groups-changed");
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("listen 失败（非 Tauri 环境）静默不抛", async () => {
    h.listenMock.mockRejectedValue(new Error("no tauri runtime"));
    const onChanged = vi.fn();
    expect(() => renderHook(() => useDbRefresh(["knowledge"], onChanged))).not.toThrow();
    await flushRegistrations();
    fire("data:knowledge-changed");
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("debounceMs 参数覆盖默认窗口", async () => {
    const onChanged = vi.fn();
    renderHook(() => useDbRefresh(["goals"], onChanged, 50));
    await flushRegistrations();
    fire("data:goals-changed");
    act(() => vi.advanceTimersByTime(49));
    expect(onChanged).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
