/**
 * useChatStream.test — 帧级批量渲染契约（REQ-275）。
 * AAA：高频 chunk 同帧合并为单次 setView；终态/切会话立即 flush 不残留；
 *      单会话单流与终态清理回归。
 * @vitest-environment jsdom（renderHook 需 document）
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ChatStreamEvent } from "../types";
import useChatStream from "./useChatStream";

/** 受控 rAF 桩（jsdom 无 rAF——手动推进帧） */
let rafQueue: { id: number; cb: FrameRequestCallback }[] = [];
let rafSeq = 1;
function advanceOneFrame() {
  const item = rafQueue.shift();
  if (item) item.cb(0);
}
function pendingFrames(): number {
  return rafQueue.length;
}

/** Channel mock：捕获实例以便手动触发 onmessage */
let lastChannel: { onmessage: ((ev: ChatStreamEvent) => void) | null } | null = null;
const invokeMock = vi.fn(async () => undefined);
vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((ev: ChatStreamEvent) => void) | null = null;
    constructor() {
      lastChannel = this;
    }
  },
  invoke: () => invokeMock(),
}));

beforeEach(() => {
  rafQueue = [];
  rafSeq = 1;
  lastChannel = null;
  invokeMock.mockClear();
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafQueue.push({ id: rafSeq, cb });
    return rafSeq++;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    rafQueue = rafQueue.filter((i) => i.id !== id);
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function startStream(hook: ReturnType<typeof renderHook<ReturnType<typeof useChatStream>, unknown>>["result"]) {
  await act(async () => {
    expect(await hook.current.launch(1, "chat_send", {})).toBe(true);
  });
  expect(lastChannel).not.toBeNull();
}

const chunk = (delta: string): ChatStreamEvent => ({ kind: "chunk", delta });
const doneEv: ChatStreamEvent = { kind: "done", content: "", usageJson: null };

describe("useChatStream 帧级批量渲染（REQ-275）", () => {
  it("高频 chunk 同帧合并为一次 setView（先排帧后落视图）", async () => {
    const settled = vi.fn();
    const { result } = renderHook(() => useChatStream(settled));
    await startStream(result);
    act(() => { result.current.setActive(1); });
    act(() => {
      lastChannel!.onmessage!(chunk("你"));
      lastChannel!.onmessage!(chunk("好"));
    });
    // 帧未推进：文本仍为空（chunk 已累积在 accs，等待合帧）
    expect(result.current.view?.text).toBeUndefined();
    expect(pendingFrames()).toBe(1); // 多 chunk 只挂一帧
    act(() => advanceOneFrame());
    expect(result.current.view?.text).toBe("你好");
  });

  it("帧挂起期间的后续 chunk 合并进同一帧", async () => {
    const { result } = renderHook(() => useChatStream(vi.fn()));
    await startStream(result);
    act(() => result.current.setActive(1));
    act(() => lastChannel!.onmessage!(chunk("A")));
    expect(pendingFrames()).toBe(1);
    act(() => lastChannel!.onmessage!(chunk("B")));
    expect(pendingFrames()).toBe(1); // 未新增帧
    act(() => advanceOneFrame());
    expect(result.current.view?.text).toBe("AB");
    // 下一帧可再次调度
    act(() => lastChannel!.onmessage!(chunk("C")));
    expect(pendingFrames()).toBe(1);
    act(() => advanceOneFrame());
    expect(result.current.view?.text).toBe("ABC");
  });

  it("终态立即 flush 残留帧并清流（不丢最后一段）", async () => {
    const settled = vi.fn();
    const { result } = renderHook(() => useChatStream(settled));
    await startStream(result);
    act(() => result.current.setActive(1));
    act(() => lastChannel!.onmessage!(chunk("尾")));
    expect(pendingFrames()).toBe(1);
    act(() => lastChannel!.onmessage!(doneEv));
    expect(pendingFrames()).toBe(0); // 残留帧已取消
    expect(result.current.view).toBeNull();
    expect(settled).toHaveBeenCalledWith(1, doneEv);
    expect(result.current.isStreaming(1)).toBe(false);
  });

  it("切会话前立即 flush 当前会话残留（视图不串台）", async () => {
    const { result } = renderHook(() => useChatStream(vi.fn()));
    await startStream(result);
    act(() => result.current.setActive(1));
    act(() => lastChannel!.onmessage!(chunk("旧会话末字")));
    expect(pendingFrames()).toBe(1);
    act(() => result.current.setActive(2));
    expect(pendingFrames()).toBe(0); // flush 取消残留帧
    expect(result.current.view?.text ?? "").not.toContain("旧会话末字");
  });

  it("invoke 前置失败清理流槽且无残留帧", async () => {
    invokeMock.mockRejectedValueOnce(new Error("gate"));
    const { result } = renderHook(() => useChatStream(vi.fn()));
    let err: unknown = null;
    await act(async () => {
      try {
        await result.current.launch(1, "chat_send", {});
      } catch (e) { err = e; }
    });
    expect(err).not.toBeNull();
    expect(result.current.isStreaming(1)).toBe(false);
    expect(pendingFrames()).toBe(0);
  });
});
