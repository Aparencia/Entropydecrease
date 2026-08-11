/**
 * Content tier store unit tests
 * B3 (N5): core-layer persistence bridging tiering to card generation
 * @ai-context 核心层缓存测试：7 天 TTL、静默降级、清除；jsdom 下直接用
 * localStorage 验证读写闭环。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { saveCoreTier, getCoreTier, clearCoreTier } from './contentTierStore';

const NOTE_ID = 'note-1';

beforeEach(() => {
  localStorage.clear();
});

describe('saveCoreTier / getCoreTier', () => {
  it('should persist core text and read it back fresh', () => {
    saveCoreTier(NOTE_ID, '核心概念一\n核心概念二');
    expect(getCoreTier(NOTE_ID)).toBe('核心概念一\n核心概念二');
  });

  it('should trim stored text', () => {
    saveCoreTier(NOTE_ID, '  核心文本  ');
    expect(getCoreTier(NOTE_ID)).toBe('核心文本');
  });

  it('should ignore empty noteId or blank text', () => {
    saveCoreTier('', '核心');
    saveCoreTier(NOTE_ID, '   ');
    expect(getCoreTier('')).toBeNull();
    expect(getCoreTier(NOTE_ID)).toBeNull();
  });

  it('should return null when no cache exists', () => {
    expect(getCoreTier(NOTE_ID)).toBeNull();
    expect(getCoreTier(null)).toBeNull();
  });

  it('should return null for expired cache (older than 7 days)', () => {
    // 直接写入 8 天前的缓存，模拟过期
    const expired = {
      coreText: '过期核心',
      savedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };
    localStorage.setItem(`kb-core-tier:${NOTE_ID}`, JSON.stringify(expired));
    expect(getCoreTier(NOTE_ID)).toBeNull();
  });

  it('should return null for corrupted cache payload', () => {
    localStorage.setItem(`kb-core-tier:${NOTE_ID}`, '{not-json');
    expect(getCoreTier(NOTE_ID)).toBeNull();
    // localStorage 抛错（隐私模式）也应静默返回 null
    localStorage.setItem(`kb-core-tier:${NOTE_ID}`, '{"coreText":""}');
    expect(getCoreTier(NOTE_ID)).toBeNull();
  });

  it('should clear cache on demand', () => {
    saveCoreTier(NOTE_ID, '核心');
    clearCoreTier(NOTE_ID);
    expect(getCoreTier(NOTE_ID)).toBeNull();
  });
});
