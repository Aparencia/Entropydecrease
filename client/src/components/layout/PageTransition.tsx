/**
 * @ai-context: 布局组件：PageTransition。
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'none';
}

export function PageTransition({ children, className, variant = 'default' }: PageTransitionProps) {
  const prefersReduced = useReducedMotion();
  const [hasEntered, setHasEntered] = useState(false);

  // 防止Suspense边界导致的初始闪烁
  useEffect(() => {
    const timer = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  if (!hasEntered) {
    return <div className={cn("h-full opacity-0", className)}>{children}</div>;
  }

  if (prefersReduced || variant === 'none') {
    return <div className={cn("h-full", className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn("h-full", className)}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{
        duration: 0.24,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {children}
    </motion.div>
  );
}
