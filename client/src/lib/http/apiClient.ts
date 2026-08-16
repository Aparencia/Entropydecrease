import { supabase } from '../auth/supabaseClient';
import { requireGatewayUrl } from '../ai/config';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface RequestOptions extends RequestInit {
  timeout?: number;
}

/**
 * 共享的 token 刷新 Promise —— 并发请求同时命中 401 时只触发一次 refreshSession。
 * 否则多次并发刷新会因 Supabase 的 refresh token 轮换而互相失效，
 * 让本来有效的会话被误判为过期，从而偶发地强制用户重新登录。
 *
 * @ai-context: 日志/错误前缀统一为 [EntropyDecrease]。VITE_API_BASE_URL
 * 由环境文件注入，代码内零硬编码。
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

/**
 * 429 配额耗尽 → 全局事件（渲染进程直连网关路径的统一感知点）。
 *
 * 仅配额类 429 触发（服务端文案含「已达上限」）；上游服务商 429 为
 * 临时故障不应打扰用户。QuotaNotice 组件监听本事件弹非阻断提示并刷新配额。
 */
function notifyQuotaExhausted(detail: string) {
  if (!/已达上限/.test(detail)) return;
  window.dispatchEvent(new CustomEvent('kb:ai-quota-exhausted', { detail }));
}

function createClient(baseUrlOrGetter: string | (() => string)) {
  const resolveUrl = typeof baseUrlOrGetter === 'function' ? baseUrlOrGetter : () => baseUrlOrGetter;

  async function request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { timeout = 60000, headers: customHeaders, ...rest } = options;
    const baseUrl = resolveUrl();

    if (!baseUrl) {
      throw new Error('[EntropyDecrease] API base URL not configured. Please set VITE_API_BASE_URL in .env');
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = new Headers(customHeaders as HeadersInit);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    // multipart（FormData body）不设 Content-Type，由浏览器自动生成 boundary；
    // 其余请求统一 JSON
    const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
    if (!isFormData) headers.set('Content-Type', 'application/json');

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
          // 仅当 Supabase 存在会话（云端模式）才判定登录过期；本地优先/未登录
          // 用户无会话时，网关 401（凭证缺失/失效）只抛普通错误，不踢登录
          const { data: { session: current } } = await supabase.auth.getSession();
          if (current) {
            window.dispatchEvent(new CustomEvent('kb:session-expired'));
          }
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
        if (retryResponse.status === 429) {
          const detail = await retryResponse.text().catch(() => '');
          notifyQuotaExhausted(detail);
          throw new Error(`HTTP 429${detail ? `: ${detail}` : ''}`);
        }
        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`);
        }
        const retryGwReqId = retryResponse.headers.get('ai-gateway-request-id');
        if (retryGwReqId) console.debug(`[ai-gateway] request-id: ${retryGwReqId}`);
        return retryResponse.json() as Promise<T>;
      }

      // 429 配额耗尽：读取响应体判断（避免把上游服务商限流误报为用户配额耗尽）
      if (response.status === 429) {
        const detail = await response.text().catch(() => '');
        notifyQuotaExhausted(detail);
        throw new Error(`HTTP 429${detail ? `: ${detail}` : ''}`);
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
    post: <T = unknown>(url: string, body?: unknown, options?: RequestOptions) => {
      // FormData body 直接透传（multipart 上传），其余 JSON 序列化
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      return request<T>(url, {
        method: 'POST',
        body: isFormData ? body : JSON.stringify(body),
        ...options,
      });
    },
    put: <T = unknown>(url: string, body?: unknown) =>
      request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
    delete: <T = unknown>(url: string) => request<T>(url, { method: 'DELETE' }),

    /**
     * 流式 POST 请求：解析 SSE data: 行，逐 chunk yield 文本
     * 复用现有 auth token 注入逻辑
     */
    postStream: async function* (url: string, body?: unknown): AsyncGenerator<string, void, unknown> {
      const baseUrl = resolveUrl();
      if (!baseUrl) {
        throw new Error('[EntropyDecrease] API base URL not configured');
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('Content-Type', 'application/json');

      const requestId = crypto.randomUUID();
      headers.set('X-Request-ID', requestId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}${url}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // 401 → 尝试刷新 token 并重试一次
      if (response.status === 401) {
        const { data: { session: refreshed }, error: refreshError } = await refreshSessionShared();
        if (refreshError || !refreshed?.access_token) {
          // 同上：无 Supabase 会话时网关 401 不触发登录过期（本地模式）
          const { data: { session: current } } = await supabase.auth.getSession();
          if (current) {
            window.dispatchEvent(new CustomEvent('kb:session-expired'));
          }
          throw new Error('HTTP 401: 登录已过期');
        }
        headers.set('Authorization', `Bearer ${refreshed.access_token}`);
        response = await fetch(`${baseUrl}${url}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      }

      if (response.status === 429) {
        const detail = await response.text().catch(() => '');
        notifyQuotaExhausted(detail);
        throw new Error(`HTTP 429${detail ? `: ${detail}` : ''}`);
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('Response body is null');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            for (const line of event.split('\n')) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') return;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.error) throw new Error(parsed.error);
                  if (parsed.chunk) yield parsed.chunk;
                } catch {
                  if (data && data !== '[DONE]') yield data;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
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
