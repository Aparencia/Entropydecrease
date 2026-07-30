// @ai-context
// 超级椭圆卡片：连续曲率圆角 + 有色弥散阴影。Super-ellipse card with tinted diffuse shadow.
// Why: 摒弃 1px 硬边框，以羽化阴影分隔层级，遵循品牌视觉规范。
"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface SuperEllipseCardProps {
  children: ReactNode;
  className?: string;
  /** 有色阴影类型 */
  glow?: "brand" | "accent" | "card";
  /** 悬停时是否上浮 */
  hoverable?: boolean;
}

/**
 * 超级椭圆卡片 — 连续曲率圆角 + 有色弥散阴影
 * 摒弃1px硬边框，使用羽化渐隐与留白分隔
 */
export function SuperEllipseCard({
  children,
  className = "",
  glow = "card",
  hoverable = true,
}: SuperEllipseCardProps) {
  const shadowVar = {
    brand: "var(--kb-shadow-brand)",
    accent: "var(--kb-shadow-accent)",
    card: "var(--kb-shadow-card)",
  }[glow];

  return (
    <motion.div
      whileHover={hoverable ? { y: -6, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } : undefined}
      className={`relative rounded-3xl p-8 transition-shadow duration-500 ${className}`}
      style={{
        background: "var(--kb-bg-elevated)",
        boxShadow: shadowVar,
        border: "1px solid var(--kb-glass-border)",
      }}
    >
      {children}
    </motion.div>
  );
}
