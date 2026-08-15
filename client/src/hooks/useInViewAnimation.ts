/**
 * @file 视口内动画控制 Hook
 * @description 使用 IntersectionObserver 检测组件是否在视口内，
 *              离开视口时暂停无限循环动画以节省 GPU/CPU 资源
 * @ai-context 深海生物组件（BubbleStreak、AnglerfishAchievements 等）使用此 hook
 *              配合 Framer Motion 的 animate 属性控制动画播放
 */
import { useEffect, useState, type RefObject } from 'react';

/**
 * 检测元素是否在视口内
 * @param ref 目标元素的 ref
 * @param threshold 可见比例阈值，默认 0.1（10% 可见即认为在视口内）
 * @returns 元素是否在视口内
 */
export function useInViewAnimation<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  threshold = 0.1,
): boolean {
  const [isInView, setIsInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return isInView;
}
