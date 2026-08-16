/**
 * UUID 生成工具单元测试
 * Unit tests for the UUID generator
 *
 * @ai-context: generateId 为全站实体主键统一入口（CRDT 依赖全局唯一 id）。
 * 测试校验输出为合法 UUID v4 格式且互不重复。
 * @ai-context: generateId is the single entry point for entity primary
 * keys (CRDT relies on globally unique ids). Tests verify valid UUID v4
 * format and uniqueness.
 */
import { describe, it, expect } from 'vitest';
import { generateId } from './uuid';

describe('generateId', () => {
  it('should produce a valid UUID v4 string', () => {
    // Arrange/Act
    const id = generateId();
    // Assert
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should produce unique ids across calls', () => {
    // Act
    const ids = Array.from({ length: 100 }, () => generateId());
    // Assert
    expect(new Set(ids).size).toBe(100);
  });
});
