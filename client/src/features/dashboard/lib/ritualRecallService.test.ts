/**
 * ritualRecallService 测试 / Tests for the recall question service
 *
 * @ai-context: 覆盖 T-B1-02——成功返回、后端降级/空问题回退 null、请求失败
 * 回退 null、离线回退 null、空输入回退 null。aiClient 与 fallback 缓存全 mock。
 * @ai-context: Covers success, degraded/empty fallback, error, offline, and
 * empty-input fallback. aiClient and fallback cache fully mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  resolveFallback: vi.fn(),
  cacheFallback: vi.fn(),
}));

vi.mock('@/lib/http/apiClient', () => ({
  aiClient: { post: mocks.post },
}));

vi.mock('@/lib/ai/aiFallbackManager', () => ({
  FallbackLevel: { CACHE_HIT: 'CACHE_HIT', FRIENDLY_PROMPT: 'FRIENDLY_PROMPT', FEATURE_HIDDEN: 'FEATURE_HIDDEN' },
  resolveFallback: mocks.resolveFallback,
  cacheFallback: mocks.cacheFallback,
}));

import { fetchRecallQuestion } from './ritualRecallService';

beforeEach(() => {
  vi.clearAllMocks();
  // 默认：缓存未命中 + 在线
  mocks.resolveFallback.mockReturnValue({ level: 'FRIENDLY_PROMPT', message: '', cached: false });
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRecallQuestion', () => {
  it('should return question on success and cache it', async () => {
    mocks.post.mockResolvedValueOnce({ question: '光反应在哪里？', reference: '类囊体膜', status: 'success' });

    const result = await fetchRecallQuestion('note-1', '光合作用', '光反应在类囊体膜');

    expect(result).toEqual({ question: '光反应在哪里？', reference: '类囊体膜' });
    expect(mocks.cacheFallback).toHaveBeenCalled();
  });

  it('should return null when backend degraded', async () => {
    mocks.post.mockResolvedValueOnce({ question: '', reference: '', status: 'degraded' });
    expect(await fetchRecallQuestion('note-1', 't', 'content')).toBeNull();
  });

  it('should return null when question is empty despite success', async () => {
    mocks.post.mockResolvedValueOnce({ question: '   ', reference: '', status: 'success' });
    expect(await fetchRecallQuestion('note-1', 't', 'content')).toBeNull();
  });

  it('should return null on request failure (timeout/network)', async () => {
    mocks.post.mockRejectedValueOnce(new Error('timeout'));
    expect(await fetchRecallQuestion('note-1', 't', 'content')).toBeNull();
  });

  it('should return cached result without requesting', async () => {
    mocks.resolveFallback.mockReturnValueOnce({
      level: 'CACHE_HIT', data: { question: 'cached?', reference: 'ref' }, cached: true,
    });
    const result = await fetchRecallQuestion('note-1', 't', 'content');
    expect(result).toEqual({ question: 'cached?', reference: 'ref' });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('should return null and skip request when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(await fetchRecallQuestion('note-1', 't', 'content')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('should return null for empty input', async () => {
    expect(await fetchRecallQuestion('', 't', 'content')).toBeNull();
    expect(await fetchRecallQuestion('note-1', 't', '   ')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
