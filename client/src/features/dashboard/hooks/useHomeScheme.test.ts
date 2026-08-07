/**
 * useHomeScheme 纯计算逻辑测试 — BDD 风格、AAA 模式
 *
 * resolveHomeScheme 是双方案决策的纯函数核心：设置（auto/覆盖）+ 主题 → 生效方案。
 * hook 层的 Dexie 持久化由手动验证路径覆盖，此处只锁纯逻辑。
 *
 * @ai-context: 覆盖 auto 映射与覆盖优先的完整决策矩阵。
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveHomeScheme } from './useHomeScheme';

// mock useThemeStore：其模块顶层 applyTheme 依赖 window.matchMedia，单测环境不可用；
// 本测试只锁 resolveHomeScheme 纯函数，不涉及主题 store 集成。
vi.mock('@/stores/useThemeStore', () => ({
  useThemeStore: () => ({ theme: 'dark' }),
}));

describe('resolveHomeScheme（首页方案决策）', () => {
  describe('auto（跟随主题）', () => {
    it('dark 主题 → deep-sea', () => {
      expect(resolveHomeScheme('auto', 'dark')).toBe('deep-sea');
    });

    it('light 主题 → aurora-dome', () => {
      expect(resolveHomeScheme('auto', 'light')).toBe('aurora-dome');
    });
  });

  describe('覆盖设置优先', () => {
    it('深色主题 + 强制 aurora-dome → aurora-dome', () => {
      expect(resolveHomeScheme('aurora-dome', 'dark')).toBe('aurora-dome');
    });

    it('浅色主题 + 强制 deep-sea → deep-sea', () => {
      expect(resolveHomeScheme('deep-sea', 'light')).toBe('deep-sea');
    });

    it('强制值与主题一致时仍返回强制值', () => {
      expect(resolveHomeScheme('deep-sea', 'dark')).toBe('deep-sea');
      expect(resolveHomeScheme('aurora-dome', 'light')).toBe('aurora-dome');
    });
  });
});
