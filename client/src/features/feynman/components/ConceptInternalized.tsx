/**
 * 费曼学习完成庆祝 — "概念已内化"动画
 * Feynman learning completion celebration — "Concept Internalized" animation
 *
 * @ai-context: 四步流程完成时展示：知识粒子汇聚成珍珠 + 薄弱点清零视觉 +
 * 自评星级 + 鼓励文案。尊重自主权：用户主动关闭，无自动消失。
 * @ai-context: Shown when 4-step flow completes: knowledge particles converge
 * into a pearl + weak points cleared visual + self-rating + encouragement.
 */
import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Layers, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DEEP_SEA_EASE } from '@/lib/animation/presets';

export interface ConceptInternalizedProps {
  /** 是否显示 / Whether visible */
  visible: boolean;
  /** 概念名称 / Concept name */
  concept: string;
  /** 自评星级 (1-5) / Self rating (1-5) */
  selfRating: number;
  /** 薄弱点总数 / Total weak points count */
  weakPointsTotal: number;
  /** 已掌握薄弱点数 / Mastered weak points count */
  weakPointsMastered: number;
  /** 已转化为闪卡数 / Converted to flashcards count */
  convertedCount: number;
  /** 关闭回调 / Close callback */
  onClose: () => void;
  /** "查看闪卡"回调 / "View flashcards" callback */
  onViewFlashcards?: () => void;
  /** "返回费曼列表"回调 / "Back to list" callback */
  onBackToList: () => void;
}

export function ConceptInternalized({
  visible, concept, selfRating, weakPointsTotal,
  weakPointsMastered, convertedCount, onClose, onViewFlashcards, onBackToList,
}: ConceptInternalizedProps) {
  const prefersReduced = useReducedMotion();

  // 粒子位置（确定性随机） / Particle positions (deterministic)
  const particles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      angle: (i / 8) * Math.PI * 2,
      radius: 60 + (i % 3) * 20,
      size: 4 + (i % 3) * 2,
      delay: i * 0.08,
    })), []);

  const stars = Array.from({ length: 5 }, (_, i) => i < selfRating);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 背景 / Background */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-[#0a1628]/95 via-[#12203d]/90 to-[#061224]/95"
            onClick={onClose}
          />

          {/* 主内容 / Main content */}
          <motion.div
            className={cn(
              'relative z-10 w-full max-w-sm mx-4 p-6 rounded-2xl',
              'bg-white/5 backdrop-blur-md border border-white/10',
              'flex flex-col items-center gap-4 text-center',
            )}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 20 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: DEEP_SEA_EASE, delay: 0.1 }}
          >
            {/* 关闭按钮 / Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>

            {/* 知识珍珠动画 / Knowledge pearl animation */}
            <div className="relative w-24 h-24 flex items-center justify-center">
              {/* 汇聚粒子 / Converging particles */}
              {!prefersReduced && particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute rounded-full bg-cyber/60"
                  style={{ width: p.size, height: p.size }}
                  initial={{
                    x: Math.cos(p.angle) * p.radius,
                    y: Math.sin(p.angle) * p.radius,
                    opacity: 0.8,
                  }}
                  animate={{ x: 0, y: 0, opacity: 0 }}
                  transition={{ duration: 1, delay: p.delay, ease: DEEP_SEA_EASE }}
                />
              ))}
              {/* 珍珠核心 / Pearl core */}
              <motion.div
                className="w-14 h-14 rounded-full bg-gradient-to-br from-cyber/30 to-fuchsia-300/20 border border-cyber/30 flex items-center justify-center"
                initial={prefersReduced ? {} : { scale: 0 }}
                animate={prefersReduced ? {} : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.5 }}
              >
                <Sparkles className="w-6 h-6 text-cyber" strokeWidth={1.5} />
              </motion.div>
            </div>

            {/* 概念名称 / Concept name */}
            <div>
              <h2 className="text-lg font-semibold text-white/90">概念已内化</h2>
              <p className="text-sm text-cyber/70 mt-1">
                你用自己的话讲清了「{concept}」
              </p>
            </div>

            {/* 自评星级 / Self rating stars */}
            <div className="flex gap-1">
              {stars.map((filled, i) => (
                <motion.span
                  key={i}
                  className={cn('text-lg', filled ? 'text-amber-300' : 'text-white/20')}
                  initial={prefersReduced ? {} : { opacity: 0, scale: 0.5 }}
                  animate={prefersReduced ? {} : { opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + i * 0.1 }}
                >
                  ★
                </motion.span>
              ))}
            </div>

            {/* 薄弱点清零视觉 / Weak points cleared visual */}
            {weakPointsTotal > 0 && (
              <div className="w-full p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                  <span>薄弱点攻克</span>
                  <span className="text-emerald-300 font-medium">
                    {weakPointsMastered}/{weakPointsTotal} 已掌握
                  </span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: weakPointsTotal }, (_, i) => (
                    <motion.div
                      key={i}
                      className={cn(
                        'h-1.5 flex-1 rounded-full',
                        i < weakPointsMastered ? 'bg-emerald-400' : 'bg-white/15',
                      )}
                      initial={prefersReduced ? {} : { scaleX: 0 }}
                      animate={prefersReduced ? {} : { scaleX: 1 }}
                      transition={{ delay: 0.9 + i * 0.1, duration: 0.3 }}
                    />
                  ))}
                </div>
                {convertedCount > 0 && (
                  <p className="text-[11px] text-white/40 mt-1.5">
                    {convertedCount} 个薄弱点已转为闪卡，进入间隔复习
                  </p>
                )}
              </div>
            )}

            {/* 操作按钮 / Action buttons */}
            <div className="flex gap-3 w-full mt-1">
              <button
                onClick={onBackToList}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回列表
              </button>
              {onViewFlashcards && convertedCount > 0 && (
                <button
                  onClick={onViewFlashcards}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium text-text-inverse bg-cyber/80 hover:bg-cyber/70 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  查看闪卡
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
