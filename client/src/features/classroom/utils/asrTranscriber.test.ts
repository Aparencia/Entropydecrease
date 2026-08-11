/**
 * ASR 信号量队列丢弃可观测性单测
 *
 * @ai-context: 覆盖 P0-6 验收点——队列满时丢弃最旧等待者并累计计数、
 * 触发 onDrop 回调；正常路径不触发回调；连续丢弃计数在恢复后重置。
 * @ai-context: Covers queue-drop observability of useAsrSemaphore:
 * counting, callback firing, and no-callback happy path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsrSemaphore } from './asrTranscriber';

/** 并发槽位 5 + 队列上限 20 = 25 次 acquire 不会触发丢弃 */
const NO_DROP_ACQUIRES = 25;

describe('useAsrSemaphore 队列丢弃可观测', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // 丢弃分支会 console.warn，静默以保持测试输出干净
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('正常路径不触发 onDrop', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useAsrSemaphore({ onDrop }));
    act(() => {
      for (let i = 0; i < NO_DROP_ACQUIRES; i++) result.current.acquire();
      for (let i = 0; i < NO_DROP_ACQUIRES; i++) result.current.release();
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('队列满时丢弃最旧等待者：累计计数并触发 onDrop', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useAsrSemaphore({ onDrop }));
    act(() => {
      for (let i = 0; i < NO_DROP_ACQUIRES; i++) result.current.acquire();
    });
    expect(onDrop).not.toHaveBeenCalled();

    // 第 26 次 acquire：队列已满 → 丢弃最旧等待者，本次请求入队
    act(() => { result.current.acquire(); });
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenLastCalledWith(1, 1);

    // 第 27 次：累计与连续计数均递增
    act(() => { result.current.acquire(); });
    expect(onDrop).toHaveBeenCalledTimes(2);
    expect(onDrop).toHaveBeenLastCalledWith(2, 2);
  });

  it('连续丢弃计数在有段顺利入队后重置', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useAsrSemaphore({ onDrop }));
    act(() => {
      for (let i = 0; i < NO_DROP_ACQUIRES + 1; i++) result.current.acquire();
    });
    expect(onDrop).toHaveBeenLastCalledWith(1, 1);

    // 释放一个槽位让排队者前进，随后新请求顺利入队 → 连续计数重置
    act(() => { result.current.release(); });
    act(() => { result.current.acquire(); }); // 未满，不丢弃
    expect(onDrop).toHaveBeenCalledTimes(1);

    // 再次填满后丢弃：累计 2，但连续计数从 1 重新开始
    act(() => { result.current.acquire(); });
    expect(onDrop).toHaveBeenCalledTimes(2);
    expect(onDrop).toHaveBeenLastCalledWith(2, 1);
  });

  it('不传 options 时保持既有行为（无回调也不报错）', () => {
    const { result } = renderHook(() => useAsrSemaphore());
    expect(() => {
      act(() => {
        for (let i = 0; i < NO_DROP_ACQUIRES + 3; i++) result.current.acquire();
      });
    }).not.toThrow();
  });
});
