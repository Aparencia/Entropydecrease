/**
 * 仪式回顾小问服务 / Ritual recall question service (RIT-08 / B1.2)
 *
 * @ai-context: AI 增强的副作用隔离层——调用 /api/v1/ai/ritual-recall 生成
 * 回顾小问。严格遵循"本地优先"：离线、2s 超时、请求失败或后端降级
 * （status!=success / question 为空）时一律返回 null，由调用方无缝回退
 * A1 已有的遮罩摘要基线（RIT-05）。当日成功结果按 noteId 缓存，重复打开
 * 不再请求（复用 aiFallbackManager 的 LRU 缓存）。
 * @ai-context: Local-first AI enhancement. Returns null on offline / 2s
 * timeout / failure / degraded so the caller falls back to the masked
 * excerpt baseline. Same-day success cached per noteId.
 */
import { aiClient } from '@/lib/http/apiClient';
import { resolveFallback, cacheFallback, FallbackLevel } from '@/lib/ai/aiFallbackManager';
import type { RecallQuestion } from '../types';

/** 请求超时（毫秒）——超时即回退遮罩摘要，不拖慢仪式节奏（风险 R4） */
const RECALL_TIMEOUT_MS = 2000;

/** 缓存键前缀（按 noteId + 当日区分） */
function cacheKey(noteId: string): string {
  const today = new Date().toDateString();
  return `ritual-recall:${noteId}:${today}`;
}

interface RecallResponse {
  question: string;
  reference: string;
  status: string;
}

/**
 * 获取上次笔记的回顾小问。
 * @returns 成功返回 { question, reference }；任何失败/降级/离线返回 null
 */
export async function fetchRecallQuestion(
  noteId: string,
  title: string,
  content: string,
): Promise<RecallQuestion | null> {
  if (!noteId || !content.trim()) return null;

  // 当日缓存命中：直接复用，不再请求
  const cached = resolveFallback<RecallQuestion>('ritual-recall', { cacheKey: cacheKey(noteId) });
  if (cached.level === FallbackLevel.CACHE_HIT) return cached.data;

  // 离线：直接回退（不发请求）
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  try {
    const res = await aiClient.post<RecallResponse>(
      '/api/v1/ai/ritual-recall',
      { title, content },
      { timeout: RECALL_TIMEOUT_MS },
    );
    // 后端降级或空问题 → 回退遮罩摘要
    if (res.status !== 'success' || !res.question?.trim()) return null;

    const result: RecallQuestion = {
      question: res.question.trim(),
      reference: res.reference?.trim() ?? '',
    };
    cacheFallback(cacheKey(noteId), result);
    return result;
  } catch {
    return null; // 超时/网络/网关错误 → 无缝回退
  }
}
