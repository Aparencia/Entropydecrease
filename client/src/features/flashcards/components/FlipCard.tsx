/**
 * @ai-context: 通用组件：FlipCard。
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING } from '@/lib/animation/springConfig';

export type FlipCardGlow = 'correct' | 'wrong' | null;

interface FlipCardProps {
  front: string;
  back: string;
  isFlipped: boolean;
  onFlip: () => void;
  /** 翻转动效完成后回调（用于触发评分按钮 stagger 入场） */
  onFlipEnd?: () => void;
  /** 卡片正在执行退出动画 */
  exiting?: boolean;
  /** 评分结果光晕：correct=绿色 / wrong=红色 */
  glow?: FlipCardGlow;
}

export function FlipCard({ front, back, isFlipped, onFlip, onFlipEnd, exiting, glow }: FlipCardProps) {
  const prefersReduced = useReducedMotion();

  // 3D 响应动效：正确上浮 + 光晕，错误下沉 + 暗淡
  const glowClass =
    glow === 'correct'
      ? 'ring-2 ring-emerald-400/50 shadow-[0_0_32px_rgba(16,185,129,0.35)]'
      : glow === 'wrong'
        ? 'ring-2 ring-rose-400/50 shadow-[0_0_32px_rgba(244,63,94,0.3)]'
        : isFlipped
          ? 'ring-1 ring-brand-400/30 shadow-[0_0_20px_rgba(59,130,246,0.12)]'
          : '';

  // 评分响应的 Y 位移和透明度
  const responseY = glow === 'correct' ? -10 : glow === 'wrong' ? 10 : 0;
  const responseOpacity = glow === 'wrong' ? 0.75 : 1;

  return (
    <div
      className={cn(
        'w-full cursor-pointer select-none',
        exiting && 'animate-card-exit',
      )}
      style={{ perspective: '1200px' }}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      aria-label={isFlipped ? '显示正面' : '显示背面'}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip(); } }}
    >
      <motion.div
        className={cn(
          'relative w-full rounded-kb-xl transition-shadow duration-300',
          glowClass,
        )}
        style={{
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          minHeight: '220px',
        }}
        animate={{
          rotateY: isFlipped ? 180 : 0,
          translateZ: isFlipped ? 30 : 0,
          scale: isFlipped ? 1.02 : 1,
          y: responseY,
          opacity: responseOpacity,
        }}
        transition={
          prefersReduced
            ? { duration: 0.01 }
            : SPRING.bouncy
        }
        onAnimationComplete={() => {
          if (!exiting) onFlipEnd?.();
        }}
      >
        {/* 正面 */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center p-kb-xl',
            'bg-bg-elevated rounded-kb-xl border border-border/40 shadow-kb-md',
            'backdrop-blur-sm',
          )}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex flex-col items-center gap-kb-sm text-center">
            <p className="text-[1.25rem] font-semibold text-text-primary leading-relaxed">{front}</p>
            <p className="text-c1 text-text-tertiary/70">点击翻转查看答案</p>
          </div>
        </div>

        {/* 背面 */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center p-kb-xl',
            'bg-brand-50/60 dark:bg-brand-950/30 rounded-kb-xl border border-brand-200/40 dark:border-brand-700/30 shadow-kb-md',
          )}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <p className="text-[1.05rem] text-text-secondary leading-relaxed text-center">{back}</p>
        </div>
      </motion.div>
    </div>
  );
}
