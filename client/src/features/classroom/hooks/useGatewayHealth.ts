/**
 * useGatewayHealth — 课堂页 AI 网关健康状态机（P0-4 软阻断）
 *
 * @ai-context: 复用 hooks/gatewayHealthCache（TTL 缓存 + /health/quick 2s
 * 探针 + 竞态保护），不新造探针。状态机 idle|checking|ok|down：配置态进入
 * 课堂页即预检（读缓存优先，缓存失效发 quick 探针）；down 时每 15s 自动
 * 复检，恢复自动放行并清除定时器；网关 URL 未配置视为 down；组件卸载清理
 * 定时器。复检强制发探针（绕过 offline 5min 缓存 TTL），否则恢复永远感知不到。
 * @ai-context: 探针带代际保护（probeSeq + mounted ref）：卸载时 abort 在途
 * fetch，迟到的响应不写共享缓存、不 setState；健康判定复用
 * verifyHealthResponse 与 precheckGatewayHealth 同一 body 校验口径。
 * @ai-context: State machine over the shared health cache. Re-checks every
 * 15s while down and auto-clears the timer once recovered; an empty gateway
 * URL counts as down. Probes are generation-guarded (stale/unmounted
 * responses never touch the shared cache) and share the body verification
 * used by precheckGatewayHealth.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  readHealthCache, writeHealthCache, classifyHealthError, verifyHealthResponse,
  HEALTH_CHECK_TIMEOUT,
} from '@/hooks/gatewayHealthCache';
import { useSettingsStore } from '@/stores/useSettingsStore';

/** 课堂页网关健康状态 */
export type ClassroomGatewayStatus = 'idle' | 'checking' | 'ok' | 'down';

/** down 状态下的自动复检间隔（毫秒） */
export const GATEWAY_RECHECK_INTERVAL = 15_000;

export function useGatewayHealth() {
  const [status, setStatus] = useState<ClassroomGatewayStatus>('idle');
  // ref 与 state 同步：供 interval 回调读取最新状态，避免闭包过期值
  const statusRef = useRef<ClassroomGatewayStatus>('idle');
  const updateStatus = useCallback((s: ClassroomGatewayStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  // 代际保护：probeSeq 每次探针递增（陈旧响应作废）；mounted 标记卸载；
  // abortRef 持有在途 fetch 控制器，卸载时中止
  const probeSeqRef = useRef(0);
  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  /** 强制发 quick 探针（绕过缓存 TTL，供预检 miss 与 down 复检共用） */
  const probe = useCallback(async (url: string): Promise<boolean> => {
    updateStatus('checking');
    const seq = ++probeSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // AbortSignal.any 在部分测试环境缺失：降级仅用中止控制器信号
    const signal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any([controller.signal, AbortSignal.timeout(HEALTH_CHECK_TIMEOUT)])
      : controller.signal;
    try {
      const res = await fetch(`${url}/health/quick`, { method: 'GET', signal });
      // 与 precheckGatewayHealth 同口径：校验响应体 status 字段而非仅 res.ok
      const verdict = await verifyHealthResponse(res);
      // 代际校验：卸载后或被新探针取代的迟到响应不写缓存、不 setState
      if (seq !== probeSeqRef.current || !mountedRef.current) return false;
      writeHealthCache(verdict.ok
        ? { status: 'online', version: verdict.version }
        : { status: 'offline', errorType: 'server_error' });
      updateStatus(verdict.ok ? 'ok' : 'down');
      return verdict.ok;
    } catch (err) {
      if (seq !== probeSeqRef.current || !mountedRef.current) return false;
      writeHealthCache({ status: 'offline', errorType: classifyHealthError(err) });
      updateStatus('down');
      return false;
    }
  }, [updateStatus]);

  /**
   * 一次健康检查：URL 未配置→down；缓存命中→直接采用；否则发探针。
   * force=true（down 复检）强制发探针：否则 offline 缓存 5min TTL 内
   * 永远命中，恢复无法被感知。
   */
  const check = useCallback(async (force = false): Promise<void> => {
    const url = useSettingsStore.getState().aiConfig.gatewayUrl?.trim();
    if (!url) {
      updateStatus('down');
      return;
    }
    const cached = force ? null : readHealthCache();
    if (cached) {
      const ok = cached.status === 'online' || cached.status === 'degraded';
      updateStatus(ok ? 'ok' : 'down');
      return;
    }
    await probe(url);
  }, [probe, updateStatus]);

  // 进入课堂页（配置态）即预检
  useEffect(() => {
    void check();
  }, [check]);

  // down 时每 15s 自动复检（force 绕过 offline 缓存 TTL）；恢复（status 离开 down）时 effect 清理自动清定时器
  useEffect(() => {
    if (status !== 'down') return;
    const timer = window.setInterval(() => {
      if (statusRef.current === 'down') void check(true);
    }, GATEWAY_RECHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [status, check]);

  return { status };
}
