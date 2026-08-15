/**
 * 轻量应用事件总线单元测试
 * Unit tests for the lightweight app event bus
 *
 * @ai-context: 覆盖订阅/取消订阅、多监听器广播、监听器异常隔离
 * （console.error 且不影响其他监听器）与 clear 全量清理。纯内存实现，
 * 每个测试用 clear() 隔离。
 * @ai-context: Covers subscribe/unsubscribe, multi-listener broadcast,
 * listener error isolation (console.error without breaking others) and
 * full clear(). In-memory only; each test isolates via clear().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assistantEventBus } from './eventBus';
import type { TriggerContext } from '../types';

const ctx: TriggerContext = { currentHour: 10, sessionMinutes: 25 };

describe('assistantEventBus', () => {
  beforeEach(() => {
    assistantEventBus.clear();
  });
  afterEach(() => {
    assistantEventBus.clear();
  });

  it('should deliver emitted context to a subscribed listener', () => {
    // Arrange
    const listener = vi.fn();
    assistantEventBus.on('session:end', listener);
    // Act
    assistantEventBus.emit('session:end', ctx);
    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(ctx);
  });

  it('should broadcast to multiple listeners of the same event', () => {
    // Arrange
    const a = vi.fn();
    const b = vi.fn();
    assistantEventBus.on('user:idle', a);
    assistantEventBus.on('user:idle', b);
    // Act
    assistantEventBus.emit('user:idle', ctx);
    // Assert
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('should not deliver across different events', () => {
    // Arrange
    const listener = vi.fn();
    assistantEventBus.on('review:due', listener);
    // Act
    assistantEventBus.emit('app:startup', ctx);
    // Assert
    expect(listener).not.toHaveBeenCalled();
  });

  it('should stop delivering after unsubscribe', () => {
    // Arrange
    const listener = vi.fn();
    const off = assistantEventBus.on('intention:due', listener);
    // Act
    off();
    assistantEventBus.emit('intention:due', ctx);
    // Assert
    expect(listener).not.toHaveBeenCalled();
  });

  it('should be safe to emit with no listeners', () => {
    // Act/Assert：不抛错
    expect(() => assistantEventBus.emit('user:active', ctx)).not.toThrow();
  });

  it('should isolate a throwing listener and keep others running', () => {
    // Arrange
    const boom = vi.fn(() => { throw new Error('listener exploded'); });
    const ok = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    assistantEventBus.on('cognitive:overload', boom);
    assistantEventBus.on('cognitive:overload', ok);
    // Act
    assistantEventBus.emit('cognitive:overload', ctx);
    // Assert：异常被捕获记录，不影响第二个监听器
    expect(errorSpy).toHaveBeenCalled();
    expect(ok).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('should clear all listeners', () => {
    // Arrange
    const listener = vi.fn();
    assistantEventBus.on('stuck:incubation', listener);
    // Act
    assistantEventBus.clear();
    assistantEventBus.emit('stuck:incubation', ctx);
    // Assert
    expect(listener).not.toHaveBeenCalled();
  });
});
