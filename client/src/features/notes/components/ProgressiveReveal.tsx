/**
 * 渐进式内容揭示组件
 * Progressive content reveal component
 *
 * @ai-context: 将笔记内容分段展示，每段初始模糊，用户点击或自动计时后逐段清晰。
 * 适合冥想式复习、专注阅读场景。可配置揭示速度。
 * @ai-context: Reveals note content paragraph by paragraph. Each paragraph
 * starts blurred, becomes clear on click or auto-timer. Suitable for
 * meditation review and focused reading.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressiveRevealProps {
  /** 笔记文本内容 */
  text: string;
  /** 揭示速度（秒/段，默认 5） */
  speed?: number;
  /** 自动播放（默认 true） */
  autoPlay?: boolean;
  /** 完成回调 */
  onComplete?: () => void;
  /** 自定义类名 */
  className?: string;
}

export function ProgressiveReveal({
  text,
  speed = 5,
  autoPlay = true,
  onComplete,
  className,
}: ProgressiveRevealProps) {
  // 将文本分段
  const paragraphs = useMemo(() => {
    return text
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
  }, [text]);

  const [revealedCount, setRevealedCount] = useState(autoPlay ? 1 : 0);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealNext = useCallback(() => {
    setRevealedCount((prev) => {
      const next = prev + 1;
      if (next >= paragraphs.length) {
        setIsComplete(true);
        onComplete?.();
      }
      return next;
    });
  }, [paragraphs.length, onComplete]);

  // 自动播放计时器
  useEffect(() => {
    if (!autoPlay || isComplete) return;
    timerRef.current = setTimeout(revealNext, speed * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoPlay, isComplete, revealedCount, speed, revealNext]);

  // 手动揭示
  const handleClick = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    revealNext();
  }, [revealNext]);

  if (paragraphs.length === 0) {
    return <p className="text-b2 text-text-tertiary">暂无内容</p>;
  }

  return (
    <div className={cn('space-y-3', className)} onClick={handleClick}>
      <AnimatePresence>
        {paragraphs.slice(0, revealedCount).map((para, i) => (
          <motion.p
            key={i}
            className="text-b2 text-text-secondary leading-relaxed cursor-pointer hover:text-text-primary transition-colors"
            initial={{ opacity: 0, filter: 'blur(8px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.5 }}
          >
            {para}
          </motion.p>
        ))}
      </AnimatePresence>

      {!isComplete && revealedCount < paragraphs.length && (
        <motion.p
          className="text-b2 text-text-tertiary/40 italic cursor-pointer select-none"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          点击或等待 {speed} 秒继续...
        </motion.p>
      )}

      {isComplete && (
        <motion.p
          className="text-c1 text-text-tertiary text-center pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          已读完所有内容
        </motion.p>
      )}

      {/* 进度 */}
      <div className="flex items-center gap-2 pt-2">
        <div className="flex-1 h-1 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-400 transition-all duration-500"
            style={{ width: `${(revealedCount / paragraphs.length) * 100}%` }}
          />
        </div>
        <span className="text-c1 text-text-tertiary font-mono">
          {revealedCount}/{paragraphs.length}
        </span>
      </div>
    </div>
  );
}

export default ProgressiveReveal;