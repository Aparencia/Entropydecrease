/**
 * 社交证据 Hook — 拉取今日聚合统计
 * Social proof hook — fetch today's aggregate stats
 *
 * @ai-context: 从 sync-service GET /api/v1/stats/today 拉取匿名聚合统计，
 * 带 5min 缓存。网络不可用时静默返回 null（不显示错误，尊重离线优先）。
 * @ai-context: Fetches anonymous aggregate stats from sync-service,
 * with 5min cache. Silently returns null when offline (offline-first).
 */
import { useState, useEffect, useCallback } from 'react';
import type { TodayStats } from '../types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedStats: TodayStats | null = null;
let cachedAt = 0;

export function useSocialProof(enabled: boolean): TodayStats | null {
  const [stats, setStats] = useState<TodayStats | null>(cachedStats);

  const fetchStats = useCallback(async () => {
    if (!enabled) return;

    // 缓存有效 / Cache valid
    if (cachedStats && Date.now() - cachedAt < CACHE_TTL_MS) {
      setStats(cachedStats);
      return;
    }

    try {
      const baseUrl = import.meta.env.VITE_SYNC_SERVICE_URL || 'http://localhost:8080';
      const res = await fetch(`${baseUrl}/api/v1/stats/today`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = await res.json() as TodayStats;
      cachedStats = data;
      cachedAt = Date.now();
      setStats(data);
    } catch {
      // 网络不可用时静默失败 / Silent failure when offline
    }
  }, [enabled]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return stats;
}
