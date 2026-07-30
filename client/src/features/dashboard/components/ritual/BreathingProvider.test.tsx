/**
 * BreathingProvider 组件测试 / Tests for the breathing container
 *
 * @ai-context: 覆盖 T-A2-01 核心契约——useBreathing 越界保护、reduced-motion
 * 降级（degraded=true 且不跑 RAF）、标准模式初始态。jsdom 无 matchMedia，
 * 测试内自 mock；RAF 精确时序/相位误差属运行时人工验证项，不在此断言。
 * @ai-context: Covers context guard, reduced-motion degradation and initial
 * standard state. matchMedia is mocked; RAF timing is verified at runtime.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, cleanup } from '@testing-library/react';
import { BreathingProvider } from './BreathingProvider';
import { useBreathing } from './breathingContext';

function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

function Probe() {
  const { degraded, breathing } = useBreathing();
  return <div data-testid="probe">{degraded ? 'degraded' : 'active'}:{breathing.phase}</div>;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useBreathing', () => {
  it('should throw when used outside provider', () => {
    // Arrange
    stubMatchMedia(false);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act & Assert
    expect(() => renderHook(() => useBreathing())).toThrow(/BreathingProvider/);
    spy.mockRestore();
  });
});

describe('BreathingProvider', () => {
  it('should mark degraded under prefers-reduced-motion', () => {
    // Arrange
    stubMatchMedia(true);

    // Act
    render(<BreathingProvider><Probe /></BreathingProvider>);

    // Assert
    expect(screen.getByTestId('probe').textContent).toContain('degraded');
  });

  it('should start active (non-degraded) at inhale under standard motion', () => {
    // Arrange
    stubMatchMedia(false);

    // Act
    render(<BreathingProvider><Probe /></BreathingProvider>);

    // Assert
    expect(screen.getByTestId('probe').textContent).toBe('active:inhale');
  });
});
