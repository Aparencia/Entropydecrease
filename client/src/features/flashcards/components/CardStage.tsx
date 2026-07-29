/**
 * 学习会话 — 卡片舞台（拖拽容器 / FlipCard / 完成态）
 *
 * @ai-context: 从 StudySessionPage 拆出。仅在翻转后且未开启减弱动效时允许
 * 横向拖拽；拖拽中叠加红/绿半透明层给出即时反馈（透明度由位移映射）。
 * 退出动画方向由 exitDir 决定（Again 左飞 / 其余右飞）。完成态展示统计与
 * 黄金错题面板（本轮答错的卡片可立即重学）。
 */
import { motion, type MotionValue, type PanInfo } from 'framer-motion';
import { Button } from '@/components/ui';
import { RotateCcw, Sparkles, ExternalLink, Star } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';
import { FlipCard, type FlipCardGlow } from './FlipCard';
import { GoldenErrorPanel } from './GoldenErrorPanel';
import type { Flashcard, GoldenError } from '@/types/models';

export interface CardStageProps {
  card: Flashcard;
  isFlipped: boolean;
  entering: boolean;
  exiting: boolean;
  exitDir: 'left' | 'right' | null;
  cardGlow: FlipCardGlow;
  prefersReduced: boolean;
  dragX: MotionValue<number>;
  dragActive: boolean;
  dragOverlayRed: MotionValue<number>;
  dragOverlayGreen: MotionValue<number>;
  optimizeLoading: boolean;
  onFlip: () => void;
  onFlipEnd: () => void;
  onDragStart: () => void;
  onDrag: (e: unknown, info: { offset: { x: number } }) => void;
  onDragEnd: (e: unknown, info: PanInfo) => void;
  onOpenSourceNote: (noteId: string) => void;
  onOptimize: () => void;
}

export function CardStage({
  card, isFlipped, entering, exiting, exitDir, cardGlow, prefersReduced,
  dragX, dragActive, dragOverlayRed, dragOverlayGreen, optimizeLoading,
  onFlip, onFlipEnd, onDragStart, onDrag, onDragEnd, onOpenSourceNote, onOptimize,
}: CardStageProps) {
  const draggable = isFlipped && !prefersReduced && !exiting;

  return (
    <motion.div
      className={cn('w-full max-w-xl relative', entering && 'animate-fade-in-up')}
      drag={draggable ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.3}
      dragSnapToOrigin
      dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
      style={{ x: isFlipped && !prefersReduced ? dragX : undefined }}
      animate={
        exitDir === 'right'
          ? { x: 500, opacity: 0, rotateZ: 15 }
          : exitDir === 'left'
            ? { x: -500, opacity: 0, rotateZ: -15 }
            : { x: 0, opacity: 1, rotateZ: 0 }
      }
      transition={exitDir ? { type: 'spring', stiffness: 300, damping: 25 } : undefined}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      whileDrag={{ cursor: 'grabbing' }}
    >
      {dragActive && (
        <>
          <motion.div
            className="absolute inset-0 rounded-kb-xl bg-rose-500 z-10 pointer-events-none flex items-center justify-center"
            style={{ opacity: dragOverlayRed }}
          >
            <span className="text-white font-bold text-h1 select-none">✗ 忘记</span>
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-kb-xl bg-emerald-500 z-10 pointer-events-none flex items-center justify-center"
            style={{ opacity: dragOverlayGreen }}
          >
            <span className="text-white font-bold text-h1 select-none">✓ 记得</span>
          </motion.div>
        </>
      )}
      <FlipCard
        front={card.front}
        back={card.back}
        isFlipped={isFlipped}
        onFlip={onFlip}
        onFlipEnd={onFlipEnd}
        exiting={exiting}
        glow={cardGlow}
      />
      {isFlipped && (
        <div className="flex justify-center gap-3 mt-3">
          {card.sourceNoteId && (
            <button
              onClick={() => onOpenSourceNote(card.sourceNoteId!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium text-text-secondary hover:text-brand-600 hover:bg-brand-50 transition-all duration-kb-fast"
              title="查看来源笔记"
            >
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
              查看上下文
            </button>
          )}
          <button
            onClick={onOptimize}
            disabled={optimizeLoading}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'text-text-secondary hover:text-amber-600 hover:bg-amber-50',
              'transition-all duration-kb-fast',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="AI 优化建议"
          >
            {optimizeLoading ? (
              <AIThinkingIndicator size={4} gap={2} />
            ) : (
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            AI 优化建议
          </button>
        </div>
      )}
      {isFlipped && !prefersReduced && !dragActive && (
        <p className="text-c1 text-text-tertiary text-center mt-1.5 select-none">
          左右滑动卡片可快速评分
        </p>
      )}
    </motion.div>
  );
}

export interface SessionCompleteViewProps {
  completedCount: number;
  sessionMastered: number;
  goldenErrors: GoldenError[];
  onRestart: () => void;
  onFinish: () => void;
  /** 黄金错题重学（当前 store 仅支持重学本轮，入参保留以对齐面板契约） */
  onRelearn: (flashcardId: string) => void;
}

export function SessionCompleteView({
  completedCount, sessionMastered, goldenErrors, onRestart, onFinish, onRelearn,
}: SessionCompleteViewProps) {
  return (
    <div className="flex flex-col items-center gap-kb-md text-center py-kb-2xl">
      <div className={cn(
        'w-16 h-16 rounded-kb-xl',
        'bg-semantic-success/10 flex items-center justify-center',
        'text-semantic-success',
      )}>
        <RotateCcw className="w-8 h-8" strokeWidth={1.5} />
      </div>
      <h2 className="text-h1 font-semibold text-text-primary">本轮学习完成！</h2>
      <p className="text-b2 text-text-tertiary">共复习了 {completedCount} 张卡片</p>
      {sessionMastered > 0 && (
        <p className="inline-flex items-center gap-1.5 text-b3 font-medium text-brand-600">
          <Star className="w-3.5 h-3.5 fill-brand-400 text-brand-400" strokeWidth={1.5} />
          本轮新掌握 {sessionMastered} 个知识点
        </p>
      )}
      <div className="flex gap-3 mt-kb-sm">
        <Button variant="secondary" onClick={onRestart}>
          再来一轮
        </Button>
        <Button onClick={onFinish}>
          返回牌组
        </Button>
      </div>
      {/* v0.9.0: Golden Error panel after session complete */}
      {goldenErrors.length > 0 && (
        <div className="mt-4 w-full max-w-xl mx-auto">
          <GoldenErrorPanel errors={goldenErrors} onRelearn={onRelearn} />
        </div>
      )}
    </div>
  );
}
