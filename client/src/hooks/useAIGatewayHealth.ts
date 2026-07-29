/**
 * AI 网关健康状态检测 hook
 *
 * 功能：
 * - 进入设置页面时自动检测一次
 * - 每 30 秒自动轮询（仅在页面可见时）
 * - 提供手动触发检测的方法
 *
 * @ai-context: 2026-07 拆分——缓存/预检/错误分类在 gatewayHealthCache
 * （非 React 层）；本 Hook 负责完整 /health 检测（8s 超时、AbortSignal.any
 * 组合取消）与轮询/online-offline 事件编排。挂载时有有效缓存则跳过首检。
 * @ai-context: checkHealth 内 AbortError 返回缓存兜底而非置 offline
 * （手动 recheck 取消旧请求时避免状态闪烁），是刻意行为。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import {
  readHealthCache, writeHealthCache, classifyHealthError,
  FULL_HEALTH_CHECK_TIMEOUT, AUTO_CHECK_INTERVAL,
  type HealthResult, type HealthErrorType,
} from './gatewayHealthCache';

export function useAIGatewayHealth() {
  const gatewayUrl = useSettingsStore((s) => s.aiConfig.gatewayUrl);

  // 从缓存初始化：有有效缓存则直接使用，否则为 checking
  const [result, setResult] = useState<HealthResult>(() => {
    return readHealthCache() ?? { status: 'checking' };
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  /** 执行一次健康检测 */
  const checkHealth = useCallback(async (): Promise<HealthResult> => {
    // 网络断开时直接返回，不发起无意义的请求
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offline: HealthResult = { status: 'offline', errorType: 'network_disconnected' };
      if (mountedRef.current) setResult(offline);
      return offline;
    }

    const url = gatewayUrl?.trim();
    if (!url) {
      const offline: HealthResult = { status: 'offline' };
      if (mountedRef.current) setResult(offline);
      return offline;
    }

    if (mountedRef.current) setResult({ status: 'checking' });

    // 取消上一次进行中的请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const start = performance.now();
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(FULL_HEALTH_CHECK_TIMEOUT)]),
      });

      const latency = Math.round(performance.now() - start);

      if (response.ok) {
        try {
          const data = await response.json();

          if (data.status === 'healthy' || data.status === 'degraded') {
            const ok: HealthResult = {
              status: data.status === 'healthy' ? 'online' : 'degraded',
              latency,
              version: data.version,
              providers: data.providers,
              healthyCount: data.healthy_count,
              totalCount: data.total_count,
            };
            if (mountedRef.current) setResult(ok);
            return ok;
          }
          // 未知状态，视为离线
          const offline: HealthResult = { status: 'offline', errorType: 'server_error' };
          if (mountedRef.current) setResult(offline);
          return offline;
        } catch {
          // 无法解析 JSON 但 HTTP 200，仍视为在线（降级处理）
          const online: HealthResult = { status: 'online', latency };
          if (mountedRef.current) setResult(online);
          return online;
        }
      } else {
        const offline: HealthResult = { status: 'offline', errorType: 'server_error' };
        if (mountedRef.current) setResult(offline);
        return offline;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return readHealthCache() ?? { status: 'offline', errorType: 'timeout' };
      }

      const errorType: HealthErrorType = classifyHealthError(err);
      const offline: HealthResult = { status: 'offline', errorType };
      if (mountedRef.current) setResult(offline);
      return offline;
    }
  }, [gatewayUrl]);

  /** 手动触发检测 */
  const recheck = useCallback(() => {
    void checkHealth();
  }, [checkHealth]);

  /** 挂载时检测：有有效缓存则跳过，仅启动轮询；无缓存则照常检测 */
  useEffect(() => {
    mountedRef.current = true;

    if (!readHealthCache()) {
      void checkHealth();
    }

    // 设置定时轮询
    intervalRef.current = setInterval(() => {
      void checkHealth();
    }, AUTO_CHECK_INTERVAL);

    // 网络恢复时立即重新检测
    const handleOnline = () => {
      void checkHealth();
    };
    // 网络断开时立即更新状态
    const handleOffline = () => {
      const offline: HealthResult = { status: 'offline', errorType: 'network_disconnected' };
      writeHealthCache(offline);
      if (mountedRef.current) setResult(offline);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [checkHealth]);

  return {
    /** 当前检测状态 */
    status: result.status,
    /** 响应延迟（毫秒） */
    latency: result.latency,
    /** 网关版本号 */
    version: result.version,
    /** 错误类型 */
    errorType: result.errorType,
    /** 各 Provider 状态详情 */
    providers: result.providers,
    /** 健康 Provider 数量 */
    healthyCount: result.healthyCount,
    /** Provider 总数 */
    totalCount: result.totalCount,
    /** 手动触发重新检测 */
    recheck,
  };
}

// ─── 向后兼容 re-export（旧导入路径不变） ──────────────────────────────────

export {
  getCachedGatewayStatus, precheckGatewayHealth,
} from './gatewayHealthCache';
export type {
  GatewayHealthStatus, HealthErrorType, ProviderStatus,
} from './gatewayHealthCache';
