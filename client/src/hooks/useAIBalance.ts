/**
 * @ai-context: AI 每日额度余量查询 Hook（网关 /balance），额度制是商业化合规要求的一部分。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { supabase } from '@/lib/auth/supabaseClient';

/** 单个 Provider 的余额信息 */
export interface ProviderBalance {
  provider: string;
  display_name: string;
  status: 'ok' | 'error';
  supported: boolean;
  currency?: string | null;
  total_balance?: number | null;
  granted_balance?: number | null;
  topped_up_balance?: number | null;
  error?: string;
  reason?: string;
}

/** 余额查询结果 */
export interface BalanceResult {
  status: 'idle' | 'loading' | 'success' | 'error';
  providers: ProviderBalance[];
  latencyMs?: number;
  fromCache?: boolean;
  queriedAt?: number;
  error?: string;
}

// ── 模块级缓存（跨组件共享） ──
let cachedResult: BalanceResult | null = null;
let cachedTimestamp = 0;
const CACHE_TTL = 5 * 60_000; // 5 分钟

/** 查询超时（毫秒） */
const BALANCE_QUERY_TIMEOUT = 12_000;

/**
 * AI 服务余额查询 hook
 *
 * 功能：
 * - 进入设置页时自动查询一次
 * - 提供手动刷新方法
 * - 模块级缓存避免频繁请求
 */
export function useAIBalance() {
  const gatewayUrl = useSettingsStore((s) => s.aiConfig.gatewayUrl);

  const [result, setResult] = useState<BalanceResult>(() => {
    if (cachedResult && Date.now() - cachedTimestamp < CACHE_TTL) {
      return cachedResult;
    }
    return { status: 'idle', providers: [] };
  });

  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  /** 执行一次余额查询 */
  const fetchBalance = useCallback(async (force = false): Promise<BalanceResult> => {
    // 有有效缓存且非强制刷新时直接返回
    if (!force && cachedResult && Date.now() - cachedTimestamp < CACHE_TTL) {
      if (mountedRef.current) setResult(cachedResult);
      return cachedResult;
    }

    const url = gatewayUrl?.trim();
    if (!url) {
      const empty: BalanceResult = { status: 'error', providers: [], error: '未配置 AI 网关地址' };
      if (mountedRef.current) setResult(empty);
      return empty;
    }

    if (mountedRef.current) setResult((prev) => ({ ...prev, status: 'loading' }));

    // 取消上一次请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 获取 JWT token 以通过网关认证
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${url}/api/v1/ai/balance`, {
        method: 'GET',
        headers,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(BALANCE_QUERY_TIMEOUT)]),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const success: BalanceResult = {
        status: 'success',
        providers: data.providers ?? [],
        latencyMs: data.latency_ms,
        fromCache: data.from_cache ?? false,
        queriedAt: data.queried_at,
      };

      cachedResult = success;
      cachedTimestamp = Date.now();
      if (mountedRef.current) setResult(success);
      return success;
    } catch (err) {
      let errorMsg = '查询失败';
      if (err instanceof DOMException && err.name === 'AbortError') {
        errorMsg = '查询超时，请稍后重试';
      } else if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        errorMsg = navigator.onLine ? '无法连接到 AI 网关' : '网络已断开';
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      const failed: BalanceResult = { status: 'error', providers: [], error: errorMsg };
      if (mountedRef.current) setResult(failed);
      return failed;
    }
  }, [gatewayUrl]);

  /** 手动刷新 */
  const refresh = useCallback(() => {
    void fetchBalance(true);
  }, [fetchBalance]);

  // 挂载时自动查询
  useEffect(() => {
    mountedRef.current = true;

    const hasValidCache = cachedResult && Date.now() - cachedTimestamp < CACHE_TTL;
    if (!hasValidCache && gatewayUrl?.trim()) {
      void fetchBalance();
    }

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [fetchBalance, gatewayUrl]);

  return {
    ...result,
    refresh,
  };
}
