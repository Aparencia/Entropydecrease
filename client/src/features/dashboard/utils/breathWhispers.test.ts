/**
 * breathWhispers 单元测试 / Unit tests for exhale whispers
 *
 * @ai-context: 覆盖 pickWhisper 的循环取用与边界（负数/越界）。
 * @ai-context: Covers cyclic pick and boundary (negative / overflow).
 */
import { describe, it, expect } from 'vitest';
import { BREATH_WHISPERS, pickWhisper } from './breathWhispers';

describe('pickWhisper', () => {
  it('should return the whisper at the given index', () => {
    expect(pickWhisper(0)).toBe(BREATH_WHISPERS[0]);
    expect(pickWhisper(1)).toBe(BREATH_WHISPERS[1]);
  });

  it('should wrap around the corpus length', () => {
    expect(pickWhisper(BREATH_WHISPERS.length)).toBe(BREATH_WHISPERS[0]);
    expect(pickWhisper(BREATH_WHISPERS.length + 2)).toBe(BREATH_WHISPERS[2]);
  });

  it('should handle negative seeds via abs', () => {
    expect(pickWhisper(-1)).toBe(BREATH_WHISPERS[1]);
  });

  it('should always return a non-empty string', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickWhisper(i).length).toBeGreaterThan(0);
    }
  });
});
