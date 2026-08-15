/**
 * ReadingGuide — 阅读引导线组件
 *
 * @ai-context: 自适应排版引擎（3.17）——阅读引导线组件，
 * 跟随滚动位置高亮当前行，其他行变暗。
 * 无侵入式设计：通过 CSS 滤镜实现，不影响内容区域。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ReadingGuideProps {
  /** 容器选择器（用于定位滚动容器） */
  containerSelector?: string;
  /** 行高亮颜色 */
  highlightColor?: string;
  /** 引导线宽度 */
  lineWidth?: number;
  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 阅读引导线组件
 * 在滚动容器上叠加一个高亮行，当前阅读行高亮，其他内容轻微变暗。
 * 通过监听滚动容器的 scroll 事件，计算当前可见区域中心行位置。
 */
export function ReadingGuide({
  containerSelector = '[data-reading-guide-container]',
  highlightColor = 'rgba(91, 138, 114, 0.06)',
  lineWidth = 2,
  enabled = true,
}: ReadingGuideProps) {
  const prefersReduced = useReducedMotion();
  const [lineY, setLineY] = useState(0);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    const container = containerSelector
      ? document.querySelector(containerSelector)
      : document.querySelector('[data-reading-guide-container]');

    if (!container) return;

    const rect = container.getBoundingClientRect();
    // 引导线在容器可见区域居中
    const centerY = rect.top + rect.height / 2;
    setLineY(centerY);
    setVisible(true);
  }, [containerSelector]);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    // 初始定位
    updatePosition();

    const container = containerSelector
      ? document.querySelector(containerSelector)
      : document.querySelector('[data-reading-guide-container]');

    if (!container) {
      // 回退到窗口滚动
      const onScroll = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(updatePosition);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', updatePosition);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updatePosition);

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updatePosition);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, updatePosition, containerSelector]);

  // 如果减弱动效，不显示引导线
  if (prefersReduced) return null;

  return (
    <AnimatePresence>
      {visible && enabled && (
        <motion.div
          className="fixed left-0 right-0 pointer-events-none z-10"
          style={{
            top: lineY - lineWidth / 2,
            height: lineWidth,
            background: highlightColor,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 两侧端点装饰 */}
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-[1px]"
            style={{ background: 'rgba(91, 138, 114, 0.15)' }}
          />
          <div
            className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-[1px]"
            style={{ background: 'rgba(91, 138, 114, 0.15)' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}