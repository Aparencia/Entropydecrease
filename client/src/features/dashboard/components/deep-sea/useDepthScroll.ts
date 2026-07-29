/**
 * @file 深海深度滚动 Hook
 * @description 将容器内滚动位置映射为"海洋深度"，驱动环境色、粒子密度等视觉参数
 * @ai-context: 纯 UI 逻辑 Hook，无副作用，可安全测试
 */
import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';

/** 深度层定义 */
export type DepthZone = 'surface' | 'sunlight' | 'twilight' | 'midnight';

/** Hook 返回值 */
export interface UseDepthScrollReturn {
  /** 滚动进度 0-1（0=海面，1=深渊底） */
  depthPercent: number;
  /** 当前所在深度层 */
  currentZone: DepthZone;
  /** 是否正在层间过渡 */
  isTransitioning: boolean;
  /** 绑定到滚动容器的 ref */
  scrollRef: RefObject<HTMLDivElement | null>;
}

/** 深度层阈值（百分比） */
const ZONE_THRESHOLDS: { zone: DepthZone; start: number; end: number }[] = [
  { zone: 'surface', start: 0, end: 0.15 },
  { zone: 'sunlight', start: 0.15, end: 0.45 },
  { zone: 'twilight', start: 0.45, end: 0.75 },
  { zone: 'midnight', start: 0.75, end: 1.0 },
];

/** 过渡动画持续时间 ms */
const TRANSITION_DURATION = 400;

function getZone(percent: number): DepthZone {
  for (const t of ZONE_THRESHOLDS) {
    if (percent >= t.start && percent < t.end) return t.zone;
  }
  return 'midnight';
}

/**
 * 深海深度滚动 Hook
 * @param containerRef 外部传入的滚动容器 ref（可选，不传则内部创建）
 */
export function useDepthScroll(containerRef?: RefObject<HTMLDivElement | null>): UseDepthScrollReturn {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const ref = containerRef ?? internalRef;
  const [depthPercent, setDepthPercent] = useState(0);
  const [currentZone, setCurrentZone] = useState<DepthZone>('surface');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastZone = useRef<DepthZone>('surface');

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    const percent = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    setDepthPercent(percent);

    const newZone = getZone(percent);
    if (newZone !== lastZone.current) {
      lastZone.current = newZone;
      setCurrentZone(newZone);
      setIsTransitioning(true);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => setIsTransitioning(false), TRANSITION_DURATION);
    }
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, [ref, handleScroll]);

  return { depthPercent, currentZone, isTransitioning, scrollRef: ref };
}
