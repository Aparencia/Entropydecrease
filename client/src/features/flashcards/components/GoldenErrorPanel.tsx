/**
 * @ai-context: 通用组件：GoldenErrorPanel。
 */
import { motion } from 'framer-motion';
import { Card, Button, EmptyState } from '@/components/ui';
import { AlertTriangle, RotateCcw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { GoldenError } from '@/types/models';

/**
 * Golden Error 面板
 * v0.9.0: 展示高自信答错的卡片列表，支持重新学习
 */

export interface GoldenErrorPanelProps {
  errors: GoldenError[];
  /** 将指定 golden error 卡片加入复习队列 */
  onRelearn?: (flashcardId: string) => void;
  /** 关闭面板 */
  onClose?: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function GoldenErrorPanel({ errors, onRelearn, onClose }: GoldenErrorPanelProps) {
  const prefersReduced = useReducedMotion();

  if (errors.length === 0) return null;

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReduced ? { duration: 0.01 } : { type: 'spring', stiffness: 300, damping: 28 }}
      className="w-full"
    >
      <Card padding="md" className="border-amber-400/30 bg-amber-50/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-kb-md bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-b2 font-semibold text-text-primary">高自信错误</h3>
              <p className="text-c1 text-text-tertiary">
                这些是你很有信心但答错的题目，值得重点复习
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary/50 transition-all"
            >
              &times;
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {errors.map((error, idx) => (
            <motion.div
              key={`${error.flashcardId}-${error.timestamp}`}
              initial={prefersReduced ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                prefersReduced
                  ? { duration: 0.01 }
                  : { type: 'spring', stiffness: 350, damping: 28, delay: idx * 0.05 }
              }
              className={cn(
                'flex items-start gap-3 p-3 rounded-kb-md',
                'bg-bg-secondary/80 border border-border/30',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-b3 text-text-primary font-medium truncate">
                  {error.correctAnswer.slice(0, 80)}
                </p>
                {error.userAnswer && (
                  <p className="text-c1 text-semantic-error mt-0.5 truncate">
                    你的回答: {error.userAnswer}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Clock className="w-3 h-3 text-text-tertiary" strokeWidth={1.5} />
                  <span className="text-c1 text-text-tertiary font-mono">{formatTime(error.timestamp)}</span>
                </div>
              </div>
              {onRelearn && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onRelearn(error.flashcardId)}
                  className={cn(
                    'flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-kb-md',
                    'text-c1 font-medium text-amber-600',
                    'bg-amber-50 hover:bg-amber-100 border border-amber-200/50',
                    'transition-all duration-200',
                  )}
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                  重学
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>

        {errors.length > 0 && onRelearn && (
          <div className="flex justify-center mt-3">
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              onClick={() => errors.forEach((e) => onRelearn(e.flashcardId))}
            >
              全部重新学习
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
