/**
 * 学习会话 — 底部评分区（SM2 四档 + 自信度 + 重学）
 *
 * @ai-context: 从 StudySessionPage 拆出。仅在翻转动画完成（flipDone）后
 * 才展示评分按钮，防止用户未看答案就评分。四档按钮上方显示对应的下次复习
 * 间隔（SM2 预测值），hover 时额外提示。formatInterval 为共享展示逻辑。
 */
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Rating } from '@/lib/sm2';
import type { Confidence } from '@/types/models';
import { ConfidenceSelector } from './ConfidenceSelector';

/** 间隔天数转紧凑展示（<1d / 12d / 3mo / 1.5y） */
export function formatInterval(days: number): string {
  if (days === 0) return '<1d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

const ratingStyles = [
  { label: 'Again', rating: Rating.Again, color: 'bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700', glow: 'shadow-[0_4px_16px_rgba(244,63,94,0.35)]' },
  { label: 'Hard', rating: Rating.Hard, color: 'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700', glow: 'shadow-[0_4px_16px_rgba(245,158,11,0.3)]' },
  { label: 'Good', rating: Rating.Good, color: 'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700', glow: 'shadow-[0_4px_16px_rgba(16,185,129,0.3)]' },
  { label: 'Easy', rating: Rating.Easy, color: 'bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700', glow: 'shadow-[0_4px_16px_rgba(74,155,217,0.3)]' },
];

export interface RatingBarProps {
  /** 翻转动画是否已完成（未完成不展示评分） */
  ready: boolean;
  /** 四档对应的下次复习间隔（天） */
  intervalValues: number[];
  confidence: Confidence | null;
  hoveredRating: number | null;
  prefersReduced: boolean;
  onConfidenceChange: (c: Confidence | null) => void;
  onHoverRating: (index: number | null) => void;
  onRate: (rating: Rating) => void;
  onRelearn: () => void;
  onFlip: () => void;
}

export function RatingBar({
  ready, intervalValues, confidence, hoveredRating, prefersReduced,
  onConfidenceChange, onHoverRating, onRate, onRelearn, onFlip,
}: RatingBarProps) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** 点击反馈：缩放动画 + Good/Easy 的水波纹 */
  const handleBtnClick = (index: number, e?: React.MouseEvent<HTMLButtonElement>) => {
    const el = btnRefs.current[index];
    if (!el) return;
    el.classList.add('animate-scale-bounce');
    el.addEventListener('animationend', () => {
      el.classList.remove('animate-scale-bounce');
    }, { once: true });
    if ((index === 2 || index === 3) && e) {
      const rect = el.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'kb-ripple-effect';
      ripple.style.left = `${e.clientX - rect.left}px`;
      ripple.style.top = `${e.clientY - rect.top}px`;
      el.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    }
  };

  return (
    <div className={cn(
      'flex-shrink-0 px-kb-md py-4 border-t border-border/50',
      'bg-bg-elevated',
    )}>
      {ready ? (
        <div className="flex flex-col gap-2">
          {/* v0.9.0: Confidence selector before rating */}
          <ConfidenceSelector value={confidence} onChange={onConfidenceChange} />
          {hoveredRating !== null && (
            <div className="flex justify-center animate-fade-in-up">
              <span className="text-c2 text-text-secondary px-2 py-0.5 rounded-kb-sm bg-bg-tertiary">
                下次复习：{formatInterval(intervalValues[hoveredRating])} 后
              </span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {ratingStyles.map(({ label, rating, color, glow }, i) => (
              <motion.button
                ref={(el) => { btnRefs.current[i] = el; }}
                key={label}
                onClick={(e) => { handleBtnClick(i, e); onRate(rating); }}
                onMouseEnter={() => onHoverRating(i)}
                onMouseLeave={() => onHoverRating(null)}
                initial={prefersReduced ? false : { y: 20, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={
                  prefersReduced
                    ? { duration: 0.01 }
                    : { type: 'spring', stiffness: 400, damping: 22, delay: i * 0.06 }
                }
                whileHover={{ scale: 1.06, y: -2 }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  'relative overflow-hidden flex flex-col items-center gap-0.5 py-3 rounded-kb-lg',
                  'text-white font-semibold text-b2',
                  'transition-shadow duration-200',
                  color,
                  glow,
                )}
              >
                <span className="text-c1 opacity-80">{formatInterval(intervalValues[i])}</span>
                {label}
              </motion.button>
            ))}
          </div>
          <div className="flex justify-center">
            <button
              onClick={onRelearn}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-kb-md',
                'text-b3 font-medium text-text-secondary',
                'hover:text-brand-600 hover:bg-brand-50',
                'transition-all duration-kb-fast',
              )}
              title="将当前卡片重新加入学习队列"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
              重学此卡
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="lg"
            icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={onFlip}
            className="min-w-[160px]"
          >
            翻转查看
          </Button>
        </div>
      )}
    </div>
  );
}
