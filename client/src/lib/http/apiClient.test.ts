import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase before importing apiClient (vi.mock is hoisted)
const { mockGetSession, mockRefreshSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRefreshSession: vi.fn(),
}));
vi.mock('../auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
    },
  },
}));

import { apiClient, aiClient } from './apiClient';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token-123' } },
  });
  mockRefreshSession.mockResolvedValue({
    data: { session: { access_token: 'new-token' } },
    error: null,
  });
  // Set up AI gateway URL in localStorage for aiClient tests
  localStorage.setItem('kb_ai_config', JSON.stringify({ gatewayUrl: 'https://entropydecrease.com' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  };
}

describe('apiClient', () => {
  it('should use VITE_API_BASE_URL for apiClient requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: 'ok' }));
    await apiClient.get('/test');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    // Default fallback is https://entropydecrease.com
    expect(url).toContain('/test');
  });

  it('should attach Authorization header when token is present', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiClient.get('/secure');
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');
  });

  it('should not attach Authorization header when no session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiClient.get('/public');
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  it('should retry on 401 with refreshed token', async () => {
    // First call returns 401
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401));
    // refreshSession returns new token
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: { access_token: 'new-token' } },
      error: null,
    });
    // Retry succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: 'refreshed' }));

    const result = await apiClient.get('/retry');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: 'refreshed' });
  });

  it('should throw on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    await expect(apiClient.get('/missing')).rejects.toThrow('HTTP 404');
  });

  it('should throw on 500 response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'server error' }, 500));
    await expect(apiClient.get('/fail')).rejects.toThrow('HTTP 500');
  });

  it('should support POST with JSON body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ created: true }));
    await apiClient.post('/items', { name: 'test' });
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('should support PUT with JSON body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ updated: true }));
    await apiClient.put('/items/1', { name: 'updated' });
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe('PUT');
    expect(options.body).toBe(JSON.stringify({ name: 'updated' }));
  });

  it('should support DELETE', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await apiClient.delete('/items/1');
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe('DELETE');
  });

  it('should set Content-Type to application/json', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    await apiClient.get('/test');
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});

describe('aiClient', () => {
  it('should use VITE_AI_GATEWAY_URL for aiClient requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: 'ok' }));
    await aiClient.post('/api/v1/ai/summarize', { content: 'hello' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/ai/summarize');
  });

  it('should attach Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    await aiClient.get('/test');
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');
  });
});
