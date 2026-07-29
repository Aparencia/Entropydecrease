/**
 * @ai-context: dashboard 功能模块 Hook：useElasticPageTransition。
 */
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAmbientStore } from '@/lib/animation/useAmbientState';
import { isDarkMode } from '@/lib/animation/themeVariants';

/* ── 弹性翻页 Hook ── */
export function useElasticPageTransition() {
  const [offset, setOffset] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const thresholdRef = useRef(0);
  const animatingRef = useRef(false);
  const offsetRef = useRef(0);
  const pageRef = useRef(0);
  const headerOffset = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const containerHeightRef = useRef(0);

  useLayoutEffect(() => {
    const update = () => {
      thresholdRef.current = window.innerHeight * 0.15;
      const el = document.querySelector('[data-elastic-container]');
      if (el) {
        const top = el.getBoundingClientRect().top;
        headerOffset.current = top;
        const h = window.innerHeight - top;
        containerHeightRef.current = h;
        setContainerHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
      }
    };
    update();
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const springBack = useCallback((target: number) => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    pageRef.current = target <= -containerHeightRef.current * 0.5 ? 1 : 0;

    const startTime = performance.now();
    const startOffset = offsetRef.current;
    const duration = 650;

    function easeOutElastic(t: number): number {
      const p = 0.3;
      return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
    }

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutElastic(progress);
      const newOffset = startOffset + (target - startOffset) * eased;
      offsetRef.current = newOffset;
      setOffset(newOffset);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        offsetRef.current = target;
        setOffset(target);
        const newPage = target <= -containerHeightRef.current * 0.5 ? 1 : 0;
        setCurrentPage(newPage);
        animatingRef.current = false;
      }
    }
    requestAnimationFrame(step);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (animatingRef.current) { e.preventDefault(); return; }
    const delta = e.deltaY;
    const ch = containerHeightRef.current || window.innerHeight;
    const newOffset = Math.max(-ch, Math.min(0, offsetRef.current - delta));
    offsetRef.current = newOffset;
    setOffset(newOffset);

    const threshold = thresholdRef.current;
    const curPage = pageRef.current;

    if (Math.abs(newOffset) >= threshold && curPage === 0) {
      springBack(-ch);
    } else if (newOffset > -ch + threshold && curPage === 1) {
      springBack(0);
    } else if (Math.abs(delta) < 5) {
      springBack(Math.abs(newOffset) > ch * 0.5 ? -ch : 0);
    }
    e.preventDefault();
  }, [springBack]);

  useEffect(() => {
    const container = document.querySelector('[data-elastic-container]');
    if (!container) return;
    container.addEventListener('wheel', handleWheel as EventListener, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel as EventListener);
  }, [handleWheel]);

  return { offset, currentPage, headerOffset: headerOffset.current, containerHeight, progress: containerHeight > 0 ? Math.min(1, Math.max(0, -offset / containerHeight)) : 0 };
}

/* ── 3D 倾斜卡片组件 ── */
export function TiltCard({ children, className, ...props }: {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const glowSpotIdRef = useRef<string | null>(null);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [6, -6]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-6, 6]), { stiffness: 300, damping: 30 });
  const glowX = useTransform(mouseX, [-0.5, 0.5], ['0%', '100%']);
  const glowY = useTransform(mouseY, [-0.5, 0.5], ['0%', '100%']);

  function handleMouseMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseEnter(e: React.MouseEvent) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const nx = (rect.left + rect.width / 2) / window.innerWidth;
    const ny = (rect.top + rect.height / 2) / window.innerHeight;
    const color = isDarkMode() ? 'rgba(6, 182, 212, 0.15)' : 'rgba(245, 158, 11, 0.1)';
    const id = useAmbientStore.getState().addGlowSpot(nx, ny, color);
    glowSpotIdRef.current = id;
  }

  function handleMouseLeave() {
    mouseX.set(0); mouseY.set(0);
    if (glowSpotIdRef.current) {
      useAmbientStore.getState().removeGlowSpot(glowSpotIdRef.current);
      glowSpotIdRef.current = null;
    }
  }

  return (
    <motion.div
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 800 }}
      whileHover={{ zIndex: 10 }}
      {...props}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-500"
        style={{
          background: useTransform(
            [glowX, glowY],
            ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(91,138,114,0.08) 0%, transparent 60%)`
          ),
        }}
      />
      {children}
    </motion.div>
  );
}

/* ── 计数器动画 Hook ── */
export function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const startTime = performance.now();
    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

/* ── 容器动画变体（GPU-only: opacity + transform，已移除 filter: blur） ── */
export const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
};
export const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as const } },
};
