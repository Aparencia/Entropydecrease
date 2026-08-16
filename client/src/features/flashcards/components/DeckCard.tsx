/**
 * 牌组卡 — 网格中的单张牌组卡片
 *
 * @ai-context: 从 FlashcardsPage 拆出。负责牌组卡片的视觉呈现：顶部光泽/
 * shimmer 扫光/到期脉冲/标题区/掌握进度条/底栏统计；点击、右键、长按等
 * 交互回调由父级传入。掌握进度 = (total - due - new) / total。
 * @ai-context: Extracted from FlashcardsPage. Renders a single deck card
 * (gloss / shimmer / due pulse / title / mastery progress / bottom stats);
 * click, context-menu and long-press callbacks are provided by the parent.
 * Mastery progress = (total - due - new) / total.
 */
import { motion } from 'framer-motion';
import { Tag } from '@/components/ui';
import { Layers, Clock } from 'lucide-react';
import { DeckCardDescription } from './DeckCardDescription';
import type { FlashcardDeck } from '@/types/models';

/** 牌组本地统计（由父级基于全部卡片实时计算） */
export interface DeckLocalStats {
  total: number;
  due: number;
  newCards: number;
}

/* ── 动画 variants ── */
const deckCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.92 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] as const },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
};

export interface DeckCardProps {
  deck: FlashcardDeck;
  stats: DeckLocalStats;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
}

export function DeckCard({
  deck, stats, onClick, onContextMenu, onPointerDown, onPointerUp, onPointerLeave,
}: DeckCardProps) {
  const progress = stats.total > 0
    ? (stats.total - stats.due - stats.newCards) / stats.total : 0;
  const pct = Math.round(progress * 100);
  const hasDue = stats.due > 0;

  return (
    <motion.div
      layout
      variants={deckCardVariants}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      exit={deckCardVariants.exit}
    >
      <div
        className="group relative flex flex-col gap-3 p-kb-md rounded-[var(--kb-radius-md)]
          bg-bg-secondary/60 backdrop-blur-xl border border-border/30
          hover:border-flashcard/30 cursor-pointer overflow-hidden
          transition-colors duration-300"
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        {/* ── 卡片顶部光泽 ── */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(123,196,184,0.06) 0%, transparent 50%, rgba(123,196,184,0.03) 100%)',
          }}
        />
        {/* ── shimmer 扫光 ── */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1.2s] ease-in-out pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(123,196,184,0.06) 50%, transparent 100%)',
          }}
        />

        {/* ── 到期脉冲指示 ── */}
        {hasDue && (
          <motion.div
            className="absolute top-3 right-3 w-2 h-2 rounded-full bg-flashcard"
            animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.4, 0.8] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* ── 标题区 ── */}
        <div className="flex items-start justify-between gap-2 relative z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {deck.color && (
                <motion.span
                  className="w-2.5 h-2.5 rounded-kb-full flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: deck.color }}
                  whileHover={{ scale: 1.5 }}
                />
              )}
              <h3 className="text-b1 font-semibold text-text-primary truncate">{deck.name}</h3>
            </div>
            <DeckCardDescription description={deck.description} />
          </div>
          <Tag color="flashcard">{stats.total} 卡</Tag>
        </div>

        {/* ── 进度条 ── */}
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-c1 text-text-tertiary">已掌握</span>
            <motion.span
              className="text-c1 font-medium text-flashcard tabular-nums"
              key={pct}
              initial={{ opacity: 0.5, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {pct}%
            </motion.span>
          </div>
          <div className="h-1.5 rounded-kb-full bg-bg-tertiary/80 overflow-hidden">
            <motion.div
              className="h-full rounded-kb-full relative overflow-hidden"
              style={{ background: 'linear-gradient(90deg, #7BC4B8, #5BAFA2)' }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] as const, delay: 0.3 }}
            >
              {/* 进度条流光 */}
              <div className="absolute inset-0 animate-[kb-progress-shine_2s_ease-in-out_infinite]"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                }}
              />
            </motion.div>
          </div>
        </div>

        {/* ── 底栏 ── */}
        <div className="flex items-center justify-between text-c1 text-text-tertiary pt-1 border-t border-border/20 relative z-10">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
            共 {stats.total} 张
          </span>
          {hasDue ? (
            <span className="flex items-center gap-1 text-flashcard font-medium">
              <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
              {stats.due} 张到期
            </span>
          ) : stats.total > 0 ? (
            <motion.span
              className="text-semantic-success font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              ✓ 全部已学完
            </motion.span>
          ) : (
            <span className="text-text-tertiary">暂无卡片</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
