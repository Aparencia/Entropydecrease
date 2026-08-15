/**
 * 牌组列表 — 网格容器（加载骨架 / 空态 / 卡片网格）
 *
 * @ai-context: 从 FlashcardsPage 拆出。聚合 RecoveryPackPanel（F5 中断恢复
 * 包）与牌组网格，按 isLoading / 空列表分三态渲染；点击、右键、长按等交互
 * 回调由父级传入，自身不持有业务状态。掌握统计由父级 statsFor 计算后透传。
 * @ai-context: Extracted from FlashcardsPage. Composes the recovery-pack
 * banner and the deck grid with three render states (loading / empty / grid);
 * interaction callbacks come from the parent and no business state lives here.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton, EmptyState } from '@/components/ui';
import { Layers3, Plus } from 'lucide-react';
import { DeckCard, type DeckLocalStats } from './DeckCard';
import RecoveryPackPanel from './RecoveryPackPanel';
import type { FlashcardDeck } from '@/types/models';

/* ── 动画 variants ── */
const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } },
};
const emptyVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export interface DeckCardGridProps {
  decks: FlashcardDeck[];
  isLoading: boolean;
  /** 按牌组 id 计算本地统计（到期/新卡/总数） */
  statsFor: (deckId: string) => DeckLocalStats;
  onNavigate: (deckId: string) => void;
  onContextMenu: (e: React.MouseEvent, deck: FlashcardDeck) => void;
  onLongPressStart: (deckId: string) => void;
  onLongPressEnd: () => void;
  onCreateClick: () => void;
}

export function DeckCardGrid({
  decks, isLoading, statsFor, onNavigate, onContextMenu,
  onLongPressStart, onLongPressEnd, onCreateClick,
}: DeckCardGridProps) {  return (
    <div className="flex-1 overflow-y-auto px-kb-md pb-kb-lg relative z-10">
      {/* F5 中断恢复包：多日未复习时顶部展示回温包（内部自判条件） */}
      <RecoveryPackPanel />
      {isLoading ? (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-kb-md"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={160} />
          ))}
        </motion.div>
      ) : decks.length === 0 ? (
        <motion.div variants={emptyVariants}>
          <EmptyState
            icon={<Layers3 className="w-12 h-12" strokeWidth={1.2} />}
            title="记忆的泥土还在沉睡"
            description="创建你的第一个牌组，让知识的种子开始生根发芽"
            action={
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-b2 font-medium
                  text-white bg-gradient-to-r from-flashcard to-flashcard/80 shadow-lg shadow-flashcard/20"
                onClick={onCreateClick}
              >
                <Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />
                新建牌组
              </motion.button>
            }
          />
        </motion.div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-kb-md"
          data-allow-context-menu
          variants={gridVariants}
        >
          <AnimatePresence mode="popLayout">
            {decks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                stats={statsFor(deck.id!)}
                onClick={() => onNavigate(deck.id)}
                onContextMenu={(e) => onContextMenu(e, deck)}
                onPointerDown={() => onLongPressStart(deck.id!)}
                onPointerUp={onLongPressEnd}
                onPointerLeave={onLongPressEnd}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
