/**
 * collectWeakDimensions 单元测试
 *
 * @ai-context: E4 苏格拉底-费曼数据互通工具函数的测试：
 * 验证低于阈值维度聚合、每维度取最低分、无维度轮次跳过等行为。
 */
import { describe, it, expect } from 'vitest';
import { collectWeakDimensions, WEAK_DIMENSION_THRESHOLD } from './collectWeakDimensions';

describe('collectWeakDimensions', () => {
  it('阈值为 6', () => {
    expect(WEAK_DIMENSION_THRESHOLD).toBe(6);
  });

  it('无 dimensions 的轮次应被跳过', () => {
    expect(collectWeakDimensions([{ }, { dimensions: undefined }])).toEqual([]);
  });

  it('所有维度均 >=6 时应返回空列表', () => {
    const rounds = [{ dimensions: { accuracy: 8, completeness: 6, logic: 9, expression: 7 } }];
    expect(collectWeakDimensions(rounds)).toEqual([]);
  });

  it('低于阈值的维度应生成对应文本（含分数）', () => {
    const rounds = [{ dimensions: { accuracy: 4, completeness: 8, logic: 5, expression: 9 } }];
    const result = collectWeakDimensions(rounds);
    expect(result).toContain('准确度不足（4/10）');
    expect(result).toContain('逻辑清晰度不足（5/10）');
    expect(result).toHaveLength(2);
  });

  it('同一维度多轮出现时应取最低分', () => {
    const rounds = [
      { dimensions: { accuracy: 5, completeness: 8, logic: 8, expression: 8 } },
      { dimensions: { accuracy: 3, completeness: 8, logic: 8, expression: 8 } },
      { dimensions: { accuracy: 7, completeness: 8, logic: 8, expression: 8 } },
    ];
    expect(collectWeakDimensions(rounds)).toEqual(['准确度不足（3/10）']);
  });

  it('边界值 6 分不应视为薄弱', () => {
    const rounds = [{ dimensions: { accuracy: 6, completeness: 6, logic: 6, expression: 6 } }];
    expect(collectWeakDimensions(rounds)).toEqual([]);
  });
});
