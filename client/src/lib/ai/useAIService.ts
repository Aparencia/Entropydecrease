/**
 * @ai-context: legacy Hook：服务实例获取，新代码使用 aiPluginLoader 单例。
 */
import { useState, useEffect, useCallback } from 'react';
import { resolveAIFallback, setAICache, type FallbackResult } from './aiServiceFallback';

/**
 * AI 服务降级 Hook — 封装缓存读写和网络状态监听
 *
 * 用法：
 * ```ts
 * const { fallback, resolve, cacheSuccess, clear, isOnline } = useAIService<AnchorPoint[]>('anchor_point:noteId123');
 *
 * // AI 调用成功时缓存结果
 * cacheSuccess(data);
 *
 * // AI 调用失败时解析降级策略
 * resolve(error);
 *
 * // 根据 fallback.level 渲染不同 UI
 * ```
 */
export function useAIService<T>(cacheKey: string) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [fallback, setFallback] = useState<FallbackResult<T> | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const resolve = useCallback((error?: Error | null) => {
    const result = resolveAIFallback<T>(cacheKey, error);
    setFallback(result);
    return result;
  }, [cacheKey]);

  const cacheSuccess = useCallback((data: T) => {
    setAICache(cacheKey, data);
  }, [cacheKey]);

  const clear = useCallback(() => setFallback(null), []);

  return { fallback, resolve, cacheSuccess, clear, isOnline };
}
