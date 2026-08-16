/**
 * 多感官复习模式工具单元测试
 * Unit tests for multi-sensory review mode utilities
 *
 * @ai-context: 覆盖 loadReviewMode 的回退语义（缺失/损坏数据 → 阅读模式）、
 * saveReviewMode 持久化，以及 extractPlainText 的 HTML 剥离与 HTML 实体
 * 解码全分支。localStorage 由 jsdom 提供，测试间清理。
 * @ai-context: Covers loadReviewMode fallback semantics, saveReviewMode
 * persistence, and all extractPlainText HTML/entity handling branches.
 * localStorage comes from jsdom; cleared between tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadReviewMode,
  saveReviewMode,
  extractPlainText,
  REVIEW_MODES,
  REVIEW_MODE_LABELS,
} from './reviewMode';

describe('loadReviewMode / saveReviewMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to reading when nothing is stored', () => {
    expect(loadReviewMode()).toBe('reading');
  });

  it('should round-trip a saved mode', () => {
    // Arrange
    saveReviewMode('writing');
    // Act
    const loaded = loadReviewMode();
    // Assert
    expect(loaded).toBe('writing');
  });

  it('should fall back to reading for corrupt values', () => {
    // Arrange：写入非法值模拟损坏数据
    localStorage.setItem('ed_review_mode', 'not-a-mode');
    // Act/Assert
    expect(loadReviewMode()).toBe('reading');
  });

  it('should expose every valid mode with a label', () => {
    // Assert：模式枚举与标签表一致
    expect(REVIEW_MODES).toHaveLength(5);
    for (const mode of REVIEW_MODES) {
      expect(REVIEW_MODE_LABELS[mode]).toBeTruthy();
    }
  });
});

describe('extractPlainText', () => {
  it('should return empty string for empty input', () => {
    expect(extractPlainText('')).toBe('');
    expect(extractPlainText(undefined as unknown as string)).toBe('');
  });

  it('should strip HTML tags', () => {
    expect(extractPlainText('<p>Hello</p>')).toBe('Hello');
    expect(extractPlainText('<div>a</div><div>b</div>')).toBe('a b');
    expect(extractPlainText('<strong>bold</strong> <em>italic</em>')).toBe('bold italic');
  });

  it('should decode common HTML entities', () => {
    expect(extractPlainText('a&nbsp;b')).toBe('a b');
    expect(extractPlainText('a &amp; b')).toBe('a & b');
    expect(extractPlainText('&lt;tag&gt;')).toBe('<tag>');
    expect(extractPlainText('&quot;quoted&quot;')).toBe('"quoted"');
    expect(extractPlainText('&#39;it&#39;s&#39;')).toBe("'it's'");
  });

  it('should collapse whitespace and trim', () => {
    expect(extractPlainText('  multi   space\n newline  ')).toBe('multi space newline');
    expect(extractPlainText('<p>  padded  </p>')).toBe('padded');
  });
});
