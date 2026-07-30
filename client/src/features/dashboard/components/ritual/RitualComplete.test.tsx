/**
 * RitualComplete 组件测试 / Tests for the completion card
 *
 * @ai-context: 覆盖 T-A2-04——火种天数展示、今日卡（目标/掌握度/无目标空态）、
 * 点击进入、4s 自动进入。matchMedia 自 mock（reduced-motion=false）。
 * @ai-context: Covers streak display, today card, click/auto enter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { RitualComplete } from './RitualComplete';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RitualComplete', () => {
  it('should render streak days and goal text', () => {
    // Act
    render(<RitualComplete goal={{ text: '搞懂卷积', tags: [] }} masteryMark="fuzzy" streakDays={5} onEnter={() => {}} />);

    // Assert
    expect(screen.getByText('连续 5 天')).toBeInTheDocument();
    expect(screen.getByText('搞懂卷积')).toBeInTheDocument();
    expect(screen.getByText(/掌握度：模糊/)).toBeInTheDocument();
  });

  it('should render empty-goal fallback', () => {
    // Act
    render(<RitualComplete streakDays={1} onEnter={() => {}} />);

    // Assert
    expect(screen.getByText(/没有设定目标/)).toBeInTheDocument();
  });

  it('should call onEnter on button click', () => {
    // Arrange
    const onEnter = vi.fn();
    render(<RitualComplete streakDays={1} onEnter={onEnter} />);

    // Act
    fireEvent.click(screen.getByRole('button', { name: /进入学习/ }));

    // Assert
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('should auto-enter after 4s', () => {
    // Arrange
    vi.useFakeTimers();
    const onEnter = vi.fn();
    render(<RitualComplete streakDays={1} onEnter={onEnter} />);

    // Act
    act(() => { vi.advanceTimersByTime(4000); });

    // Assert
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
