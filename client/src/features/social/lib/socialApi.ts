/**
 * 社交 API 客户端 — 协作深潜 / 社交镜像 / 虚拟自习室
 * Social API client — dive rooms / social mirror / study room
 *
 * @ai-context: 与 SyncEngine 同源（VITE_API_BASE_URL 指向 sync-service），
 * 但为社交实时性改用 5s 短超时 + 静默降级：任何失败返回 null/空数组，
 * UI 显示"离线模式"而非错误。认证经 Supabase token 注入（同 apiClient）。
 * @ai-context: Same origin as SyncEngine (VITE_API_BASE_URL → sync-service)
 * but with 5s timeout and silent degradation: failures yield null/[] so UI
 * shows an offline state instead of errors.
 */
import { supabase } from '@/lib/auth/supabaseClient';
import type { DeepDiveRoom, CheerEvent, StudyRoom } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const REQUEST_TIMEOUT_MS = 5000;

/** 统一的社交请求封装：5s 超时 + auth token + 失败静默返回 null */
export async function socialRequest<T>(
  endpoint: string,
  init: RequestInit = {},
): Promise<T | null> {
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
    // 网络不可用 / 超时 → 静默降级（离线优先）
    return null;
  }
}

// ─── 协作深潜房间 / Deep Dive Rooms ───────────────────────────────

/** 创建房间 */
export function createRoom(name: string): Promise<DeepDiveRoom | null> {
  return socialRequest<DeepDiveRoom>('/api/v1/rooms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/** 公共房间列表 */
export function listRooms(): Promise<DeepDiveRoom[] | null> {
  return socialRequest<DeepDiveRoom[]>('/api/v1/rooms', { method: 'GET' });
}

/** 加入房间 */
export function joinRoom(roomId: string, taskSummary?: string): Promise<DeepDiveRoom | null> {
  return socialRequest<DeepDiveRoom>(`/api/v1/rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify({ taskSummary }),
  });
}

/** 离开房间 */
export function leaveRoom(roomId: string): Promise<{ ok: boolean } | null> {
  return socialRequest<{ ok: boolean }>(`/api/v1/rooms/${roomId}/leave`, {
    method: 'POST',
  });
}

/** 房间状态（成员在场 + 收到的 cheer） */
export function getRoomState(roomId: string): Promise<DeepDiveRoom | null> {
  return socialRequest<DeepDiveRoom>(`/api/v1/rooms/${roomId}`, { method: 'GET' });
}

/** 发送 cheer（轻互动，不落内容） */
export function sendCheer(roomId: string, emoji: string): Promise<CheerEvent | null> {
  return socialRequest<CheerEvent>(`/api/v1/rooms/${roomId}/cheer`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

// ─── 虚拟自习室 / Virtual Study Room ──────────────────────────────

/** 获取自习室状态（座位网格） */
export function getStudyRoom(): Promise<StudyRoom | null> {
  return socialRequest<StudyRoom>('/api/v1/studyroom', { method: 'GET' });
}

/** 占用座位 */
export function occupySeat(seatId: string): Promise<StudyRoom | null> {
  return socialRequest<StudyRoom>(`/api/v1/studyroom/seats/${seatId}/occupy`, {
    method: 'POST',
  });
}

/** 离开座位 */
export function leaveSeat(seatId: string): Promise<StudyRoom | null> {
  return socialRequest<StudyRoom>(`/api/v1/studyroom/seats/${seatId}/leave`, {
    method: 'POST',
  });
}

// ─── 工具 / Utilities ──────────────────────────────────────────────

/** 主题 → 稳定短 hash（SHA-256 截断，匿名化） */
export async function hashTopic(topic: string): Promise<string> {
  const normalized = topic.trim().toLowerCase();
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    return Array.from(new Uint8Array(buf).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // crypto.subtle 不可用（非安全上下文）时退化为简单散列
    let h = 0;
    for (let i = 0; i < normalized.length; i++) {
      h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
}
