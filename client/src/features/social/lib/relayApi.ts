/**
 * 番茄钟协作接力 API 客户端
 * Pomodoro relay API client
 *
 * @ai-context: 接力为轻量事件协作——只交换"配对状态/双方番茄状态/累计统计"，
 * 绝不交换学习内容。同 socialApi 模式：5s 短超时 + 静默降级（null）。
 * 活跃配对持久化在 localStorage（ed_relay_pair_v1），离线时接力状态仍可读。
 * @ai-context: Relay exchanges pair status / pomodoro states / stats only —
 * never learning content. Active pair is persisted to localStorage so the
 * relay state stays readable offline.
 */
import { supabase } from '@/lib/auth/supabaseClient';
import type { RelayPair, RelayStats } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const REQUEST_TIMEOUT_MS = 5000;
const PAIR_STORAGE_KEY = 'ed_relay_pair_v1';

/** 请求封装（同 socialApi.socialRequest 的语义） */
async function relayRequest<T>(endpoint: string, init: RequestInit = {}): Promise<T | null> {
  // M2: getSession 可能在 auth 未初始化时 reject，必须捕获并静默降级（null）
  let session: { access_token?: string } | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    return null;
  }
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ─── 本地配对缓存（离线可读） ──────────────────────────────────────

export function getCachedPair(): RelayPair | null {
  try {
    const raw = localStorage.getItem(PAIR_STORAGE_KEY);
    return raw ? JSON.parse(raw) as RelayPair : null;
  } catch {
    return null;
  }
}

function cachePair(pair: RelayPair | null): void {
  try {
    if (pair) {
      localStorage.setItem(PAIR_STORAGE_KEY, JSON.stringify(pair));
    } else {
      localStorage.removeItem(PAIR_STORAGE_KEY);
    }
  } catch {
    // 存储不可用时忽略（仅缓存）
  }
}

// ─── 接力 API ─────────────────────────────────────────────────────

/** 发起配对请求 */
export async function pairWithPartner(partnerUserId: string): Promise<RelayPair | null> {
  const pair = await relayRequest<RelayPair>('/api/v1/relay/pair', {
    method: 'POST',
    body: JSON.stringify({ partnerUserId }),
  });
  if (pair) cachePair(pair);
  return pair;
}

/** 接受配对邀请 */
export async function acceptPair(pairId: string): Promise<RelayPair | null> {
  const pair = await relayRequest<RelayPair>(`/api/v1/relay/${pairId}/accept`, {
    method: 'POST',
  });
  if (pair) cachePair(pair);
  return pair;
}

/** 拒绝配对邀请 */
export async function rejectPair(pairId: string): Promise<{ ok: boolean } | null> {
  const res = await relayRequest<{ ok: boolean }>(`/api/v1/relay/${pairId}/reject`, {
    method: 'POST',
  });
  if (res) cachePair(null);
  return res;
}

/** 待处理邀请（入向） */
export function getIncomingPairs(): Promise<RelayPair[] | null> {
  return relayRequest<RelayPair[]>('/api/v1/relay/incoming', { method: 'GET' });
}

/** 当前活跃配对状态（双方番茄状态） */
export function getRelayState(pairId: string): Promise<{
  pair: RelayPair;
  partner: { phase: string; remainingSeconds: number } | null;
} | null> {
  return relayRequest<{ pair: RelayPair; partner: { phase: string; remainingSeconds: number } | null }>(
    `/api/v1/relay/${pairId}`,
    { method: 'GET' },
  );
}

/** 番茄阶段完成上报（轻事件） */
export function completeRelayDive(pairId: string, minutes: number): Promise<{ ok: boolean } | null> {
  return relayRequest<{ ok: boolean }>(`/api/v1/relay/${pairId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ minutes }),
  });
}

/** 接力统计 */
export function getRelayStats(): Promise<RelayStats | null> {
  return relayRequest<RelayStats>('/api/v1/relay/stats', { method: 'GET' });
}
