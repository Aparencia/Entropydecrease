/**
 * RitualStepReview 组件测试 / Component tests for the review step
 *
 * @ai-context: 覆盖 T-A1-02——遮罩-揭示流程（点击揭示 / 3s 倒计时自动
 * 揭示）、三档掌握标记交互、无上次数据空态。使用 fake timers 驱动倒计时。
 * @ai-context: Covers T-A1-02: mask-reveal (click / 3s auto), mastery
 * marks and empty state. Fake timers drive the countdown.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { RitualStepReview } from './RitualStepReview';
import type { LastSessionData } from '../../types';

const SESSION: LastSessionData = {
  noteTitle: '傅里叶变换',
  noteExcerpt: '频域分解的核心思想',
  noteId: 'note-1',
  studiedAt: '2026-07-30T08:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RitualStepReview', () => {
  it('should render masked excerpt with reveal hint initially', () => {
    // Arrange & Act
    render(<RitualStepReview lastSession={SESSION} mastery={null} onMasteryChange={() => {}} />);

    // Assert
    expect(screen.getByText('傅里叶变换')).toBeInTheDocument();
    expect(screen.getByText(/先回忆一下内容/)).toBeInTheDocument();
  });

  it('should reveal excerpt on click', () => {
    // Arrange
    render(<RitualStepReview lastSession={SESSION} mastery={null} onMasteryChange={() => {}} />);

    // Act
    fireEvent.click(screen.getByRole('button', { name: '点击揭示上次学习内容' }));

    // Assert — 遮罩提示消失
    expect(screen.queryByText(/先回忆一下内容/)).not.toBeInTheDocument();
  });

  it('should auto-reveal after 3s countdown', () => {
    // Arrange
    vi.useFakeTimers();
    render(<RitualStepReview lastSession={SESSION} mastery={null} onMasteryChange={() => {}} />);

    // Act — 逐秒推进（倒计时定时器逐次链式调度，需分步 act 刷新）
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });

    // Assert
    expect(screen.queryByText(/先回忆一下内容/)).not.toBeInTheDocument();
  });

  it('should emit mastery change before reveal (marks usable anytime)', () => {
    // Arrange
    const onMasteryChange = vi.fn();
    render(<RitualStepReview lastSession={SESSION} mastery={null} onMasteryChange={onMasteryChange} />);

    // Act — 未揭示状态直接点标记
    fireEvent.click(screen.getByRole('radio', { name: /模糊/ }));

    // Assert
    expect(onMasteryChange).toHaveBeenCalledWith('fuzzy');
  });

  it('should reflect selected mastery via aria-checked', () => {
    // Arrange & Act
    render(<RitualStepReview lastSession={SESSION} mastery="unmastered" onMasteryChange={() => {}} />);

    // Assert
    expect(screen.getByRole('radio', { name: /未掌握/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /已掌握/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('should render empty state without last session', () => {
    // Arrange & Act
    render(<RitualStepReview lastSession={undefined} mastery={null} onMasteryChange={() => {}} />);

    // Assert
    expect(screen.getByText(/还没有学习记录/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
