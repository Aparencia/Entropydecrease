/**
 * 笔记纯文本提取单元测试
 * Unit tests for note plain-text extraction
 *
 * @ai-context: 覆盖 extractNoteText 的三条路径：TipTap JSON 递归提取
 * （含嵌套块级节点）、合法 JSON 但非 TipTap 结构的剥标签回退、非 JSON
 * 内容（HTML/纯文本）的剥标签回退，以及空输入短路。
 * @ai-context: Covers the three extractNoteText paths: TipTap JSON walk,
 * non-TipTap JSON fallback and non-JSON HTML-strip fallback, plus the
 * empty-input short circuit.
 */
import { describe, it, expect } from 'vitest';
import { extractNoteText } from './extractNoteText';

describe('extractNoteText', () => {
  it('should return empty string for empty input', () => {
    expect(extractNoteText(null)).toBe('');
    expect(extractNoteText(undefined)).toBe('');
    expect(extractNoteText('')).toBe('');
  });

  it('should extract text from a flat TipTap JSON document', () => {
    // Arrange
    const content = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });
    // Act
    const text = extractNoteText(content);
    // Assert：块级节点后保留换行
    expect(text).toContain('Hello');
    expect(text).toContain('\n');
  });

  it('should preserve paragraph separation across blocks', () => {
    // Arrange：两个段落
    const content = JSON.stringify({
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '第一段' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段' }] },
      ],
    });
    // Act
    const text = extractNoteText(content);
    // Assert
    expect(text).toContain('第一段');
    expect(text).toContain('第二段');
    expect(text.indexOf('第一段')).toBeLessThan(text.indexOf('第二段'));
  });

  it('should handle nested node trees', () => {
    // Arrange：列表节点包裹文本
    const content = JSON.stringify({
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'text', text: 'item-1' }] },
          ],
        },
      ],
    });
    // Act
    const text = extractNoteText(content);
    // Assert
    expect(text).toContain('item-1');
  });

  it('should fall back to tag stripping for non-TipTap JSON', () => {
    // Arrange：合法 JSON 但非 TipTap 结构（纯字符串）
    expect(extractNoteText('"just a string"')).toBe('"just a string"');
  });

  it('should strip HTML tags for non-JSON content', () => {
    expect(extractNoteText('<div>Hi</div>')).toBe(' Hi ');
    expect(extractNoteText('<p>a</p><p>b</p>')).toBe(' a  b ');
  });

  it('should return empty walk for an empty content array', () => {
    expect(extractNoteText('{"content":[]}')).toBe('');
  });
});
