/**
 * 费曼学习会话动画 variants（共享）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出。步骤切换为方向感知过渡
 * （stepVariants 依赖 stepDirection custom 值），步骤内子元素用 stagger
 * 渐次入场。prefersReduced 时降级为纯淡入淡出（无障碍）。
 */
import { useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';

/** 步骤内子元素 stagger 渐次入场 variants */
export function createStaggerVariants(prefersReduced: boolean): { container: Variants; item: Variants } {
  return {
    container: {
      hidden: {},
      show: {
        transition: { staggerChildren: 0.08, delayChildren: 0.1 },
      },
    },
    item: {
      hidden: prefersReduced ? { opacity: 0 } : { opacity: 0, y: 12 },
      show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
    },
  };
}

/** 步骤切换方向感知过渡 variants（custom 传入方向 -1/0/1） */
export function createStepVariants(prefersReduced: boolean): Variants {
  return {
    enter: (dir: number) => prefersReduced
      ? { opacity: 0 }
      : { opacity: 0, x: dir > 0 ? 40 : -40, scale: 0.97 },
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir: number) => prefersReduced
      ? { opacity: 0 }
      : { opacity: 0, x: dir > 0 ? -40 : 40, scale: 0.97 },
  };
}

/** 便捷 hook：返回当前无障碍偏好下的 stagger variants */
export function useFeynmanStagger() {
  const prefersReduced = useReducedMotion();
  return createStaggerVariants(!!prefersReduced);
}
