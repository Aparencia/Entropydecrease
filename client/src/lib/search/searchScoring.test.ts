/**
 * 搜索评分纯函数单元测试
 * Unit tests for search scoring pure functions
 *
 * @ai-context: 覆盖 extractPlainText（TipTap JSON 提取/图片节点跳过/非 JSON
 * 直通）、computeIDF（稀有词高分、高频词趋零、单调递减）与 buildSnippet
 * （无命中截断/命中定位上下文/大小写不敏感/前缀后缀省略号）。
 * @ai-context: Covers extractPlainText (TipTap walk / image skip / raw
 * passthrough), computeIDF (rare-term high score, monotonic decrease)
 * and buildSnippet (no-hit truncation, hit centering, case-insensitivity,
 * ellipsis markers).
 */
import { describe, it, expect } from 'vitest';
import {
  extractPlainText,
  computeIDF,
  buildSnippet,
  BM25_K1,
  BM25_B,
  ENTITY_LENGTH_WEIGHT,
} from './searchScoring';

describe('constants', () => {
  it('should expose BM25 parameters and entity length weights', () => {
    expect(BM25_K1).toBe(1.5);
    expect(BM25_B).toBe(0.75);
    expect(ENTITY_LENGTH_WEIGHT).toMatchObject({
      note: 1.0,
      flashcard: 0.6,
      feynman: 1.2,
      inspiration: 0.7,
      classroom: 1.3,
    });
  });
});

describe('extractPlainText', () => {
  it('should pass plain text through unchanged', () => {
    expect(extractPlainText('hello world')).toBe('hello world');
    expect(extractPlainText('<p>raw html</p>')).toBe('<p>raw html</p>');
  });

  it('should join text nodes from a TipTap doc', () => {
    // Arrange
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'text', text: '第一段' },
        { type: 'text', text: '第二段' },
      ],
    });
    // Act/Assert
    expect(extractPlainText(content)).toBe('第一段 第二段');
  });

  it('should recurse into nested blocks', () => {
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '嵌套文本' }] },
      ],
    });
    expect(extractPlainText(content)).toBe('嵌套文本');
  });

  it('should skip image nodes so base64 src never leaks', () => {
    // Arrange：图片节点带 base64 src，文本节点紧随其后
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } },
        { type: 'text', text: '仅此文本' },
      ],
    });
    // Act/Assert
    expect(extractPlainText(content)).toBe('仅此文本');
    expect(extractPlainText(content)).not.toContain('base64');
  });

  it('should fall back to raw content for invalid JSON', () => {
    expect(extractPlainText('{broken')).toBe('{broken');
  });
});

describe('computeIDF', () => {
  it('should give rare terms a high score', () => {
    expect(computeIDF(100, 1)).toBeGreaterThan(3);
  });

  it('should approach zero for terms in every document', () => {
    const idf = computeIDF(100, 100);
    expect(idf).toBeGreaterThan(0);
    expect(idf).toBeLessThan(0.01);
  });

  it('should decrease monotonically as doc frequency rises', () => {
    // Act
    const idf1 = computeIDF(100, 10);
    const idf2 = computeIDF(100, 50);
    const idf3 = computeIDF(100, 90);
    // Assert：文档频率越高，IDF 越低
    expect(idf1).toBeGreaterThan(idf2);
    expect(idf2).toBeGreaterThan(idf3);
  });
});

describe('buildSnippet', () => {
  it('should return empty for empty content', () => {
    expect(buildSnippet('', ['x'])).toBe('');
  });

  it('should return a truncated head when no token matches', () => {
    const long = 'a'.repeat(200);
    const snippet = buildSnippet(long, ['zzz']);
    expect(snippet).toHaveLength(123); // 120 + '...'
    expect(snippet.endsWith('...')).toBe(true);

    const short = 'short text';
    expect(buildSnippet(short, ['zzz'])).toBe(short);
  });

  it('should center the snippet on the first matching token', () => {
    // Arrange：目标 token 出现在中间
    const content = '0'.repeat(40) + 'needle' + '1'.repeat(100);
    // Act
    const snippet = buildSnippet(content, ['needle']);
    // Assert：命中位置被包含，两侧带省略号
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('...')).toBe(true);
    expect(snippet.endsWith('...')).toBe(true);
  });

  it('should match tokens case-insensitively', () => {
    expect(buildSnippet('The Quick Brown Fox', ['quick'])).toContain('Quick');
  });

  it('should pick the earliest occurrence among multiple tokens', () => {
    // Arrange：'a' 在开头、'zz' 在 100 字符之外（超出 90 字符截取窗口）
    const content = `a${'x'.repeat(100)}zz`;
    // Act
    const snippet = buildSnippet(content, ['zz', 'a']);
    // Assert：以最早的 'a' 为锚点，尾部截断，不包含后面的 'zz'
    expect(snippet.startsWith('a')).toBe(true);
    expect(snippet.endsWith('...')).toBe(true);
    expect(snippet).not.toContain('zz');
  });
});
