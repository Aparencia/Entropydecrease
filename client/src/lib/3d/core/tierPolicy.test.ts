/**
 * tierPolicy 单元测试 — BDD 风格、AAA 模式
 *
 * @ai-context: 覆盖 stepTier 的全部迁移路径与边界保持，
 * 是 PerformanceMonitor 重构（自研监控 → drei 成熟方案）的行为护栏。
 */
import { describe, it, expect } from 'vitest';
import { stepTier } from './tierPolicy';

describe('stepTier（逐级迁移策略）', () => {
  describe('升级（up）', () => {
    it('low 应升级为 medium', () => {
      // Arrange & Act
      const result = stepTier('low', 'up');
      // Assert
      expect(result).toBe('medium');
    });

    it('medium 应升级为 high', () => {
      const result = stepTier('medium', 'up');
      expect(result).toBe('high');
    });

    it('high 已达上限，应保持不变', () => {
      const result = stepTier('high', 'up');
      expect(result).toBe('high');
    });
  });

  describe('降级（down）', () => {
    it('high 应降级为 medium', () => {
      const result = stepTier('high', 'down');
      expect(result).toBe('medium');
    });

    it('medium 应降级为 low', () => {
      const result = stepTier('medium', 'down');
      expect(result).toBe('low');
    });

    it('low 已达下限，应保持不变', () => {
      const result = stepTier('low', 'down');
      expect(result).toBe('low');
    });
  });

  describe('逐级性（禁止跨级跳变）', () => {
    it('升级时 low 不得直接跳到 high', () => {
      expect(stepTier('low', 'up')).not.toBe('high');
    });

    it('降级时 high 不得直接跳到 low', () => {
      expect(stepTier('high', 'down')).not.toBe('low');
    });
  });
});
