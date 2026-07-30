// @ai-context
// 滚动进入视口的流体显现动画容器。Scroll-into-view reveal animation wrapper.
// Why: viewport margin -80px 让动画在元素接近视口时提前触发，避免生硬。
"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface SectionRevealProps {
  children: ReactNode;
  className?: string;
  /** 延迟（秒） */
  delay?: number;
  /** 初始Y偏移 */
  y?: number;
}

/**
 * 滚动进入视口时的流体显现动画
 * 水滴融合般的慢入曲线 (400-500ms)
 */
export function SectionReveal({ children, className = "", delay = 0, y = 32 }: SectionRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
