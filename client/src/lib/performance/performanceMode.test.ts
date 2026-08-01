/**
 * performanceMode 单元测试 — BDD 风格、AAA 模式
 *
 * @ai-context: 覆盖三档配置映射、effectiveTier 天花板逻辑、持久化读写与旧键迁移。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PERFORMANCE_MODE_CONFIG,
  PERFORMANCE_MODES,
  DEFAULT_PERFORMANCE_MODE,
  PERFORMANCE_MODE_KEY,
  LEGACY_PERFORMANCE_MODE_KEY,
  modeToTierCap,
  isPerformanceMode,
  effectiveTier,
  readPerformanceMode,
  writePerformanceMode,
} from './performanceMode';

describe('performanceMode 配置层', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('三档配置表', () => {
    it('应包含 low/medium/high 三档且显示名为 静谧/从容/澎湃', () => {
      // Arrange & Act
      const labels = PERFORMANCE_MODES.map((m) => m.label);
      // Assert
      expect(PERFORMANCE_MODES).toHaveLength(3);
      expect(labels).toEqual(['静谧', '从容', '澎湃']);
    });

    it('默认模式应为 medium（从容）', () => {
      expect(DEFAULT_PERFORMANCE_MODE).toBe('medium');
    });

    it('各档 tier 上限应依次为 low/medium/high', () => {
      expect(modeToTierCap('low')).toBe('low');
      expect(modeToTierCap('medium')).toBe('medium');
      expect(modeToTierCap('high')).toBe('high');
    });

    it('low 档应减弱动画并允许后台节流，medium/high 不应', () => {
      expect(PERFORMANCE_MODE_CONFIG.low.reduceMotion).toBe(true);
      expect(PERFORMANCE_MODE_CONFIG.low.allowBackgroundThrottling).toBe(true);
      expect(PERFORMANCE_MODE_CONFIG.medium.reduceMotion).toBe(false);
      expect(PERFORMANCE_MODE_CONFIG.high.allowBackgroundThrottling).toBe(false);
    });

    it('模块态帧率应为 low=0(暂停)/medium=10/high=30', () => {
      expect(PERFORMANCE_MODE_CONFIG.low.moduleFps).toBe(0);
      expect(PERFORMANCE_MODE_CONFIG.medium.moduleFps).toBe(10);
      expect(PERFORMANCE_MODE_CONFIG.high.moduleFps).toBe(30);
    });
  });

  describe('isPerformanceMode', () => {
    it('应识别合法模式值', () => {
      expect(isPerformanceMode('low')).toBe(true);
      expect(isPerformanceMode('medium')).toBe(true);
      expect(isPerformanceMode('high')).toBe(true);
    });

    it('应拒绝非法值', () => {
      expect(isPerformanceMode('ultra')).toBe(false);
      expect(isPerformanceMode('')).toBe(false);
      expect(isPerformanceMode(null)).toBe(false);
      expect(isPerformanceMode(42)).toBe(false);
    });
  });

  describe('effectiveTier（天花板模型）', () => {
    it('自动 tier 低于上限时取自动 tier', () => {
      // Arrange & Act & Assert
      expect(effectiveTier('low', 'high')).toBe('low');
      expect(effectiveTier('medium', 'high')).toBe('medium');
    });

    it('自动 tier 高于上限时被上限截断', () => {
      expect(effectiveTier('high', 'medium')).toBe('medium');
      expect(effectiveTier('high', 'low')).toBe('low');
      expect(effectiveTier('medium', 'low')).toBe('low');
    });

    it('自动 tier 等于上限时保持不变', () => {
      expect(effectiveTier('medium', 'medium')).toBe('medium');
      expect(effectiveTier('low', 'low')).toBe('low');
      expect(effectiveTier('high', 'high')).toBe('high');
    });
  });

  describe('持久化读写', () => {
    it('无持久化值时应返回默认 medium', () => {
      expect(readPerformanceMode()).toBe('medium');
    });

    it('写入后应能读回', () => {
      // Arrange & Act
      writePerformanceMode('low');
      // Assert
      expect(readPerformanceMode()).toBe('low');
      expect(localStorage.getItem(PERFORMANCE_MODE_KEY)).toBe('low');
    });

    it('持久化值非法时应回退默认 medium', () => {
      // Arrange
      localStorage.setItem(PERFORMANCE_MODE_KEY, 'ultra');
      // Act & Assert
      expect(readPerformanceMode()).toBe('medium');
    });

    it('应迁移旧键 keban- 到新键', () => {
      // Arrange
      localStorage.setItem(LEGACY_PERFORMANCE_MODE_KEY, 'high');
      // Act
      const mode = readPerformanceMode();
      // Assert
      expect(mode).toBe('high');
      expect(localStorage.getItem(PERFORMANCE_MODE_KEY)).toBe('high');
      expect(localStorage.getItem(LEGACY_PERFORMANCE_MODE_KEY)).toBeNull();
    });
  });
});
