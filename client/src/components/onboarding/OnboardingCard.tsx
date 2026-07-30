/**
 * OnboardingCard — 毛玻璃引导卡片容器
 *
 * @ai-context: 通用组件：OnboardingCard。
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface OnboardingCardProps {
  children: ReactNode;
  width?: number | string;
  className?: string;
  rounded?: string;
  /** 面板边缘脉冲发光 */
  pulse?: boolean;
}

export function OnboardingCard({
  children,
  width = 480,
  className = '',
  rounded = 'rounded-[24px_12px_20px_16px]',
  pulse = false,
}: OnboardingCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 20 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      className={`
        backdrop-blur-2xl bg-white/10 dark:bg-black/30
        border border-white/20 ${rounded}
        ${pulse ? 'ring-2 ring-indigo-400/50 animate-pulse' : ''}
        p-6 shadow-2xl
        ${className}
      `}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      {children}
    </motion.div>
  );
}
