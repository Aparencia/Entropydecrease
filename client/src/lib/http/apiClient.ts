import { supabase } from '../auth/supabaseClient';
import { requireGatewayUrl } from '../ai/config';
import { getActiveUserKey } from '../ai/apiKeyManager';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface RequestOptions extends RequestInit {
  timeout?: number;
}

/**
 * 共享的 token 刷新 Promise —— 并发请求同时命中 401 时只触发一次 refreshSession。
 * 否则多次并发刷新会因 Supabase 的 refresh token 轮换而互相失效，
 * 让本来有效的会话被误判为过期，从而偶发地强制用户重新登录。
 */
let sharedRefresh: ReturnType<typeof supabase.auth.refreshSession> | null = null;
function refreshSessionShared() {
  if (!sharedRefresh) {
    sharedRefresh = supabase.auth.refreshSession().finally(() => {
      sharedRefresh = null;
    });
  }
  return sharedRefresh;
}

function createClient(baseUrlOrGetter: string | (() => string)) {
  const resolveUrl = typeof baseUrlOrGetter === 'function' ? baseUrlOrGetter : () => baseUrlOrGetter;

  async function request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { timeout = 60000, headers: customHeaders, ...rest } = options;
    const baseUrl = resolveUrl();

    if (!baseUrl) {
      throw new Error('[KeBan] API base URL not configured. Please set VITE_API_BASE_URL in .env');
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = new Headers(customHeaders as HeadersInit);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');

    // 用户自配置 API Key 时附加 X-User-API-Key header
    const userKey = getActiveUserKey();
    if (userKey) headers.set('X-User-API-Key', userKey);

    // 生成请求追踪 ID，便于 ai-gateway 端链路追踪
    const requestId = crypto.randomUUID();
    headers.set('X-Request-ID', requestId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...rest,
        headers,
        signal: controller.signal,
      });

      // 401 → 尝试刷新 token 并重试一次
      if (response.status === 401) {
        // 复用共享刷新，避免并发 401 触发多次刷新导致 token 轮换互相失效
        const { data: { session: refreshed }, error: refreshError } = await refreshSessionShared();

        // 仅当刷新本身失败（refresh token 真正过期/失效）才判定为登录过期
        if (refreshError || !refreshed?.access_token) {
          window.dispatchEvent(new CustomEvent('kb:session-expired'));
          throw new Error('HTTP 401: 登录已过期');
        }

        // 刷新成功 → 用最新 token 重试一次原请求
        headers.set('Authorization', `Bearer ${refreshed.access_token}`);
        const retryResponse = await fetch(`${baseUrl}${endpoint}`, {
          ...rest,
          headers,
          signal: controller.signal,
        });

        // 重试仍失败：会话有效但服务端因其他原因拒绝（权限 / 额度 / 网关 JWT 校验抖动等），
        // 不属于登录过期，不再派发 session-expired，交由调用方按普通错误处理
        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`);
        }
        const retryGwReqId = retryResponse.headers.get('ai-gateway-request-id');
        if (retryGwReqId) console.debug(`[ai-gateway] request-id: ${retryGwReqId}`);
        return retryResponse.json() as Promise<T>;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const gwReqId = response.headers.get('ai-gateway-request-id');
      if (gwReqId) console.debug(`[ai-gateway] request-id: ${gwReqId}`);
      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    get: <T = unknown>(url: string) => request<T>(url, { method: 'GET' }),
    post: <T = unknown>(url: string, body?: unknown) =>
      request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
    put: <T = unknown>(url: string, body?: unknown) =>
      request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
    delete: <T = unknown>(url: string) => request<T>(url, { method: 'DELETE' }),
  };
}

/** sync-service 客户端（:8080） */
export const apiClient = createClient(API_BASE_URL);

/** ai-gateway 客户端（URL 从 localStorage 配置动态读取） */
export const aiClient = createClient(() => {
  try {
    return requireGatewayUrl();
  } catch {
    return ''; // request() will throw a clear error
  }
});
