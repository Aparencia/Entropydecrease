/**
 * 动画设计令牌 — Framer Motion variant 统一集合
 * @ai-context 全局动画预设层，所有模块共享的入场/退出/交互/特殊动画参数
 */

import type { Variants, Transition } from 'framer-motion';

// ─────────────────────────────────────────────────────────────
// 共用常量
// ─────────────────────────────────────────────────────────────

/** 深海美学缓动曲线（与 PageTransition / inspiration constants 一致） */
export const DEEP_SEA_EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

/** 标准入场时长（秒） */
export const DURATION_ENTER = 0.4;

/** 标准退场时长（秒） */
export const DURATION_EXIT = 0.3;

// ─────────────────────────────────────────────────────────────
// 入场动画 variants
// ─────────────────────────────────────────────────────────────

/** 纯淡入 — opacity 0→1, 400ms */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION_ENTER, ease: DEEP_SEA_EASE },
  },
};

/** 上滑入场 — y: 20→0 + opacity, 500ms */
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: DEEP_SEA_EASE },
  },
};

/** 缩放入场 — scale 0.95→1 + opacity, 400ms */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION_ENTER, ease: DEEP_SEA_EASE },
  },
};

// ─────────────────────────────────────────────────────────────
// 退出动画 variants
// ─────────────────────────────────────────────────────────────

/** 纯淡出 — opacity 1→0, 300ms */
export const fadeOut: Variants = {
  visible: { opacity: 1 },
  exit: {
    opacity: 0,
    transition: { duration: DURATION_EXIT, ease: [0.4, 0, 1, 1] as const },
  },
};

/** 下滑退出 — y: 0→20 + opacity, 300ms */
export const slideDown: Variants = {
  visible: { opacity: 1, y: 0 },
  exit: {
    opacity: 0,
    y: 20,
    transition: { duration: DURATION_EXIT, ease: [0.4, 0, 1, 1] as const },
  },
};

// ─────────────────────────────────────────────────────────────
// 交互动画（whileHover / whileTap 参数对象，非 Variants）
// ─────────────────────────────────────────────────────────────

/** 悬停放大 — scale 1.02, spring stiffness 300 */
export const scaleHover = {
  whileHover: { scale: 1.02 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
};

/** 点击缩小 — scale 0.98 */
export const scaleTap = {
  whileTap: { scale: 0.98 },
};

/** 悬停 + 点击组合（常用交互卡片） */
export const interactiveScale = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
};

// ─────────────────────────────────────────────────────────────
// 页面过渡（与 PageTransition.tsx 现有参数一致）
// ─────────────────────────────────────────────────────────────

/**
 * 页面过渡 variant
 * initial: { opacity: 0, y: 12, scale: 0.97 }
 * animate: { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: DEEP_SEA_EASE }
 * exit:    { opacity: 0, y: -6, scale: 1.01, duration: 0.15 }
 */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION_ENTER, ease: DEEP_SEA_EASE },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 1.01,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as const },
  },
};

// ─────────────────────────────────────────────────────────────
// 列表 stagger 动画
// ─────────────────────────────────────────────────────────────

/** 列表容器 — stagger 0.05s，子元素 slideUp */
export const listStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.06 },
  },
};

/** 列表子元素 — slideUp 入场（配合 listStagger 使用） */
export const listStaggerChild: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: DEEP_SEA_EASE },
  },
  exit: {
    opacity: 0,
    x: -20,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

// ─────────────────────────────────────────────────────────────
// 特殊动画 — 深海美学
// ─────────────────────────────────────────────────────────────

/** 深海漂浮 — y: [-5, 5] 循环, 6s, ease-in-out */
export const deepSeaFloat: Variants = {
  animate: {
    y: [-5, 5, -5],
    transition: {
      duration: 6,
      ease: 'easeInOut',
      repeat: Infinity,
      repeatType: 'loop' as const,
    },
  },
};

/** 环境脉冲 — opacity [0.6, 1] 循环, 3s */
export const ambientPulse: Variants = {
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: {
      duration: 3,
      ease: 'easeInOut',
      repeat: Infinity,
      repeatType: 'loop' as const,
    },
  },
};

/**
 * 水墨涟漪 — scale 0→1 + opacity 1→0, 800ms（阶段三使用）
 * @ai-context 用于点击反馈或重要事件视觉强调
 */
export const inkRipple: Variants = {
  hidden: { scale: 0, opacity: 1 },
  visible: {
    scale: 1,
    opacity: 0,
    transition: { duration: 0.8, ease: [0.22, 0.61, 0.36, 1] as const },
  },
};

/**
 * AI 三点脉冲 — 三点依次亮起（阶段三使用）
 * @ai-context 用于 AI 处理中状态指示
 */
export const aiPulse: Variants = {
  hidden: { opacity: 0.3, scale: 0.8 },
  visible: (i: number) => ({
    opacity: [0.3, 1, 0.3],
    scale: [0.8, 1.2, 0.8],
    transition: {
      duration: 1.2,
      delay: i * 0.2,
      ease: 'easeInOut',
      repeat: Infinity,
      repeatType: 'loop' as const,
    },
  }),
};

// ─────────────────────────────────────────────────────────────
// 便捷 Transition 对象
// ─────────────────────────────────────────────────────────────

/** 标准入场 transition */
export const enterTransition: Transition = {
  duration: DURATION_ENTER,
  ease: DEEP_SEA_EASE,
};

/** 标准退场 transition */
export const exitTransition: Transition = {
  duration: DURATION_EXIT,
  ease: [0.4, 0, 1, 1],
};
