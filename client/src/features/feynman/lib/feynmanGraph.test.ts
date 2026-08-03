/**
 * feynmanGraph 单元测试
 *
 * @ai-context: E3 跨费曼会话概念网络的测试：分词、Jaccard 相似度、
 * 阈值连边与 dagre 布局投影行为。
 */
import { describe, it, expect } from 'vitest';
import {
  tokenize, jaccard, layoutFeynmanGraph, SIMILARITY_THRESHOLD,
} from './feynmanGraph';

describe('tokenize', () => {
  it('应提取 ASCII 词并转小写', () => {
    const tokens = tokenize('Entropy Decrease 123');
    expect(tokens.has('entropy')).toBe(true);
    expect(tokens.has('decrease')).toBe(true);
    expect(tokens.has('123')).toBe(true);
  });

  it('应为中文生成 bigram', () => {
    const tokens = tokenize('热力学');
    expect(tokens.has('热力')).toBe(true);
    expect(tokens.has('力学')).toBe(true);
  });

  it('空文本应返回空集合', () => {
    expect(tokenize('').size).toBe(0);
  });
});

describe('jaccard', () => {
  it('相同集合应返回 1', () => {
    const s = new Set(['a', 'b']);
    expect(jaccard(s, s)).toBe(1);
  });

  it('不相交集合应返回 0', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('任一集合为空应返回 0', () => {
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });

  it('部分重叠应返回正确比值', () => {
    // {a,b} ∩ {b,c} = {b}，并集 3 → 1/3
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
  });
});

describe('layoutFeynmanGraph', () => {
  it('空输入应返回空图', () => {
    const { nodes, edges } = layoutFeynmanGraph([]);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it('相似概念应连边，无关概念不应连边', () => {
    const notes = [
      { id: 'n1', concept: '热力学第二定律', explanation: '熵增原理描述孤立系统无序度增加' },
      { id: 'n2', concept: '熵与热力学', explanation: '热力学中的熵是系统无序度的度量' },
      { id: 'n3', concept: 'JavaScript 闭包', explanation: 'closure captures lexical scope' },
    ];
    const { nodes, edges } = layoutFeynmanGraph(notes);
    expect(nodes).toHaveLength(3);
    expect(edges.some((e) =>
      (e.source === 'n1' && e.target === 'n2') || (e.source === 'n2' && e.target === 'n1'),
    )).toBe(true);
    expect(edges.some((e) => e.source === 'n3' || e.target === 'n3')).toBe(false);
  });

  it('阈值应为正值且小于 1', () => {
    expect(SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(SIMILARITY_THRESHOLD).toBeLessThan(1);
  });

  it('节点应带 feynmanGraph 类型与概念标签', () => {
    const { nodes } = layoutFeynmanGraph([
      { id: 'n1', concept: '浮力', explanation: '阿基米德原理' },
    ]);
    expect(nodes[0].type).toBe('feynmanGraph');
    expect(nodes[0].data.label).toBe('浮力');
  });
});
