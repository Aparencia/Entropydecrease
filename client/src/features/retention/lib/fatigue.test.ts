/**
 * 疲劳共情规则单元测试
 * Unit tests for fatigue empathy rules
 */
import { describe, it, expect } from 'vitest';
import {
  shouldSuggestSurfacing,
  wasRealBreak,
  SURFACE_SUGGESTION_THRESHOLD,
  REAL_BREAK_RATIO,
} from './fatigue';

describe('shouldSuggestSurfacing', () => {
  it('should suggest after threshold consecutive work sessions', () => {
    expect(shouldSuggestSurfacing(SURFACE_SUGGESTION_THRESHOLD)).toBe(true);
    expect(shouldSuggestSurfacing(SURFACE_SUGGESTION_THRESHOLD + 3)).toBe(true);
  });

  it('should stay silent below threshold (觉察不唠叨)', () => {
    expect(shouldSuggestSurfacing(0)).toBe(false);
    expect(shouldSuggestSurfacing(SURFACE_SUGGESTION_THRESHOLD - 1)).toBe(false);
  });
});

describe('wasRealBreak', () => {
  it('should accept rest reaching the ratio of planned duration', () => {
    // 计划 5 分钟休息，停留 60% 即算真休息
    const planned = 300;
    expect(wasRealBreak(planned * 1000 * REAL_BREAK_RATIO, planned)).toBe(true);
    expect(wasRealBreak(planned * 1000, planned)).toBe(true);
  });

  it('should reject skipped/shortened breaks', () => {
    const planned = 300;
    expect(wasRealBreak(planned * 1000 * (REAL_BREAK_RATIO - 0.1), planned)).toBe(false);
    expect(wasRealBreak(0, planned)).toBe(false);
  });

  it('should guard invalid planned duration', () => {
    expect(wasRealBreak(999999, 0)).toBe(false);
    expect(wasRealBreak(999999, -5)).toBe(false);
  });
});
