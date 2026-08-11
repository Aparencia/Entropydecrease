/**
 * AI 配额展示 Hook
 *
 * @ai-context: 调 GET /api/v1/license/quota 获取服务端权威配额使用情况
 * （次数/费用双维度），供设置页 AI 用量卡展示。配额判定在服务端，
 * 本 hook 仅做展示；请求失败静默降级（不阻塞页面）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import type { QuotaInfo } from '@/types/beta';

interface UseQuotaResult {
  quota: QuotaInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** 配额接口响应 → 类型字段名映射（snake_case → camelCase） */
function normalizeQuota(raw: Record<string, unknown>): QuotaInfo {
  return {
    usedCalls: Number(raw.used_calls) || 0,
    totalCalls: Number(raw.total_calls) || 0,
    usedCost: Number(raw.used_cost) || 0,
    costLimit: Number(raw.cost_limit) || 0,
    tier: (raw.tier as QuotaInfo['tier']) ?? 'free',
    expiresAt: typeof raw.expires_at === 'string' ? raw.expires_at : undefined,
  };
}

/**
 * 拉取服务端当日 AI 配额使用情况。
 */
export function useQuota(): UseQuotaResult {
  const { getAccessToken } = useAuth();
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch('/api/v1/license/quota', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as Record<string, unknown>;
      setQuota(normalizeQuota(data));
    } catch {
      // 网关不可达时静默降级（配额展示是增强信息，不阻塞页面）
      setQuota(null);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void refresh();
    // 30 秒内不重复拉取（进入设置页时刷新一次即可）
  }, [refresh]);

  return { quota, loading, refresh };
}
