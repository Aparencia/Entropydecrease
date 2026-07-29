/**
 * AI 服务降级管理器
 * 当 AI 服务不可用时，提供缓存回退和友好的降级提示
 *
 * 职责：
 * - 缓存最近一次成功的 AI 结果（LRU + TTL）
 * - 根据错误类型 + 网络状态，返回三级降级策略
 * - 与 LocalFallback.ts（本地规则引擎）职责互补，不重叠
 *
 * @ai-context: AI 服务多级降级封装（重试→降级→本地兜底），修改降级顺序影响全部 AI 功能可用性。
 */

import { AIError, type AIErrorCode } from './types';

// === 类型定义 ===

/** 降级层级 */
export enum FallbackLevel {
  /** 缓存命中：展示上次成功结果 */
  CACHE_HIT = 'cache_hit',
  /** 友好提示：功能可用但当前无法使用 */
  FRIENDLY_PROMPT = 'friendly_prompt',
  /** 功能隐藏：完全不可用，灰态+Tooltip */
  FEATURE_HIDDEN = 'feature_hidden',
}

/** 降级结果（联合类型，按 level 区分） */
export type FallbackResult<T> =
  | { level: FallbackLevel.CACHE_HIT; data: T; cachedAt: number; message: string }
  | { level: FallbackLevel.FRIENDLY_PROMPT; message: string; retryable: boolean }
  | { level: FallbackLevel.FEATURE_HIDDEN; message: string };

/** 缓存条目 */
interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;  // 单位：毫秒
}

// === LRU + TTL 缓存 ===

const CACHE_MAX_SIZE = 50;
const DEFAULT_TTL_MS = 5 * 60 * 1000;  // 5 分钟

const cache = new Map<string, CacheEntry>();

/**
 * 写入缓存（LRU 淘汰 + TTL）
 * @param key 缓存键
 * @param data 数据
 * @param ttlMs 过期时间（毫秒），默认 5 分钟
 */
export function setAICache(key: string, data: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  if (cache.size >= CACHE_MAX_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

/**
 * 读取缓存（带 TTL 检查）
 * @returns 数据（未过期时）或 undefined（不存在/已过期）
 */
export function getAICache<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  // 检查是否过期
  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    cache.delete(key);  // 过期删除
    return undefined;
  }

  // LRU：访问后移到末尾
  cache.delete(key);
  cache.set(key, entry);

  return entry.data as T;
}

/**
 * 检查缓存是否存在且有效
 */
export function hasAICache(key: string): boolean {
  return getAICache(key) !== undefined;
}

/** 清空缓存 */
export function clearAICache(): void {
  cache.clear();
}

/** 获取缓存剩余 TTL（毫秒），-1 表示不存在 */
export function getCacheTTL(key: string): number {
  const entry = cache.get(key);
  if (!entry) return -1;
  const remaining = entry.ttl - (Date.now() - entry.timestamp);
  return remaining > 0 ? remaining : 0;
}

// === 请求去重（防抖） ===

const pendingRequests = new Map<string, Promise<unknown>>();

/**
 * 包装异步请求，相同 key 的并发请求只会执行一次
 * @param key 请求唯一标识
 * @param fn 异步函数
 * @returns Promise 结果
 */
export function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // 检查是否有进行中的请求
  const pending = pendingRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  // 创建新请求并记录
  const promise = fn().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

// === 辅助函数 ===

/** 格式化时间差（"3分钟"、"1小时"等） */
function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  return `${days}天`;
}

// === 错误提示文案 ===

const ERROR_MESSAGES: Record<AIErrorCode, string> = {
  timeout: 'AI 服务响应超时，请稍后重试',
  rate_limit: 'AI 请求过于频繁，请稍后再试',
  service_unavailable: 'AI 服务暂时不可用',
  content_filter: '内容未通过安全审核，请修改后重试',
  invalid_response: 'AI 返回了无效的结果',
  invalid_input: 'AI 服务无法理解当前请求内容，请检查输入后重试',
  content_too_short: '输入内容太短，请补充后再试',
  no_api_key: '请先配置 API Key 后使用 AI 功能',
  offline: '此功能需要联网，请检查网络连接后重试',
  auth_error: 'AI 服务认证失败，请检查 API Key 是否有效',
  cors_error: '跨域请求被拒绝，请检查网关 CORS 配置',
};

// === 核心函数 ===

/**
 * 解析 AI 服务降级策略
 *
 * 决策流程：
 * 1. 检查缓存 → 命中则返回 CACHE_HIT
 * 2. 根据错误类型判断 → offline/timeout 等返回 FRIENDLY_PROMPT
 * 3. 兜底 → FEATURE_HIDDEN
 *
 * @param cacheKey 缓存键（如 'anchor_point:noteId123'）
 * @param error 原始 AI 错误（可选）
 * @returns 降级结果
 */
export function resolveAIFallback<T>(
  cacheKey: string,
  error?: Error | null,
): FallbackResult<T> {
  // 1. 检查缓存
  const cached = cache.get(cacheKey);
  if (cached) {
    // 即使过期也作为降级结果返回（比没有好）
    return {
      level: FallbackLevel.CACHE_HIT,
      data: cached.data as T,
      cachedAt: cached.timestamp,
      message: `展示上次结果（${formatTimeAgo(cached.timestamp)}前更新）`,
    };
  }

  // 2. 根据错误类型生成友好提示
  if (error) {
    if (error instanceof AIError) {
      const message = ERROR_MESSAGES[error.code] ?? 'AI 功能暂时不可用';
      return {
        level: FallbackLevel.FRIENDLY_PROMPT,
        message,
        retryable: error.retryable,
      };
    }
    // 非 AIError 但有 error 对象
    return {
      level: FallbackLevel.FRIENDLY_PROMPT,
      message: error.message || 'AI 功能出现异常',
      retryable: true,
    };
  }

  // 3. 检查网络状态（无 error 时的兜底判断）
  if (!navigator.onLine) {
    return {
      level: FallbackLevel.FRIENDLY_PROMPT,
      message: '此功能需要联网，请检查网络连接后重试',
      retryable: true,
    };
  }

  // 4. 功能隐藏（AI 服务不可用且无缓存、无明确错误）
  return {
    level: FallbackLevel.FEATURE_HIDDEN,
    message: 'AI 功能暂时不可用',
  };
}

// === 导出常量供外部使用 ===

/** 默认缓存 TTL：5 分钟 */
export const CACHE_TTL_5MIN = DEFAULT_TTL_MS;
/** 缓存 TTL：10 分钟 */
export const CACHE_TTL_10MIN = 10 * 60 * 1000;
/** 缓存 TTL：30 分钟 */
export const CACHE_TTL_30MIN = 30 * 60 * 1000;
