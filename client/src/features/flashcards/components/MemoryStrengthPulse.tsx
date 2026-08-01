/**
 * 闪卡记忆强度微动画
 * Flashcard memory strength pulse micro-animation
 *
 * @ai-context: 评分后在卡片底部显示记忆强度变化条（stability delta），
 * 1.2s 后自动淡出，不打断学习流程。颜色映射：Again=红 / Hard=橙 /
 * Good=绿 / Easy=蓝。无障碍：prefersReduced 时仅显示文字。
 * @ai-context: Shows a memory strength change bar after rating,
 * auto-fades after 1.2s. Color mapping by rating. Accessible fallback.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface MemoryStrengthPulseProps {
  /** 评分前的 stability / Stability before rating */
  stabilityBefore: number;
  /** 评分后的 stability / Stability after rating */
  stabilityAfter: number;
  /** 评分等级 (0=Again, 1=Hard, 2=Good, 3=Easy) */
  rating: number;
  /** 触发显示 / Trigger visibility */
  visible: boolean;
  /** 淡出完成回调 / Fade-out complete callback */
  onFadeComplete?: () => void;
}

/** 评分对应的颜色配置 / Color config per rating */
const RATING_COLORS: Record<number, { bar: string; text: string; label: string }> = {
  0: { bar: 'bg-rose-400', text: 'text-rose-400', label: '记忆减弱' },
  1: { bar: 'bg-amber-400', text: 'text-amber-400', label: '轻微巩固' },
  2: { bar: 'bg-emerald-400', text: 'text-emerald-400', label: '记忆增强' },
  3: { bar: 'bg-cyan-400', text: 'text-cyan-400', label: '深度巩固' },
};

/** 自动淡出延迟（ms） / Auto fade delay */
const FADE_DELAY_MS = 1200;

export function MemoryStrengthPulse({
  stabilityBefore, stabilityAfter, rating, visible, onFadeComplete,
}: MemoryStrengthPulseProps) {
  const prefersReduced = useReducedMotion();
  const [show, setShow] = useState(false);

  // 计算变化百分比 / Compute delta percentage
  const delta = stabilityBefore > 0
    ? Math.round(((stabilityAfter - stabilityBefore) / stabilityBefore) * 100)
    : (stabilityAfter > 0 ? 100 : 0);

  const colors = RATING_COLORS[rating] ?? RATING_COLORS[2];
  const isPositive = delta >= 0;

  // 条形宽度映射：将 delta 映射到 10%-90% 范围
  const barWidth = Math.min(90, Math.max(10, 50 + delta * 0.4));

  useEffect(() => {
    if (visible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        onFadeComplete?.();
      }, FADE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [visible, onFadeComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="flex flex-col items-center gap-1 py-1.5"
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.95 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
          transition={{ duration: 0.25 }}
        >
          {/* 记忆强度条 / Memory strength bar */}
          <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', colors.bar)}
              initial={{ width: '50%' }}
              animate={{ width: `${barWidth}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
          </div>

          {/* 变化文字 / Delta text */}
          <span className={cn('text-[11px] font-medium', colors.text)}>
            {isPositive ? '+' : ''}{delta}% {colors.label}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
