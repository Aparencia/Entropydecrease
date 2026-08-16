/**
 * AI 请求超时包装器单元测试
 * Unit tests for the AI request timeout wrapper
 *
 * @ai-context: 用 fake timers 驱动 setTimeout，覆盖成功路径（清除定时器）、
 * 失败透传、超时 reject（AIError code='timeout'、retryable=true）与默认
 * 75 秒超时值。不发起任何真实请求。
 * @ai-context: Uses fake timers to drive setTimeout, covering the success
 * path (timer cleared), error passthrough, timeout rejection with
 * AIError('timeout', retryable) and the 75s default. No real requests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout, AI_REQUEST_TIMEOUT_MS } from './withTimeout';
import { AIError } from '../ai-errors';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve with the underlying value and clear the timer', async () => {
    // Arrange
    const promise = Promise.resolve('ok');
    // Act
    const result = withTimeout(promise, 1000);
    await vi.runAllTimersAsync();
    // Assert
    await expect(result).resolves.toBe('ok');
  });

  it('should forward downstream rejections', async () => {
    // Arrange
    const promise = Promise.reject(new Error('boom'));
    // Act
    const result = withTimeout(promise, 1000);
    // Assert
    await expect(result).rejects.toThrow('boom');
  });

  it('should reject with a retryable timeout AIError after ms elapses', async () => {
    // Arrange：永不 settle 的 Promise
    const pending = new Promise<never>(() => {});
    const result = withTimeout(pending, 1000);
    const assertion = expect(result).rejects.toMatchObject({
      name: 'AIError',
      code: 'timeout',
      retryable: true,
    });
    // Act：推进时钟触发超时
    await vi.advanceTimersByTimeAsync(1000);
    // Assert
    await assertion;
  });

  it('should not reject after resolution even when time passes', async () => {
    // Arrange
    const result = withTimeout(Promise.resolve('done'), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    // Assert
    await expect(result).resolves.toBe('done');
  });

  it('should default to the 75s constant and time out on it', async () => {
    // Arrange
    expect(AI_REQUEST_TIMEOUT_MS).toBe(75_000);
    const pending = new Promise<never>(() => {});
    const result = withTimeout(pending);
    const assertion = expect(result).rejects.toBeInstanceOf(AIError);
    // Act
    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
    // Assert
    await assertion;
  });
});
