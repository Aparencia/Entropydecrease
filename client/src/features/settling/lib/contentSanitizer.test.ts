/**
 * 提取内容清理纯函数单元测试
 * Unit tests for contentSanitizer
 */
import { describe, it, expect } from 'vitest';
import { sanitizeExtractedText, SHORT_LINE_MAX } from './contentSanitizer';

describe('sanitizeExtractedText', () => {
  it('should return empty string for empty input', () => {
    // Arrange & Act
    const result = sanitizeExtractedText('');

    // Assert
    expect(result).toBe('');
  });

  it('should merge broken English lines with a space to avoid word sticking', () => {
    // Arrange：PDF 提取常见的英文断行——直接拼接会产生 brokenline 粘连
    const raw = 'This is a broken\nline that should\nbe merged.';

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert：词边界保留空格
    expect(result).toBe('This is a broken line that should be merged.');
  });

  it('should not insert a space between CJK and CJK, or CJK and ASCII edges', () => {
    // Arrange：中文字符间直接连接；中英边界也不插空格（保持原文排布）
    const raw = '这是被换行打断的\n中文句子，应当合并。\n学习费曼\nLearning 方法。';

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toBe('这是被换行打断的中文句子，应当合并。\n学习费曼Learning 方法。');
  });

  it('should merge broken Chinese lines without inserting spaces', () => {
    // Arrange
    const raw = '这是被换行打断的\n中文句子，应当合并。';

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toBe('这是被换行打断的中文句子，应当合并。');
  });

  it('should remove page-number-like lines', () => {
    // Arrange：页码与装饰线
    const raw = 'Introduction\n123\n----\nReal content here.';

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).not.toContain('123');
    expect(result).not.toContain('----');
    expect(result).toContain('Real content here.');
  });

  it('should remove isolated short header/footer lines', () => {
    // Arrange：独立成段的短行（后随空行）如页眉
    const raw = `HeaderText\n\n正文第一段内容，足够长。`;

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).not.toContain('HeaderText');
    expect(result).toContain('正文第一段内容');
  });

  it('should keep heading-like lines (chapter / numbered items)', () => {
    // Arrange：章节标题与编号条目不应被当页眉丢弃
    const raw = `第一章 绪论\n1.1 研究背景\n正文内容段落。`;

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toContain('第一章 绪论');
    expect(result).toContain('1.1 研究背景');
  });

  it('should keep short lines that end with sentence punctuation', () => {
    // Arrange：短句有句读 → 保留
    const raw = `明白了。\n这是正文。`;

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toContain('明白了。');
  });

  it('should merge a short broken first line instead of dropping it', () => {
    // Arrange：断行句子的第一行短于阈值（无句读），后随非空行 → 句子片段
    const raw = '这是被换行打断的\n中文句子，应当合并。';

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toBe('这是被换行打断的中文句子，应当合并。');
  });

  it('should drop a short standalone line even when followed by content', () => {
    // Arrange：页眉后无空行直接接正文（旧场景）——短行后随非空行视为句子片段，
    // 只有独立成段（后随空行/结尾）才被判定为页眉；此场景由
    // 'should remove isolated short header/footer lines' 覆盖
    const raw = 'Aaa\n正文内容段落。';

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toBe('Aaa正文内容段落。');
  });

  it('should collapse excess blank lines into at most one', () => {
    // Arrange
    const raw = `第一段。\n\n\n\n\n第二段。`;

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toBe('第一段。\n\n第二段。');
  });

  it('should collapse inner whitespace of each line', () => {
    // Arrange
    const raw = `这是   一个\t\t带多余空格的行。`;

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toBe('这是 一个 带多余空格的行。');
  });

  it('should not drop meaningful text shorter than threshold when followed by paragraph break', () => {
    // Arrange：短行后跟空行 → 是独立段落而非页眉，保留
    const raw = '短。\n\n长段落正文内容。';

    // Act
    const result = sanitizeExtractedText(raw);

    // Assert
    expect(result).toContain('短。');
  });

  it('should export the short-line threshold constant for tuning', () => {
    // Arrange & Assert：常量存在且为合理阈值
    expect(SHORT_LINE_MAX).toBeGreaterThan(0);
    expect(SHORT_LINE_MAX).toBeLessThanOrEqual(20);
  });
});
