/**
 * DashboardCard 组件测试 — 双方案表面语言分支
 *
 * 验证 deep-sea（毛玻璃发光系）与 aurora-dome（平面阴影系）渲染出不同的 class 组合，
 * 保证「两套方案非换色」的结构性差异在卡片容器层成立。
 *
 * @ai-context: 覆盖 DashboardCard 双 scheme 表面样式分支。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DashboardCard } from './DashboardCard';

// mock useHomeScheme：组件依赖 appSettingsStore（Dexie）与 useThemeStore，单测注入固定 scheme
const mockUseHomeScheme = vi.fn();
vi.mock('../hooks/useHomeScheme', () => ({
  useHomeScheme: () => mockUseHomeScheme(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardCard（双方案表面语言）', () => {
  beforeEach(() => {
    mockUseHomeScheme.mockReturnValue({ scheme: 'deep-sea' });
  });

  it('deep-sea 渲染毛玻璃系（backdrop-blur + 半透明底 + 细边框）', () => {
    // Arrange & Act
    render(<DashboardCard className="extra">内容</DashboardCard>);
    const card = screen.getByText('内容');

    // Assert
    expect(card.className).toContain('backdrop-blur-sm');
    expect(card.className).toContain('bg-bg-elevated/30');
    expect(card.className).toContain('border-border/15');
    expect(card.className).not.toContain('shadow-kb-sm');
    expect(card.className).toContain('extra');
  });

  it('aurora-dome 渲染平面系（不透明底 + 浅阴影 + 无 blur）', () => {
    // Arrange
    mockUseHomeScheme.mockReturnValue({ scheme: 'aurora-dome' });

    // Act
    render(<DashboardCard>内容</DashboardCard>);
    const card = screen.getByText('内容');

    // Assert
    expect(card.className).toContain('shadow-kb-sm');
    expect(card.className).toContain('bg-bg-elevated');
    expect(card.className).toContain('border-border/30');
    expect(card.className).not.toContain('backdrop-blur-sm');
    expect(card.className).not.toContain('bg-bg-elevated/30');
  });

  it('可点击卡片 deep-sea 下带 hover 光晕与指针样式', () => {
    // Arrange & Act
    render(<DashboardCard onClick={() => {}}>按钮卡</DashboardCard>);
    const card = screen.getByText('按钮卡');

    // Assert
    expect(card.className).toContain('cursor-pointer');
    expect(card.className).toContain('hover:bg-bg-elevated/50');
    expect(card.className).toMatch(/hover:shadow-\[0_0_24px/);
  });
});
