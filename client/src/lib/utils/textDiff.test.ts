/**
 * textDiff 纯函数单元测试
 */
import { describe, it, expect } from 'vitest';
import { textDiff, diffStats, type DiffLine } from './textDiff';

describe('textDiff', () => {
  it('完全相同的文本无差异', () => {
    const diff = textDiff('a\nb\nc', 'a\nb\nc');
    expect(diff.every((l) => l.type === 'equal')).toBe(true);
    expect(diff.length).toBe(3);
  });

  it('中间行被替换', () => {
    const diff = textDiff('a\nb\nc', 'a\nx\nc');
    const types = diff.map((l) => l.type);
    expect(types).toContain('remove');
    expect(types).toContain('add');
    // 首尾 equal
    expect(diff[0].type).toBe('equal');
    expect(diff[0].content).toBe('a');
    expect(diff[diff.length - 1].type).toBe('equal');
    expect(diff[diff.length - 1].content).toBe('c');
  });

  it('新增行', () => {
    const diff = textDiff('a\nc', 'a\nb\nc');
    const addedLines = diff.filter((l) => l.type === 'add');
    expect(addedLines.length).toBe(1);
    expect(addedLines[0].content).toBe('b');
  });

  it('删除行', () => {
    const diff = textDiff('a\nb\nc', 'a\nc');
    const removedLines = diff.filter((l) => l.type === 'remove');
    expect(removedLines.length).toBe(1);
    expect(removedLines[0].content).toBe('b');
  });

  it('空文本到非空文本', () => {
    const diff = textDiff('', 'hello\nworld');
    // 原文 '' 和新文 'hello\nworld' 不同
    const addedLines = diff.filter((l) => l.type === 'add');
    expect(addedLines.length).toBeGreaterThanOrEqual(1);
  });

  it('完全空文本返回空数组', () => {
    const diff = textDiff('', '');
    expect(diff).toEqual([]);
  });

  it('行号标注正确', () => {
    const diff = textDiff('line1\nline2\nline3', 'line1\nnew2\nline3');
    const equal1 = diff.find((l) => l.content === 'line1');
    expect(equal1?.oldLineNo).toBe(0);
    expect(equal1?.newLineNo).toBe(0);

    const removed = diff.find((l) => l.type === 'remove');
    expect(removed?.content).toBe('line2');
    expect(removed?.oldLineNo).toBe(1);
    expect(removed?.newLineNo).toBe(-1);

    const added = diff.find((l) => l.type === 'add');
    expect(added?.content).toBe('new2');
    expect(added?.oldLineNo).toBe(-1);
    expect(added?.newLineNo).toBe(1);
  });

  it('多行替换', () => {
    const oldText = 'a\nb\nc\nd';
    const newText = 'a\nx\ny\nd';
    const diff = textDiff(oldText, newText);
    const stats = diffStats(diff);
    expect(stats.unchanged).toBe(2); // a, d
    expect(stats.removed).toBe(2); // b, c
    expect(stats.added).toBe(2); // x, y
  });
});

describe('diffStats', () => {
  it('统计全 equal 的 diff', () => {
    const lines: DiffLine[] = [
      { type: 'equal', content: 'a', oldLineNo: 0, newLineNo: 0 },
      { type: 'equal', content: 'b', oldLineNo: 1, newLineNo: 1 },
    ];
    const stats = diffStats(lines);
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
    expect(stats.unchanged).toBe(2);
  });

  it('统计混合 diff', () => {
    const lines: DiffLine[] = [
      { type: 'equal', content: 'a', oldLineNo: 0, newLineNo: 0 },
      { type: 'remove', content: 'b', oldLineNo: 1, newLineNo: -1 },
      { type: 'add', content: 'x', oldLineNo: -1, newLineNo: 1 },
      { type: 'equal', content: 'c', oldLineNo: 2, newLineNo: 2 },
    ];
    const stats = diffStats(lines);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
    expect(stats.unchanged).toBe(2);
  });

  it('空数组返回全 0', () => {
    const stats = diffStats([]);
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
    expect(stats.unchanged).toBe(0);
  });
});
