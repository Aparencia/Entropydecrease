/**
 * IncubationBreathing 组件测试 / Tests for the T4 incubation overlay
 *
 * @ai-context: 覆盖 T4 孵化休息契约——3 分钟倒计时、提前关闭、完成态提示；
 * 复用呼吸组件的降级模式（reduced-motion）渲染，jsdom 内 stub matchMedia
 * 与 RAF，避免真实动画循环。
 * @ai-context: Covers the 3-minute countdown, early close and finished state;
 * uses the degraded breathing mode to stay deterministic in jsdom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { IncubationBreathing } from './IncubationBreathing';

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

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  stubMatchMedia(true); // 降级模式：静态圆环 + 1Hz 倒计时，测试确定性
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('IncubationBreathing (T4)', () => {
  it('should render nothing when closed', () => {
    render(<IncubationBreathing open={false} onClose={() => {}} />);
    expect(screen.queryByText(/孵化时刻/)).not.toBeInTheDocument();
  });

  it('should show 3-minute countdown when opened', () => {
    render(<IncubationBreathing open onClose={() => {}} />);
    expect(screen.getByText(/孵化时刻/)).toBeInTheDocument();
    expect(screen.getByText(/3:00/)).toBeInTheDocument();
    expect(screen.getByText(/随时可提前回到任务/)).toBeInTheDocument();
  });

  it('should count down every second and finish after 3 minutes', () => {
    render(<IncubationBreathing open onClose={() => {}} />);
    // React 渲染与 fake timers 互锁：逐秒推进 + act flush，链式重注册
    for (let i = 0; i < 60; i++) {
      act(() => { vi.advanceTimersByTime(1000); });
    }
    expect(screen.getByText(/2:00/)).toBeInTheDocument();

    for (let i = 0; i < 120; i++) {
      act(() => { vi.advanceTimersByTime(1000); });
    }
    expect(screen.getByText(/放松完成/)).toBeInTheDocument();
    expect(screen.queryByText(/2:00/)).not.toBeInTheDocument();
  });

  it('should call onClose when early-close button clicked', () => {
    const onClose = vi.fn();
    render(<IncubationBreathing open onClose={onClose} />);
    act(() => {
      screen.getByRole('button', { name: /回到任务/ }).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
