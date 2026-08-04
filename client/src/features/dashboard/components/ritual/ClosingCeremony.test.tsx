/**
 * ClosingCeremony 组件测试 / Tests for the R3 closing ceremony branch
 *
 * @ai-context: 覆盖结束仪式契约——总结卡（目标/掌握/用时/连续天数）渲染、
 * 复习卡闭环三态文案（模糊/未掌握→已安排、已掌握→无需、未标记→引导）、
 * 开始学习按钮触发 onClose。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ClosingCeremony } from './ClosingCeremony';

afterEach(() => {
  cleanup();
});

describe('ClosingCeremony (R3)', () => {
  it('should render summary card with goal, mastery, duration and streak', () => {
    render(
      <ClosingCeremony
        goal={{ text: '搞懂傅里叶变换', tags: [] }}
        masteryMark="fuzzy"
        streakDays={3}
        durationMs={125_000}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/今日仪式完成/)).toBeInTheDocument();
    expect(screen.getByText(/今日目标：搞懂傅里叶变换/)).toBeInTheDocument();
    expect(screen.getByText(/上次掌握度：模糊/)).toBeInTheDocument();
    expect(screen.getByText(/仪式用时：2 分 5 秒/)).toBeInTheDocument();
    expect(screen.getByText(/连续 3 天/)).toBeInTheDocument();
  });

  it('should announce review card planned for fuzzy mark (closure loop)', () => {
    render(<ClosingCeremony masteryMark="fuzzy" streakDays={1} durationMs={1000} onClose={() => {}} />);
    expect(screen.getByText(/已为你安排 1 张复习卡/)).toBeInTheDocument();
  });

  it('should announce review card planned for unmastered mark', () => {
    render(<ClosingCeremony masteryMark="unmastered" streakDays={1} durationMs={1000} onClose={() => {}} />);
    expect(screen.getByText(/已为你安排 1 张复习卡/)).toBeInTheDocument();
  });

  it('should not plan review card when mastered', () => {
    render(<ClosingCeremony masteryMark="mastered" streakDays={1} durationMs={1000} onClose={() => {}} />);
    expect(screen.getByText(/已掌握的内容无需额外复习卡/)).toBeInTheDocument();
  });

  it('should guide user when mastery not marked', () => {
    render(<ClosingCeremony streakDays={1} durationMs={1000} onClose={() => {}} />);
    expect(screen.getByText(/标记掌握度后可为模糊内容安排复习卡/)).toBeInTheDocument();
  });

  it('should call onClose when start button clicked', () => {
    const onClose = vi.fn();
    render(<ClosingCeremony streakDays={1} durationMs={1000} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /开始学习/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
