/**
 * AI 离线降级统一管理器
 * 提供三级降级策略：缓存命中 → 友好提示 → 功能隐藏
 *
 * 与 aiServiceFallback.ts 互补：
 * - aiServiceFallback 面向 AI 服务调用层的错误降级
 * - aiFallbackManager 面向 UI 层的可用性判断与缓存管理
 *
 * @ai-context: 云端网关→本地 Ollama 的降级链管理器，降级决策依据网关健康态与本地可用性。
 */

// === 类型定义 ===

/** 降级层级 */
export enum FallbackLevel {
  /** 缓存命中，返回缓存数据 */
  CACHE_HIT = 'CACHE_HIT',
  /** 友好提示，告知用户AI暂不可用 */
  FRIENDLY_PROMPT = 'FRIENDLY_PROMPT',
  /** 功能隐藏，完全不可用 */
  FEATURE_HIDDEN = 'FEATURE_HIDDEN',
}

/** 降级结果（联合类型，按 level 区分） */
export type FallbackResult<T = unknown> =
  | { level: FallbackLevel.CACHE_HIT; data: T; cached: true }
  | { level: FallbackLevel.FRIENDLY_PROMPT; message: string; cached: false }
  | { level: FallbackLevel.FEATURE_HIDDEN; cached: false };

// === LRU 缓存 ===

/** 简易 LRU 缓存，基于 Map 实现插入序淘汰 */
export class LRUCache<K, V> {
  private map = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // 访问后提升为最新：删除再插入
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // 淘汰最早插入的条目
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** 模块级 LRU 缓存实例（上限 50 条） */
const fallbackCache = new LRUCache<string, unknown>(50);

// === 核心函数 ===

/**
 * 解析降级策略（纯函数）
 *
 * 决策流程：
 * 1. 查缓存 → CACHE_HIT
 * 2. navigator.onLine → FRIENDLY_PROMPT（AI正在连接...）
 * 3. 离线 → FEATURE_HIDDEN
 */
export function resolveFallback<T = unknown>(
  featureKey: string,
  options?: { cacheKey?: string },
): FallbackResult<T> {
  const key = options?.cacheKey ?? featureKey;

  // 1. 查缓存
  const cached = fallbackCache.get(key);
  if (cached !== undefined) {
    return { level: FallbackLevel.CACHE_HIT, data: cached as T, cached: true };
  }

  // 2. 在线 → 友好提示
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    return {
      level: FallbackLevel.FRIENDLY_PROMPT,
      message: 'AI 正在连接...',
      cached: false,
    };
  }

  // 3. 离线 → 功能隐藏
  return { level: FallbackLevel.FEATURE_HIDDEN, cached: false };
}

/** 写入降级缓存 */
export function cacheFallback<T = unknown>(featureKey: string, data: T): void {
  fallbackCache.set(featureKey, data);
}

/** 清空降级缓存 */
export function clearFallbackCache(): void {
  fallbackCache.clear();
}
