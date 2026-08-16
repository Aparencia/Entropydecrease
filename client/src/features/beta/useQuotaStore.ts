/**
 * AI 配额全局状态（Zustand）
 *
 * @ai-context: 配额是跨页面信息（标题栏常驻胶囊 + 设置页用量卡共用），
 * 由本 store 统一持有与刷新，避免多组件各自请求 /api/v1/license/quota。
 * refresh 带 30 秒去抖窗口；429 配额耗尽事件用 force 绕过窗口立即刷新，
 * 让"已用完"状态在标题栏即时可见。
 * @ai-context: Global AI quota state shared by the titlebar badge and the
 * settings quota card; refresh is debounced, force bypasses on 429 events.
 */
import { create } from 'zustand';
import type { QuotaInfo } from '@/types/beta';

interface QuotaState {
  quota: QuotaInfo | null;
  loading: boolean;
  /** 拉取服务端当日配额（token 由调用方从 AuthContext 获取；force 绕过去抖） */
  refresh: (token?: string, force?: boolean) => Promise<void>;
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

// 30 秒去抖窗口：并发组件（标题栏 + 用量卡）同时挂载不会重复请求
const REFRESH_DEBOUNCE_MS = 30_000;

// 模块级去抖时间戳 + 请求中标记（独立于 store，避免 refresh 内部读写 store 的循环依赖）
let lastFetchedAt = 0;
let refreshing = false;

export const useQuotaStore = create<QuotaState>((set) => ({
  quota: null,
  loading: false,

  refresh: async (token?: string, force = false) => {
    // 请求进行中直接跳过（并发 429 事件 / 多组件挂载时防止重复请求）
    if (refreshing) return;
    const now = Date.now();
    if (!force && now - lastFetchedAt < REFRESH_DEBOUNCE_MS) return;
    lastFetchedAt = now;
    refreshing = true;
    set({ loading: true });
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const resp = await fetch('/api/v1/license/quota', { headers });
      if (!resp.ok) return;
      const data = (await resp.json()) as Record<string, unknown>;
      set({ quota: normalizeQuota(data) });
    } catch {
      // 网关不可达时静默降级（配额展示是增强信息，不阻塞页面）
    } finally {
      refreshing = false;
      set({ loading: false });
    }
  },
}));
