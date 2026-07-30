/**
 * RitualStepGoal 组件测试 / Component tests for the goal step
 *
 * @ai-context: 覆盖 T-A1-04——快选标签渲染（接力项置顶高亮）、点击填入、
 * 三段式填空与自由输入切换、Enter 提交。
 * @ai-context: Covers T-A1-04: quick tags (relay first), tag pick,
 * structured/free input toggle and Enter submit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RitualStepGoal } from './RitualStepGoal';
import type { QuickTag } from '../../types';

const TAGS: QuickTag[] = [
  { text: '完成第三章习题', relay: true },
  { text: '线性代数', relay: false },
  { text: '微积分', relay: false },
];

function setup(overrides: Partial<Parameters<typeof RitualStepGoal>[0]> = {}) {
  const props = {
    goalText: '',
    onGoalChange: vi.fn(),
    quickTags: TAGS,
    onPickTag: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<RitualStepGoal {...props} />);
  return props;
}

afterEach(() => cleanup());

describe('RitualStepGoal', () => {
  it('should render quick tags with relay item highlighted first', () => {
    // Arrange & Act
    setup();

    // Assert — 接力项带"继续："前缀
    expect(screen.getByRole('button', { name: /继续：完成第三章习题/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '线性代数' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '微积分' })).toBeInTheDocument();
  });

  it('should emit onPickTag when a tag is clicked', () => {
    // Arrange
    const props = setup();

    // Act
    fireEvent.click(screen.getByRole('button', { name: '线性代数' }));

    // Assert
    expect(props.onPickTag).toHaveBeenCalledWith({ text: '线性代数', relay: false });
  });

  it('should emit onGoalChange for free input and submit on Enter', () => {
    // Arrange
    const props = setup();
    const input = screen.getByRole('textbox', { name: '微目标' });

    // Act
    fireEvent.change(input, { target: { value: '搞懂卷积' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Assert
    expect(props.onGoalChange).toHaveBeenCalledWith('搞懂卷积');
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('should toggle to structured mode and compose goal text', () => {
    // Arrange
    const props = setup();

    // Act — 切换到引导填空
    fireEvent.click(screen.getByRole('button', { name: '引导填空' }));

    // Assert — 三段式控件出现
    expect(screen.getByRole('combobox', { name: '目标动词' })).toBeInTheDocument();

    // Act — 填对象触发合成
    fireEvent.change(screen.getByRole('textbox', { name: '目标对象' }), {
      target: { value: '傅里叶变换' },
    });

    // Assert — 默认动词"搞懂" + 对象
    expect(props.onGoalChange).toHaveBeenCalledWith('搞懂傅里叶变换');
  });

  it('should toggle back to free input mode', () => {
    // Arrange
    setup();
    fireEvent.click(screen.getByRole('button', { name: '引导填空' }));

    // Act
    fireEvent.click(screen.getByRole('button', { name: '自由输入' }));

    // Assert
    expect(screen.getByRole('textbox', { name: '微目标' })).toBeInTheDocument();
  });

  it('should hide tag row when no quick tags', () => {
    // Arrange & Act
    setup({ quickTags: [] });

    // Assert
    expect(screen.queryByRole('button', { name: /继续：/ })).not.toBeInTheDocument();
  });
});
