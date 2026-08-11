/**
 * FocusGuardianOverlay — L3 全屏柔和覆盖层
 *
 * @ai-context: 专注守护灵 L3 干预——全屏半透明柔和覆盖层，含"建议休息"按钮。
 * 仅在分心等级 >= 3 时显示，framer-motion 淡入淡出。
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { wellbeingEventBus } from '@/lib/wellbeing/wellbeingEventBus';

interface FocusGuardianOverlayProps {
  /** 当前专注守护灵等级 */
  level: number;
  /** 是否显示全屏覆盖 */
  show: boolean;
  /** 建议休息回调 */
  onSuggestBreak?: () => void;
  /** 关闭覆盖回调 */
  onDismiss?: () => void;
}

export function FocusGuardianOverlay({ level, show, onSuggestBreak, onDismiss }: FocusGuardianOverlayProps) {
  const prefersReduced = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(show && level >= 3);
  }, [show, level]);

  // M12: 不在此发射 focus:distraction-detected——该事件由 useFocusGuardian
  // 在等级变化时统一发射，此处再发会向消费者重复推送同一事件

  const handleBreak = () => {
    // M12: 传递当前真实等级（原硬编码 level: 4 与 L3 覆盖场景不符）
    wellbeingEventBus.emit('focus:break-suggested', { level });
    onSuggestBreak?.();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.8 }}
        >
          {/* 柔和半透明背景 */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => { onDismiss?.(); setVisible(false); }}
          />

          {/* 中央内容 */}
          <motion.div
            className="relative flex flex-col items-center gap-6 px-8 py-10 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.5, ease: 'easeOut' }}
          >
            {/* 水母图标 */}
            <div className="w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-brand-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 18c2-3 4-4 8-4s6 1 8 4" />
                <path d="M8 14v5" />
                <path d="M12 14v5" />
                <path d="M16 14v5" />
              </svg>
            </div>

            <div className="text-center space-y-2">
              <p className="text-lg font-medium text-white/90">察觉到注意力分散</p>
              <p className="text-sm text-white/50 max-w-xs">
                似乎有些分心了呢。休息一下，让思绪重新凝聚。
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleBreak}
                className="px-6 py-2.5 rounded-full bg-brand-500/80 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
              >
                建议休息
              </button>
              <button
                onClick={() => { onDismiss?.(); setVisible(false); }}
                className="px-6 py-2.5 rounded-full bg-white/8 hover:bg-white/12 text-white/60 text-sm font-medium transition-colors"
              >
                继续专注
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}