/**
 * @ai-context: prefers-reduced-motion 媒体查询订阅，动效系统无障碍开关。
 */
import { useState, useEffect } from 'react';

/**
 * 检测用户 prefers-reduced-motion 媒体查询偏好
 * @returns true 表示用户偏好减弱动效
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}
