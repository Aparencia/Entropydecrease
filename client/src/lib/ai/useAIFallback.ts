/**
 * AI 降级 React Hook 封装
 * 提供网络状态监听 + 缓存读写的响应式接口
 *
 * @ai-context: legacy Hook：降级状态订阅，新代码优先 useAIGatewayHealth。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  resolveFallback,
  cacheFallback,
  clearFallbackCache,
  type FallbackResult,
} from './aiFallbackManager';

/** AI 功能可用性 hook */
export function useAIFeature(featureKey: string): {
  fallback: FallbackResult;
  isAvailable: boolean;
  isOnline: boolean;
  retry: () => void;
} {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [tick, setTick] = useState(0);

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

  const retry = useCallback(() => setTick(t => t + 1), []);

  const fallback = resolveFallback(featureKey);
  const isAvailable = fallback.level !== 'FEATURE_HIDDEN';

  return { fallback, isAvailable, isOnline, retry };
}

/** AI 缓存读写 hook */
export function useAICache<T>(featureKey: string): {
  getCached: () => T | null;
  setCached: (data: T) => void;
  clearCache: () => void;
} {
  const keyRef = useRef(featureKey);
  keyRef.current = featureKey;

  const getCached = useCallback((): T | null => {
    const result = resolveFallback<T>(keyRef.current);
    return result.cached ? result.data : null;
  }, []);

  const setCached = useCallback((data: T) => {
    cacheFallback(keyRef.current, data);
  }, []);

  const clearCache = useCallback(() => {
    clearFallbackCache();
  }, []);

  return { getCached, setCached, clearCache };
}
