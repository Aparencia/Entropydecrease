/**
 * useRitualMachine 单元测试 / Unit tests for the ritual state machine
 *
 * @ai-context: 覆盖 T-A1-01——步骤推进/回退/越界钳制/编排注入/时长计量。
 * @ai-context: Covers T-A1-01: step advance/back/clamping/plan injection.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRitualMachine, DEFAULT_RITUAL_PLAN } from './useRitualMachine';
import type { RitualStep } from '../types';

afterEach(() => {
  vi.useRealTimers();
});

describe('useRitualMachine', () => {
  it('should start at first step of default plan', () => {
    // Act
    const { result } = renderHook(() => useRitualMachine());

    // Assert
    expect(result.current.steps).toEqual(DEFAULT_RITUAL_PLAN);
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.currentStep).toBe('review');
    expect(result.current.isLast).toBe(false);
    expect(result.current.planVariant).toBe('standard');
  });

  it('should advance through steps and clamp at the last step', () => {
    // Arrange
    const { result } = renderHook(() => useRitualMachine());

    // Act
    act(() => result.current.next());
    act(() => result.current.next());

    // Assert — 默认四步：review→goal→intention
    expect(result.current.currentStep).toBe('intention');
    expect(result.current.isLast).toBe(false);

    // Act — 推进到末步呼吸并被钳制
    act(() => result.current.next());
    expect(result.current.currentStep).toBe('breathing');
    expect(result.current.isLast).toBe(true);
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(3);
  });

  it('should go back and clamp at the first step', () => {
    // Arrange
    const { result } = renderHook(() => useRitualMachine());
    act(() => result.current.next());

    // Act
    act(() => result.current.prev());
    act(() => result.current.prev());

    // Assert
    expect(result.current.stepIndex).toBe(0);
  });

  it('should accept an injected plan and variant', () => {
    // Arrange
    const plan: RitualStep[] = ['goal', 'breathing'];

    // Act
    const { result } = renderHook(() => useRitualMachine(plan, 'light'));

    // Assert
    expect(result.current.steps).toEqual(plan);
    expect(result.current.currentStep).toBe('goal');
    expect(result.current.planVariant).toBe('light');
  });

  it('should fall back to default plan when given an empty plan', () => {
    // Act
    const { result } = renderHook(() => useRitualMachine([]));

    // Assert
    expect(result.current.steps).toEqual(DEFAULT_RITUAL_PLAN);
  });

  it('should measure elapsed time from mount', () => {
    // Arrange
    vi.useFakeTimers();
    const { result } = renderHook(() => useRitualMachine());

    // Act
    vi.advanceTimersByTime(1234);

    // Assert
    expect(result.current.getElapsedMs()).toBeGreaterThanOrEqual(1234);
  });
});
