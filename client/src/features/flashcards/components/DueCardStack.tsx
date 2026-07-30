/**
 * 牌组详情 — 待复习卡片 3D 堆叠预览
 *
 * @ai-context: 从 DeckDetailPage 拆出。最多展示 5 张待复习卡（到期 + 新卡），
 * 用 perspective + rotateX/scale/y 分层数组模拟纸牌堆叠深度；首张额外做
 * 3s 循环浮动。prefersReduced 时压缩为 0.01s 过渡并关闭浮动（无障碍）。
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Flashcard } from '@/types/models';

/** 堆叠层视觉参数（索引 0 为最上层） */
const LAYER_BG = [
  'bg-white dark:bg-[#242830]',
  'bg-blue-50/80 dark:bg-[#1E2228]',
  'bg-blue-100/60 dark:bg-[#1A1D23]/80',
  'bg-blue-100/40 dark:bg-[#1A1D23]/50',
  'bg-blue-100/40 dark:bg-[#1A1D23]/50',
];
const LAYER_BORDER = [
  'border-l-[3px] border-l-brand-500 border border-gray-200 dark:border-border-subtle',
  'border border-blue-200/60 dark:border-border-subtle/60',
  'border border-blue-200/40 dark:border-border-subtle/30',
  'border border-blue-200/30 dark:border-border-subtle/20',
  'border border-blue-200/20 dark:border-border-subtle/20',
];
const LAYER_SHADOW = [
  '0 8px 28px rgba(0,0,0,0.14)',
  '0 4px 16px rgba(0,0,0,0.08)',
  '0 2px 8px rgba(0,0,0,0.04)',
  '0 1px 4px rgba(0,0,0,0.02)',
  '0 1px 2px rgba(0,0,0,0.01)',
];
const LAYER_Y = [0, -10, -20, -28, -34];
const LAYER_SCALE = [1, 0.92, 0.85, 0.80, 0.76];
const LAYER_ROTATE_X = [0, 4, 7, 9, 11];
/** 堆叠最多可见层数 */
const MAX_VISIBLE_LAYERS = 5;

/** 堆叠卡片内部内容组件 */
function StackCardContent({ card, i }: { card: Flashcard; i: number }) {
  return (
    <div className="p-4 h-full flex flex-col">
      {/* 顶栏：编号 + 状态 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
          #{i + 1}
        </span>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-md',
          card.repetitions === 0
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
        )}>
          {card.repetitions === 0 ? '新卡' : '复习'}
        </span>
      </div>

      {/* 中间：正面内容 */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm font-medium text-center text-gray-900 dark:text-[#E8ECF0] line-clamp-3 leading-relaxed">
          {card.front}
        </p>
      </div>

      {/* 底栏：分隔线 + 元数据 */}
      <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-text-tertiary border-t border-gray-100 dark:border-border-subtle/50 pt-2 mt-1">
        <span>EF {card.easeFactor.toFixed(1)}</span>
        <span>{card.repetitions > 0 ? `已复习 ${card.repetitions} 次` : '待首次学习'}</span>
      </div>
    </div>
  );
}

export interface DueCardStackProps {
  dueCards: Flashcard[];
  prefersReduced: boolean;
}

export function DueCardStack({ dueCards, prefersReduced }: DueCardStackProps) {
  if (dueCards.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-text-tertiary text-sm mb-6">
        所有卡片已复习 ✓
      </div>
    );
  }

  const visible = dueCards.slice(0, MAX_VISIBLE_LAYERS);

  return (
    <div
      className="relative h-52 flex items-center justify-center mb-6 rounded-xl bg-gradient-to-b from-gray-50 to-gray-100/50 dark:from-transparent dark:to-transparent mx-auto max-w-lg"
      style={{ perspective: '1200px' }}
    >
      {/* 标题提示 */}
      <div className="absolute top-0 left-4 text-xs font-medium text-text-secondary z-20">
        待复习 · {dueCards.length} 张
      </div>

      {visible.map((card, i) => {
        const depth = {
          y: LAYER_Y[i],
          scale: LAYER_SCALE[i],
          rotateX: LAYER_ROTATE_X[i],
          opacity: i === 0 ? 1 : Math.max(0.45, 0.75 - i * 0.08),
        };
        const last = MAX_VISIBLE_LAYERS - 1;

        return (
          <motion.div
            key={card.id}
            className={cn(
              'absolute w-80 h-36 rounded-xl',
              LAYER_BG[i] ?? LAYER_BG[last],
              LAYER_BORDER[i] ?? LAYER_BORDER[last],
            )}
            style={{
              transformStyle: 'preserve-3d',
              zIndex: 10 - i,
              boxShadow: LAYER_SHADOW[i] ?? LAYER_SHADOW[last],
            }}
            initial={depth}
            animate={depth}
            transition={
              prefersReduced
                ? { duration: 0.01 }
                : { type: 'spring', stiffness: 300, damping: 25 }
            }
          >
            {/* 第一张卡片浮动动画 */}
            {i === 0 && !prefersReduced ? (
              <motion.div
                className="absolute inset-0"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <StackCardContent card={card} i={i} />
              </motion.div>
            ) : (
              <StackCardContent card={card} i={i} />
            )}
          </motion.div>
        );
      })}

      {/* 底部厚度指示 */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-[2px]">
        {visible.map((_, i) => (
          <div key={i} className="w-10 h-[2px] rounded-full bg-gray-300/60 dark:bg-border-subtle/40" />
        ))}
      </div>
    </div>
  );
}
