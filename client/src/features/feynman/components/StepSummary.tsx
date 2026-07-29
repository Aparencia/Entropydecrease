/**
 * 费曼学习步骤 4：简化重述 + 理解深度自评
 *
 * @ai-context: 从 FeynmanSessionPage 拆出。简化重述要求用更通俗语言
 * 重新讲解（费曼技巧核心环节）；完成后展示 5 星理解深度自评。
 * AI 评估/反问面板由父页面在本组件之后渲染（同属步骤 4 区块）。
 */
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFeynmanStagger } from './feynmanAnimations';

interface StepSummaryProps {
  summary: string;
  onSummaryChange: (v: string) => void;
  onBlur: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isCompleted: boolean;
  rating: number;
  hoverRating: number;
  onRating: (r: number) => void;
  onHoverRating: (r: number) => void;
}

export function StepSummary({
  summary, onSummaryChange, onBlur, onContextMenu,
  isCompleted, rating, hoverRating, onRating, onHoverRating,
}: StepSummaryProps) {
  const { container, item } = useFeynmanStagger();
  return (
    <motion.div
      className="flex flex-col gap-kb-md py-kb-md"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <h2 className="text-h2 font-semibold text-text-primary">简化重述</h2>
        <p className="text-b2 text-text-tertiary mt-1">
          用更简洁、更通俗的语言，重新讲解这个概念——这次要确保任何人都能听懂。
        </p>
      </motion.div>
      <motion.div variants={item} className={cn(
        'relative min-h-[200px] flex flex-col',
        'border border-border/50 rounded-kb-lg overflow-hidden',
        'bg-bg-elevated',
      )}>
        <textarea
          value={summary}
          onChange={(e) => onSummaryChange(e.target.value)}
          onBlur={onBlur}
          onContextMenu={onContextMenu}
          placeholder="用最简单的话重新解释这个概念，就像在和一个朋友聊天..."
          className={cn(
            'flex-1 p-kb-md bg-transparent outline-none resize-none',
            'text-b1 text-text-primary placeholder:text-text-tertiary/60',
            'min-h-[180px]',
          )}
        />
        <div className={cn(
          'px-kb-md py-2 border-t border-border/40',
          'flex items-center justify-between text-c1 text-text-tertiary',
        )}>
          <span>失焦自动保存</span>
          <span>{summary.length} 字</span>
        </div>
      </motion.div>

      {/* 完成后的自评 */}
      {isCompleted && (
        <div className={cn(
          'p-kb-md rounded-kb-lg',
          'bg-bg-secondary border border-border/40',
          'flex flex-col items-center gap-2',
        )}>
          <p className="text-b2 font-medium text-text-primary">理解深度自评</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => onRating(star)}
                onMouseEnter={() => onHoverRating(star)}
                onMouseLeave={() => onHoverRating(0)}
                className="p-0.5 transition-all duration-kb-fast"
              >
                <Star
                  className={cn(
                    'w-6 h-6 transition-all duration-kb-fast',
                    (hoverRating || rating) >= star
                      ? 'text-[#F59E0B] fill-[#F59E0B]'
                      : 'text-text-tertiary/40',
                  )}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-c1 text-text-tertiary">
              {rating <= 2 ? '还需继续学习' : rating <= 4 ? '掌握得不错' : '完全理解了！'}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
