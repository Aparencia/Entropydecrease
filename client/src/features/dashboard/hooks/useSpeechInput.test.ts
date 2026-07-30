/**
 * useSpeechInput 单元测试 / Unit tests for the speech input hook
 *
 * @ai-context: 覆盖 B1.5——特性探测（jsdom 无 SpeechRecognition → supported
 * =false）、mock 构造器时 start 触发识别并回传结果、错误静默停止。
 * @ai-context: Covers feature detection and mocked recognition flow.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechInput } from './useSpeechInput';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSpeechInput', () => {
  it('should report unsupported when SpeechRecognition is absent', () => {
    // jsdom 默认无 SpeechRecognition
    const { result } = renderHook(() => useSpeechInput({ onResult: vi.fn() }));
    expect(result.current.supported).toBe(false);
    expect(result.current.listening).toBe(false);
  });

  it('should not throw when start is called while unsupported', () => {
    const { result } = renderHook(() => useSpeechInput({ onResult: vi.fn() }));
    expect(() => act(() => result.current.start())).not.toThrow();
    expect(result.current.listening).toBe(false);
  });

  it('should recognize and emit result with a mocked recognizer', () => {
    // Arrange — mock 一个最小 SpeechRecognition
    const onResult = vi.fn();
    let instance: Record<string, unknown> = {};
    class MockRec {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() { instance = this as unknown as Record<string, unknown>; }
      stop() {}
    }
    vi.stubGlobal('SpeechRecognition', MockRec);

    const { result } = renderHook(() => useSpeechInput({ onResult }));
    expect(result.current.supported).toBe(true);

    // Act — 启动后模拟识别结果回调
    act(() => result.current.start());
    act(() => {
      (instance.onresult as (e: unknown) => void)?.({
        results: [[{ transcript: '  搞懂傅里叶  ' }]],
      });
    });

    // Assert — trim 后回传
    expect(onResult).toHaveBeenCalledWith('搞懂傅里叶');
  });

  it('should stop listening on error', () => {
    class MockRec {
      lang = ''; interimResults = false; continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      start() { current = this; }
      stop() {}
    }
    let current: MockRec | null = null;
    vi.stubGlobal('SpeechRecognition', MockRec);

    const { result } = renderHook(() => useSpeechInput({ onResult: vi.fn() }));
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    act(() => { current?.onerror?.(); });
    expect(result.current.listening).toBe(false);
  });
});
