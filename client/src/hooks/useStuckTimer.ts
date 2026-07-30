/**
 * @ai-context: 卡壳计时 Hook——用户停滞超阈值触发救援（rescue）建议入口。
 */
import { useRef, useCallback, useEffect } from 'react';

export function useStuckTimer(options: {
  threshold?: number;  // 默认600000 (10分钟)
  onThreshold: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const startTimeRef = useRef<number | null>(null);
  const callbackRef = useRef(options.onThreshold);
  callbackRef.current = options.onThreshold;

  const start = useCallback(() => {
    if (startTimeRef.current) return; // 已在计时
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      callbackRef.current();
      startTimeRef.current = null;
    }, options.threshold ?? 600000);
  }, [options.threshold]);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    startTimeRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    start();
  }, [start, stop]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, reset, isTracking: () => startTimeRef.current !== null };
}
