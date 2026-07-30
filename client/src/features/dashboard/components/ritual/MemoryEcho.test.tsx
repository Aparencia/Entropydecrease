/**
 * MemoryEcho 组件测试 / Tests for the memory echo timeline
 *
 * @ai-context: 覆盖 T-B1-04——多项渲染、空态不渲染、excerpt 可选。
 * @ai-context: Covers T-B1-04: list render, empty state, optional excerpt.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryEcho } from './MemoryEcho';
import type { MemoryEchoItem } from '../../types';

afterEach(() => cleanup());

const ITEMS: MemoryEchoItem[] = [
  { title: '线性代数', excerpt: '矩阵与向量空间', dateLabel: '今天' },
  { title: '微积分', dateLabel: '昨天' },
  { title: '概率论', excerpt: '条件概率', dateLabel: '3 天前' },
];

describe('MemoryEcho', () => {
  it('should render nothing when items are empty', () => {
    const { container } = render(<MemoryEcho items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render all items as list items', () => {
    render(<MemoryEcho items={ITEMS} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('线性代数')).toBeInTheDocument();
    expect(screen.getByText('概率论')).toBeInTheDocument();
  });

  it('should render excerpt only when present', () => {
    render(<MemoryEcho items={ITEMS} />);
    expect(screen.getByText('矩阵与向量空间')).toBeInTheDocument();
    expect(screen.getByText('条件概率')).toBeInTheDocument();
    // 微积分无 excerpt，date 标签仍在
    expect(screen.getByText('昨天')).toBeInTheDocument();
  });
});
