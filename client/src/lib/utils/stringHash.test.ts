/**
 * 字符串哈希工具单元测试
 * Unit tests for string hash utilities
 *
 * @ai-context: stringHash 为 FNV-1a 变体（((h<<5)-h+c)|0），纯函数、
 * 确定性输出——测试覆盖稳定性（同输入恒同输出）、32 位有符号整数范围
 * 与 hashToRange 的取模映射及非法 max 防御。
 * @ai-context: stringHash is a pure deterministic hash; tests cover
 * stability, 32-bit signed range, modulo mapping and max<=0 guard.
 */
import { describe, it, expect } from 'vitest';
import { stringHash, hashToRange } from './stringHash';

describe('stringHash', () => {
  it('should be deterministic for identical input', () => {
    // Arrange
    const input = 'entropy-decrease-42';
    // Act
    const first = stringHash(input);
    const second = stringHash(input);
    // Assert
    expect(first).toBe(second);
  });

  it('should match the hand-computed FNV-1a variant values', () => {
    // Arrange/Act/Assert：与原 NotesPage 内联实现同算法
    expect(stringHash('a')).toBe(97);
    expect(stringHash('ab')).toBe(3105);
  });

  it('should stay within the 32-bit signed integer range', () => {
    // Arrange
    const samples = ['hello', '熵减', 'a'.repeat(100), 'Mixed Case 123!', ''];
    // Act
    const results = samples.map((s) => stringHash(s));
    // Assert
    for (const h of results) {
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(h).toBeLessThan(2 ** 31);
    }
  });

  it('should treat empty string as zero hash', () => {
    expect(stringHash('')).toBe(0);
  });
});

describe('hashToRange', () => {
  it('should map hash into [0, max)', () => {
    // Arrange
    const inputs = ['sunflower', 'tulip', 'cactus', 'lotus', 'bamboo', 'clover', ''];
    // Act/Assert
    for (const input of inputs) {
      const value = hashToRange(input, 8);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(8);
    }
  });

  it('should equal |stringHash| % max for positive max', () => {
    expect(hashToRange('ab', 10)).toBe(5);
    expect(hashToRange('a', 10)).toBe(7);
  });

  it('should return 0 when max is non-positive', () => {
    expect(hashToRange('anything', 0)).toBe(0);
    expect(hashToRange('anything', -5)).toBe(0);
  });
});
