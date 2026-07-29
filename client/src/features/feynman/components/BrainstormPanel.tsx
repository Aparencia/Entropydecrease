/**
 * 头脑风暴面板 — Phase 1
 * 发散性思维卡片网格，支持多选（默认最多 3 个）
 *
 * @ai-context: 通用组件：BrainstormPanel。
 */

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BrainstormIdea {
  title: string;
  description: string;
  category?: string;
}

interface BrainstormPanelProps {
  ideas: BrainstormIdea[];
  onSelect: (title: string) => void;
  selected: string[];
  /** 最大可选数量，默认 3 */
  maxSelect?: number;
}

/** 分类 → 颜色映射 */
const CATEGORY_COLORS: Record<string, { bg: string; text: string; shadow: string }> = {
  '类比': { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', shadow: 'shadow-blue-500/10' },
  '反例': { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', shadow: 'shadow-amber-500/10' },
  '应用': { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', shadow: 'shadow-emerald-500/10' },
  '历史': { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', shadow: 'shadow-cyan-500/10' },
  '争议': { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', shadow: 'shadow-orange-500/10' },
};

const DEFAULT_COLOR = { bg: 'bg-brand-500/10', text: 'text-brand-600 dark:text-brand-400', shadow: 'shadow-brand-500/10' };

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.92 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] as const },
  },
};

export default function BrainstormPanel({ ideas, onSelect, selected, maxSelect = 3 }: BrainstormPanelProps) {
  const isAtLimit = selected.length >= maxSelect;
  const remaining = maxSelect - selected.length;

  return (
    <div className="flex flex-col gap-kb-sm">
      {/* 选择计数提示 */}
      <div className="flex items-center justify-between px-1">
        <span className="text-c1 text-text-tertiary">
          已选 <span className="font-semibold text-text-secondary">{selected.length}</span>/{maxSelect}
        </span>
        {remaining > 0 && (
          <span className="text-c1 text-brand-500">
            还可选择 {remaining} 个方向
          </span>
        )}
        {isAtLimit && (
          <span className="text-c1 text-amber-500">
            已达上限
          </span>
        )}
      </div>

      {/* 卡片网格 */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-kb-md"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {ideas.map((idea) => {
          const isSelected = selected.includes(idea.title);
          const colors = CATEGORY_COLORS[idea.category ?? ''] ?? DEFAULT_COLOR;
          const isDisabled = !isSelected && isAtLimit;

          return (
            <motion.button
              key={idea.title}
              variants={cardVariants}
              onClick={() => !isDisabled && onSelect(idea.title)}
              disabled={isDisabled}
              className={cn(
                'relative text-left p-kb-md rounded-kb-lg',
                'border transition-all duration-kb-fast',
                'backdrop-blur-sm',
                isSelected
                  ? 'border-[var(--kb-focus-blue)] bg-[var(--kb-focus-blue)]/5 shadow-[var(--kb-shadow-brand)]'
                  : isDisabled
                    ? 'border-border/30 bg-bg-elevated/50 opacity-50 cursor-not-allowed'
                    : 'border-border/40 bg-bg-elevated/80 hover:border-border/70 hover:shadow-md',
              )}
              whileHover={isDisabled ? {} : { scale: 1.02 }}
              whileTap={isDisabled ? {} : { scale: 0.97 }}
            >
              {/* 选中勾标 */}
              {isSelected && (
                <motion.div
                  className="absolute top-2.5 right-2.5 w-5 h-5 rounded-kb-full bg-[var(--kb-focus-blue)] flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                </motion.div>
              )}

              {/* 分类标签 */}
              {idea.category && (
                <span className={cn(
                  'inline-block px-2 py-0.5 rounded-kb-full text-c1 font-medium mb-2',
                  colors.bg, colors.text,
                )}>
                  {idea.category}
                </span>
              )}

              {/* 标题 */}
              <h3 className="text-b1 font-semibold text-text-primary mb-1 pr-6">
                {idea.title}
              </h3>

              {/* 描述 */}
              <p className="text-b2 text-text-tertiary leading-relaxed line-clamp-3">
                {idea.description}
              </p>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
