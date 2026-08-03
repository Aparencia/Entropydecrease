/**
 * 文本切块纯函数单元测试
 * Unit tests for textChunker
 */
import { describe, it, expect } from 'vitest';
import { chunkText, MAX_CHUNK_CHARS } from './textChunker';

describe('chunkText', () => {
  it('should return empty array for empty input', () => {
    // Arrange & Act
    const result = chunkText('');

    // Assert
    expect(result).toEqual([]);
  });

  it('should return empty array for whitespace-only input', () => {
    expect(chunkText('   \n  \t ')).toEqual([]);
  });

  it('should return single chunk for short text', () => {
    // Arrange
    const text = '这是一个短文本，不需要切块。';

    // Act
    const result = chunkText(text);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text);
    expect(result[0].index).toBe(0);
  });

  it('should keep every chunk within the cap for long text with paragraphs', () => {
    // Arrange：构造多个段落，合计远超上限
    const paragraph = '这是第 %d 段。'.replace('%d', '');
    const longParagraph = `${paragraph}${'测试内容反复填充，用于拉长段落长度。'.repeat(80)}`;
    const text = [longParagraph, longParagraph, longParagraph].join('\n\n');

    // Act
    const result = chunkText(text);

    // Assert：每块不超限、index 连续、内容非空
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
    expect(result.map((c) => c.index)).toEqual(result.map((_, i) => i));
  });

  it('should merge adjacent paragraphs when combined size permits', () => {
    // Arrange：两段小段落，合并后仍低于上限
    const text = '第一段内容。\n\n第二段内容。';

    // Act
    const result = chunkText(text);

    // Assert：合并为单块，段落分隔保留
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('\n\n');
  });

  it('should hard split a single oversized paragraph without exceeding cap', () => {
    // Arrange：无空行分隔的超长文本
    const text = '甲'.repeat(MAX_CHUNK_CHARS * 2 + 100);

    // Act
    const result = chunkText(text);

    // Assert
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
  });

  it('should prefer sentence boundaries when hard splitting', () => {
    // Arrange：无段落、无句子边界的长文本 vs 有句号的长文本
    const noBoundary = '字'.repeat(MAX_CHUNK_CHARS + 50);
    const withBoundary = `${'句子内容。'.repeat(Math.ceil(MAX_CHUNK_CHARS / 5) + 5)}`;

    // Act
    const noBoundaryResult = chunkText(noBoundary);
    const withBoundaryResult = chunkText(withBoundary);

    // Assert：有句号时中间块应以句号收尾；无句号时硬切也能复原
    const middle = withBoundaryResult[0];
    expect(middle.text.endsWith('。')).toBe(true);
    expect(noBoundaryResult.map((c) => c.text).join('')).toBe(noBoundary);
    expect(withBoundaryResult.map((c) => c.text).join('')).toBe(withBoundary);
  });

  it('should preserve total content across chunks (lossless concatenation)', () => {
    // Arrange
    const paragraph = `概念详解：${'内容填充。'.repeat(100)}`;
    const text = Array.from({ length: 5 }, (_, i) => `第 ${i + 1} 节。${paragraph}`).join('\n\n');

    // Act
    const result = chunkText(text);
    const rebuilt = result.map((c) => c.text).join('');

    // Assert：去除空白差异后与原文一致（切块仅重排不删字）
    const stripWs = (s: string) => s.replace(/\s+/g, '');
    expect(stripWs(rebuilt)).toBe(stripWs(text));
  });
});
