/**
 * noteHealth 单元测试
 *
 * @ai-context: 覆盖短内容返回 null、结构化笔记高分、照抄特征低分、建议生成。
 */
import { describe, it, expect } from 'vitest';
import { assessNoteHealth, healthLevel } from './noteHealth';

/** 生成指定长度的填充文本 */
const pad = (n: number) => '深度学习需要理解与练习相结合'.repeat(Math.ceil(n / 14));

describe('assessNoteHealth', () => {
  it('短内容（<30字）返回 null', () => {
    expect(assessNoteHealth('太短了')).toBeNull();
    expect(assessNoteHealth('')).toBeNull();
  });

  it('结构化的生成性笔记得分较高', () => {
    const good = [
      '# 反向传播',
      '## 我的理解',
      '简单来说，反向传播就是把误差从输出层一路传回去，换句话说就是"追责机制"。',
      '- 梯度是方向',
      '- 学习率是步长',
      '总结一下：我认为本质上它是链式法则的工程化应用，打个比方就像调音师逐根弦校准。',
      '## 练习',
      pad(200),
    ].join('\n');
    const result = assessNoteHealth(good)!;
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.generative).toBeGreaterThanOrEqual(60);
    expect(result.structure).toBeGreaterThanOrEqual(55);
  });

  it('大段照抄（无结构、无生成标记）得分较低并给出建议', () => {
    const copied = [
      pad(150),
      pad(150),
      pad(150),
      pad(150),
    ].join('\n');
    const result = assessNoteHealth(copied)!;
    expect(result.score).toBeLessThan(55);
    expect(result.generative).toBeLessThan(45);
    expect(result.suggestions.some((s) => s.includes('自己的话'))).toBe(true);
  });

  it('无标题时给出结构建议', () => {
    const text = ['- 要点一：梯度下降', '- 要点二：学习率', pad(220)].join('\n');
    const result = assessNoteHealth(text)!;
    expect(result.suggestions.some((s) => s.includes('小标题'))).toBe(true);
  });

  it('healthLevel 分级边界', () => {
    expect(healthLevel(75)).toBe('good');
    expect(healthLevel(70)).toBe('good');
    expect(healthLevel(50)).toBe('fair');
    expect(healthLevel(40)).toBe('fair');
    expect(healthLevel(20)).toBe('weak');
  });
});
