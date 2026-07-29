/**
 * AI 网关健康检测 — 缓存与预检层（非 React）
 *
 * @ai-context: 从 useAIGatewayHealth 拆出。模块级缓存跨组件共享，
 * TTL 按状态分级（online 2min / degraded 1min / offline 5min，离线拉长
 * 避免反复 fetch 产生控制台噪音）；requestId 递增做竞态保护，仅最新
 * 请求可写缓存。/health/quick 为轻量端点（2s 超时），完整 /health
 * 检测在 Hook 侧（8s）。
 * @ai-context: classifyHealthError 按 fetch 错误消息启发式分类
 * （timeout/connection_refused/cors/dns），预检与 Hook 两侧共用。
 */
import { useSettingsStore } from '@/stores/useSettingsStore';

/** AI 网关健康状态 */
export type GatewayHealthStatus = 'online' | 'offline' | 'checking' | 'degraded';

/** 健康检测错误类型 */
export type HealthErrorType = 'timeout' | 'connection_refused' | 'cors_error' | 'server_error' | 'network_disconnected' | 'dns_error' | 'unknown';

/** Provider 状态信息 */
export interface ProviderStatus {
  status: string;
  latency_ms: number;
  error?: string;
}

/** 健康检测结果 */
export interface HealthResult {
  status: GatewayHealthStatus;
  /** 响应延迟（毫秒），仅在 online/degraded 时有值 */
  latency?: number;
  /** 网关版本号，仅在 online/degraded 时有值 */
  version?: string;
  /** 错误类型，仅在 offline 时可能有值 */
  errorType?: HealthErrorType;
  /** 各 Provider 状态详情 */
  providers?: Record<string, ProviderStatus>;
  /** 健康 Provider 数量 */
  healthyCount?: number;
  /** Provider 总数 */
  totalCount?: number;
}

/** 检测超时时间（毫秒）—— quick 端点轻量检测，2s 足够 */
export const HEALTH_CHECK_TIMEOUT = 2000;

/** 完整健康检测超时（毫秒）—— /health 端点需要 ping 各 Provider，预留更长时间 */
export const FULL_HEALTH_CHECK_TIMEOUT = 8000;

/** 自动检测间隔（毫秒） */
export const AUTO_CHECK_INTERVAL = 30_000;

// ── 模块级缓存（跨组件共享） ──
let cachedResult: HealthResult | null = null;
let cachedTimestamp = 0;
let requestId = 0; // 竞态条件保护：仅最新请求写入缓存
const CACHE_TTL_ONLINE = 2 * 60_000;    // 在线时 2 分钟内视为有效
const CACHE_TTL_DEGRADED = 60_000;      // 降级时 1 分钟内视为有效
const CACHE_TTL_OFFLINE = 5 * 60_000;   // 离线时 5 分钟内视为有效，避免反复 fetch 产生控制台噪音

function getCacheTTL(): number {
  if (cachedResult?.status === 'online') return CACHE_TTL_ONLINE;
  if (cachedResult?.status === 'degraded') return CACHE_TTL_DEGRADED;
  return CACHE_TTL_OFFLINE;
}

/** 读取缓存结果（TTL 内有效，否则 null） */
export function readHealthCache(): HealthResult | null {
  if (cachedResult && Date.now() - cachedTimestamp < getCacheTTL()) {
    return cachedResult;
  }
  return null;
}

/** 写入缓存（供 Hook 侧同步状态） */
export function writeHealthCache(result: HealthResult): void {
  cachedResult = result;
  cachedTimestamp = Date.now();
}

/** 获取当前缓存的网关健康状态（同步，无副作用） */
export function getCachedGatewayStatus(): GatewayHealthStatus | null {
  return readHealthCache()?.status ?? null;
}

/**
 * 按 fetch 错误分类健康检测错误类型（预检与 Hook 共用）
 */
export function classifyHealthError(err: unknown): HealthErrorType {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'timeout';
  }
  let errorType: HealthErrorType = 'unknown';
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
      // 在线状态下 Failed to fetch 大概率是 connection refused 或 CORS
      errorType = navigator.onLine ? 'connection_refused' : 'network_disconnected';
    } else if (msg.includes('cors') || msg.includes('cross-origin')) {
      errorType = 'cors_error';
    }
    // DNS 解析失败
    if (msg.includes('dns') || msg.includes('getaddrinfo') || msg.includes('name or service not known')) {
      errorType = 'dns_error';
    }
  }
  return errorType;
}

/** 供外部调用的预检测函数（不依赖 React 生命周期） */
export function precheckGatewayHealth(): void {
  if (readHealthCache()) return;

  // 网络断开时直接返回，不发起无意义的请求
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    writeHealthCache({ status: 'offline', errorType: 'network_disconnected' });
    return;
  }

  const url = useSettingsStore.getState().aiConfig.gatewayUrl?.trim();
  if (!url) {
    writeHealthCache({ status: 'offline' });
    return;
  }

  const currentRequestId = ++requestId;
  const start = performance.now();
  fetch(`${url}/health/quick`, {
    method: 'GET',
    signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
  })
    .then(async (res) => {
      if (currentRequestId !== requestId) return;
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        let version: string | undefined;
        let serverOk = false;
        try {
          const data = await res.json();
          version = data.version;
          // 验证服务端返回的 status 字段，而不仅仅依赖 HTTP 状态码
          serverOk = data.status === 'ok' || data.status === 'healthy';
        } catch {
          // 无法解析 JSON 但 HTTP 200，仍视为在线
          serverOk = true;
        }
        if (currentRequestId !== requestId) return;
        writeHealthCache(serverOk
          ? { status: 'online', latency, version }
          : { status: 'offline', errorType: 'server_error' });
      } else {
        writeHealthCache({ status: 'offline', errorType: 'server_error' });
      }
    })
    .catch((err) => {
      if (currentRequestId !== requestId) return;
      writeHealthCache({ status: 'offline', errorType: classifyHealthError(err) });
    });
}
