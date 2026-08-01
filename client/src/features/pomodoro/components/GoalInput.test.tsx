/**
 * @ai-context: GoalInput 回归测试——"跳过"与空输入点"开始"都必须启动计时
 * （提交空目标），只有真正取消（Modal 关闭按钮）才不启动。
 * @ai-context: Regression test — "skip" and empty-input "start" must both
 * launch the timer with an empty goal; only an explicit close cancels.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoalInput from './GoalInput';

// GoalMemory 读取 Dexie，测试中隔离掉真实数据库
vi.mock('@/lib/storage', () => ({
  db: {
    pomodoroGoals: {
      orderBy: () => ({
        reverse: () => ({
          limit: () => ({ toArray: () => Promise.resolve([]) }),
        }),
      }),
    },
  },
}));

// Modal 播放开关音效，测试中无需真实音频
vi.mock('@/lib/audio/SoundPlayer', () => ({
  soundPlayer: { play: vi.fn() },
}));

describe('GoalInput - 空目标番茄钟', () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();

  function renderGoalInput() {
    return render(
      <GoalInput
        open
        onClose={onClose}
        onSubmit={onSubmit}
        rememberGoal={false}
        onRememberChange={vi.fn()}
      />,
    );
  }

  beforeEach(() => {
    onSubmit.mockClear();
    onClose.mockClear();
  });

  it('点击"跳过"应提交空目标以启动计时，而非仅关闭弹窗', () => {
    renderGoalInput();

    fireEvent.click(screen.getByRole('button', { name: '跳过' }));

    // 核心断言：跳过 = 无目标但开始计时
    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('输入为空时点击"开始"也应启动计时', () => {
    renderGoalInput();

    fireEvent.click(screen.getByRole('button', { name: '开始' }));

    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('输入为空时按 Enter 也应启动计时', () => {
    renderGoalInput();

    fireEvent.keyDown(screen.getByPlaceholderText('这个番茄要做什么？'), { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('有目标时点击"开始"提交去空格后的目标', () => {
    renderGoalInput();

    fireEvent.change(screen.getByPlaceholderText('这个番茄要做什么？'), {
      target: { value: '  背单词  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始' }));

    expect(onSubmit).toHaveBeenCalledWith('背单词');
  });

  it('点击"取消"不提交、不启动计时', () => {
    renderGoalInput();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('点击关闭按钮也是取消：不提交、不启动计时', () => {
    renderGoalInput();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
