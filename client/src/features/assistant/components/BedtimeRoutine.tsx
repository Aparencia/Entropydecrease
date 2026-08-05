/**
 * BedtimeRoutine — F3 睡前仪式完整版
 *
 * @ai-context: 三步睡前仪式：① 睡前复习（5 张闪卡）→ ② 回顾引导（安抚信息）
 * → ③ 清醒期引导（建议明早回看）。5 分钟无操作自动关闭。
 * 设计原则：可逆 > 不可逆——随时可关闭。
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sparkles, Sun, X, BookOpen, Check } from 'lucide-react';
import { Button } from '@/components/ui';

/** 自动关闭倒计时（毫秒）：5 分钟无操作 */
const AUTO_DISMISS_MS = 5 * 60 * 1000;

interface Props {
  open: boolean;
  onClose: () => void;
  /** 到期卡最多的牌组 ID，用于直接拉起复习 */
  topDeckId?: string;
}

type RoutineStep = 'review' | 'reflect' | 'morning';

export function BedtimeRoutine({ open, onClose, topDeckId }: Props) {
  const [step, setStep] = useState<RoutineStep>('review');
  const [completed, setCompleted] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      setStep('review');
      setCompleted(false);
    }
  }, [open]);

  // 5 分钟无操作自动关闭
  useEffect(() => {
    if (!open) return;
    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        onClose();
      }, AUTO_DISMISS_MS);
    };
    resetIdle();
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
    };
  }, [open, onClose]);

  const handleStartReview = () => {
    if (topDeckId) {
      window.location.hash = `#/flashcards/${topDeckId}/study?mini=5`;
    }
    setCompleted(true);
    setTimeout(() => setStep('reflect'), 600);
  };

  const handleSkipReview = () => {
    setCompleted(true);
    setStep('reflect');
  };

  const handleNextToMorning = () => {
    setStep('morning');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-bg-primary/95 backdrop-blur-2xl p-6">
      <AnimatePresence mode="wait">
        {step === 'review' && (
          <motion.div
            key="review"
            className="flex flex-col items-center gap-6 max-w-sm"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-2 text-indigo-400">
              <Moon className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-b1 font-semibold text-text-primary">睡前仪式 · 第一步</span>
            </div>
            <p className="text-center text-c1 text-text-secondary leading-relaxed">
              睡前花 2 分钟复习 5 张卡片，让睡眠帮你巩固记忆。
              大脑会在睡眠中自动回放今日的输入——给它们一些锚点。
            </p>

            <div className="flex items-center gap-3 py-3 px-4 rounded-kb-lg border border-border/40 bg-bg-secondary/40 w-full">
              <BookOpen className="w-4 h-4 text-brand-500 flex-shrink-0" strokeWidth={1.5} />
              <span className="text-b2 text-text-secondary">
                {topDeckId ? '已为你准备好到期卡最多的牌组' : '今天没有到期卡，也可以浏览一下笔记'}
              </span>
            </div>

            <div className="flex flex-col gap-2 w-full">
              {topDeckId && (
                <Button variant="primary" size="lg" icon={<Sparkles className="w-4 h-4" />} onClick={handleStartReview}>
                  开始复习 5 张卡片
                </Button>
              )}
              <Button variant="ghost" size="md" onClick={handleSkipReview}>
                今天先跳过
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'reflect' && (
          <motion.div
            key="reflect"
            className="flex flex-col items-center gap-6 max-w-sm text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-2 text-indigo-400">
              <Check className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-b1 font-semibold text-text-primary">睡前仪式 · 完成</span>
            </div>
            <p className="text-center text-b2 text-text-primary leading-relaxed">
              {completed
                ? '复习做完了，今晚的记忆加固已经启动。'
                : '给自己一个安静的夜晚。'}
            </p>
            <p className="text-center text-c1 text-text-tertiary max-w-xs">
              睡眠中大脑会整理今天学的内容——不需要刻意做什么，它自己会完成。
              记住：好的睡眠本身就是学习的一部分。
            </p>
            <div className="flex items-center gap-2 text-emerald-400/80 mt-2">
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-b2 font-medium">晚安，明天见</span>
            </div>

            <div className="flex flex-col gap-2 w-full mt-2">
              <Button variant="secondary" size="md" onClick={handleNextToMorning}>
                查看清醒期引导
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                关闭
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'morning' && (
          <motion.div
            key="morning"
            className="flex flex-col items-center gap-6 max-w-sm text-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-2 text-amber-400">
              <Sun className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-b1 font-semibold text-text-primary">清醒期引导</span>
            </div>
            <p className="text-center text-b2 text-text-primary leading-relaxed">
              明早醒来后，花 3 分钟回想一下今晚复习的内容——
              睡眠已经帮你加固，早上是最佳的回溯时机。
            </p>
            <p className="text-center text-c1 text-text-tertiary max-w-xs">
              醒来后在脑海中过一遍关键词，就能唤醒睡眠中整理好的记忆。
              这是"睡眠巩固"最有效的利用方式。
            </p>

            <Button variant="primary" size="md" onClick={onClose}>
              好的，晚安
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右上角关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-colors"
        aria-label="关闭睡前仪式"
      >
        <X className="w-5 h-5" strokeWidth={1.5} />
      </button>
    </div>
  );
}