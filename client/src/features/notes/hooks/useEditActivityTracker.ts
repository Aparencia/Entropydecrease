/**
 * @ai-context: notes 功能模块 Hook：useEditActivityTracker。
 */
import { useRef, useCallback, useEffect } from 'react';

interface UseEditActivityTrackerOptions {
  /** 触发锚点生成的活跃时长阈值（毫秒），默认 600000 (10分钟) */
  threshold?: number;
  /** 防抖间隔（毫秒），默认 500 */
  debounceMs?: number;
  /** 触发回调 */
  onThresholdReached: () => void;
}

export function useEditActivityTracker({
  threshold = 600000,
  debounceMs = 500,
  onThresholdReached,
}: UseEditActivityTrackerOptions) {
  const activeTimeRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(onThresholdReached);
  callbackRef.current = onThresholdReached;

  const recordActivity = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const now = Date.now();
      const delta = now - lastUpdateRef.current;
      if (delta < 5000) {
        // 5秒内的连续编辑算活跃
        activeTimeRef.current += delta;
      }
      lastUpdateRef.current = now;

      if (activeTimeRef.current >= threshold) {
        activeTimeRef.current = 0;
        callbackRef.current();
      }
    }, debounceMs);
  }, [threshold, debounceMs]);

  const reset = useCallback(() => {
    activeTimeRef.current = 0;
    lastUpdateRef.current = Date.now();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return {
    recordActivity,
    reset,
    getActiveTime: () => activeTimeRef.current,
  };
}
