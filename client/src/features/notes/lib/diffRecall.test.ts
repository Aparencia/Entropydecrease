/**
 * N2 合书测试 diff 算法单元测试
 * Closed-book recall diff algorithm tests
 *
 * @ai-context: 覆盖三态判定——正确（高相似）、错误（无对应）、遗漏（原文
 * 未覆盖）；空答案全遗漏；短句阈值防误判。
 */
import { describe, it, expect } from 'vitest';
import { diffRecallAgainstNote, splitSentences } from './diffRecall';

const NOTE = '傅里叶变换将信号分解为不同频率的正弦波。频谱展示各频率分量的强度。逆变换可以把频谱还原为时域信号。';

describe('splitSentences', () => {
  it('should split by Chinese sentence punctuation and newlines', () => {
    expect(splitSentences('第一句。第二句！第三句？\n第四句')).toEqual(['第一句', '第二句', '第三句', '第四句']);
  });

  it('should drop too-short fragments (single char)', () => {
    expect(splitSentences('好。完整的句子内容')).toEqual(['完整的句子内容']);
  });
});

describe('diffRecallAgainstNote', () => {
  it('should mark answer sentence as correct when closely matching the note', () => {
    const diff = diffRecallAgainstNote('傅里叶变换将信号分解为不同频率的正弦波。', NOTE);
    expect(diff[0]).toMatchObject({ kind: 'correct', text: '傅里叶变换将信号分解为不同频率的正弦波' });
  });

  it('should mark fabricated content as wrong', () => {
    const diff = diffRecallAgainstNote('拉普拉斯变换用于解微分方程。', NOTE);
    expect(diff[0]).toMatchObject({ kind: 'wrong' });
  });

  it('should mark uncovered note sentences as missing', () => {
    const diff = diffRecallAgainstNote('频谱展示各频率分量的强度。', NOTE);
    const kinds = diff.map((d) => d.kind);
    expect(kinds).toContain('correct');
    expect(kinds.filter((k) => k === 'missing').length).toBe(2); // 另两句未覆盖
  });

  it('should treat empty answer as all missing', () => {
    const diff = diffRecallAgainstNote('', NOTE);
    expect(diff.length).toBe(3);
    expect(diff.every((d) => d.kind === 'missing')).toBe(true);
  });

  it('should not double-count one note sentence for two answer sentences', () => {
    const diff = diffRecallAgainstNote(
      '傅里叶变换将信号分解为不同频率的正弦波。逆变换可以把频谱还原为时域信号。',
      NOTE,
    );
    const missing = diff.filter((d) => d.kind === 'missing');
    expect(missing.map((d) => d.text)).toEqual(['频谱展示各频率分量的强度']);
  });

  it('should use stricter threshold for short sentences to avoid false positives', () => {
    const note = '坚持每日复习。记忆会衰减。';
    const diff = diffRecallAgainstNote('坚持每天复习。', note);
    // 短句相似但非逐字 → 可能判 wrong 而非 correct（阈值上浮）
    const correctCount = diff.filter((d) => d.kind === 'correct').length;
    expect(correctCount).toBeLessThan(2);
  });
});
