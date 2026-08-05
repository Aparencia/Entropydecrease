/**
 * DigitalWellbeingOverlay — 休息活动建议浮层
 *
 * @ai-context: 数字养生守门人 L3 弹出——显示休息活动建议（拉伸/远眺/呼吸/散步），
 * 15 秒自动消失，framber-motion 淡入淡出。
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface RestActivity {
  id: string;
  label: string;
  emoji: string;
  duration: number;
}

interface DigitalWellbeingOverlayProps {
  show: boolean;
  restActivities: RestActivity[];
  isLocked: boolean;
  onDismiss: () => void;
}

export function DigitalWellbeingOverlay({ show, restActivities, isLocked, onDismiss }: DigitalWellbeingOverlayProps) {
  const prefersReduced = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);

  // 自动轮换活动建议
  useEffect(() => {
    if (!show) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % restActivities.length);
    }, 30_000);
    return () => clearInterval(interval);
  }, [show, restActivities.length]);

  const current = restActivities[currentIndex];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.6 }}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onDismiss} />

          <motion.div
            className="relative flex flex-col items-center gap-5 px-8 py-8 rounded-2xl bg-bg-secondary/80 backdrop-blur-md border border-border/40 shadow-kb-lg max-w-sm mx-4"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.4, ease: 'easeOut' }}
          >
            <div className="text-center">
              <span className="text-4xl block mb-2">{current?.emoji || '🧘'}</span>
              <h3 className="text-lg font-medium text-text-primary">
                {isLocked ? '休息时间' : '活动建议'}
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {current?.label || '站立拉伸'}
              </p>
              {current && (
                <p className="text-xs text-text-tertiary mt-1">
                  建议时长：{current.duration >= 60
                    ? `${Math.floor(current.duration / 60)} 分钟`
                    : `${current.duration} 秒`}
                </p>
              )}
            </div>

            {/* 其他活动预览 */}
            <div className="flex gap-2 flex-wrap justify-center">
              {restActivities.map((a, i) => (
                <span
                  key={a.id}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    i === currentIndex
                      ? 'border-brand-500/50 bg-brand-500/10 text-brand-600'
                      : 'border-border/30 text-text-tertiary'
                  }`}
                >
                  {a.emoji} {a.label}
                </span>
              ))}
            </div>

            {/* 锁定提示 */}
            {isLocked && (
              <p className="text-xs text-text-tertiary text-center px-4 py-2 bg-bg-tertiary/50 rounded-lg">
                5 分钟休息锁定，时间到后自动解锁
              </p>
            )}

            <button
              onClick={onDismiss}
              className="px-6 py-2 rounded-full bg-brand-500/80 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
            >
              已休息好
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 纯函数版本：获取默认休息活动列表
export function getDefaultRestActivities(): RestActivity[] {
  return [
    { id: 'stretch', label: '站立拉伸', emoji: '🧘', duration: 120 },
    { id: 'look-far', label: '远眺 20 秒', emoji: '🌳', duration: 20 },
    { id: 'breathe', label: '深呼吸 4-7-8', emoji: '🌬️', duration: 60 },
    { id: 'walk', label: '散步 5 分钟', emoji: '🚶', duration: 300 },
  ];
}