/**
 * @ai-context: useSessionExpiry 回归测试——并发 401 与 SIGNED_OUT 会在短时间
 * 内派发多个 kb:session-expired 事件，冷却窗口内必须只弹一次 Toast。
 * @ai-context: Regression test — bursts of kb:session-expired events must be
 * deduplicated within the cooldown window (single toast, single redirect).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useSessionExpiry } from './useSessionExpiry';

const toastSpy = vi.fn();

vi.mock('@/components/ui', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

describe('useSessionExpiry - 事件风暴去重', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('冷却窗口内的多个 session-expired 事件只弹一次 Toast', () => {
    renderHook(() => useSessionExpiry(), { wrapper });

    act(() => {
      // 模拟多个并发 401 请求 + SIGNED_OUT 各自派发事件
      window.dispatchEvent(new CustomEvent('kb:session-expired'));
      window.dispatchEvent(new CustomEvent('kb:session-expired'));
      window.dispatchEvent(new CustomEvent('kb:session-expired'));
    });

    expect(toastSpy).toHaveBeenCalledTimes(1);
  });

  it('冷却窗口过后允许再次提示', () => {
    renderHook(() => useSessionExpiry(), { wrapper });

    act(() => {
      window.dispatchEvent(new CustomEvent('kb:session-expired'));
    });
    act(() => {
      vi.advanceTimersByTime(10000); // 越过冷却窗口
      window.dispatchEvent(new CustomEvent('kb:session-expired'));
    });

    expect(toastSpy).toHaveBeenCalledTimes(2);
  });
});
