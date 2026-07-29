/**
 * 牌组详情 — 统计行与卡片列表
 *
 * @ai-context: 从 DeckDetailPage 拆出。统计四项（总/到期/新卡/已掌握，
 * 已掌握 = 总数 - 到期 - 新卡）。列表按 SM2 进化阶段左边框着色：新卡蓝、
 * 已掌握（interval≥21 且 repetitions≥5）绿+柔光、其余复习中黄。
 */
import { motion } from 'framer-motion';
import { Card, Tag } from '@/components/ui';
import { BookOpen, Sparkles, Clock, CheckCircle2, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Flashcard } from '@/types/models';

export interface DeckStats {
  total: number;
  due: number;
  newCards: number;
}

export function DeckStatsRow({ stats }: { stats: DeckStats }) {
  const statItems = [
    { label: '总卡片', value: stats.total, icon: BookOpen, color: 'text-flashcard' },
    { label: '到期', value: stats.due, icon: Clock, color: 'text-[#F59E0B]' },
    { label: '新卡', value: stats.newCards, icon: Sparkles, color: 'text-brand-500' },
    {
      label: '已掌握',
      value: stats.total - stats.due - stats.newCards,
      icon: CheckCircle2,
      color: 'text-semantic-success',
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-4 gap-kb-sm px-kb-md py-kb-md flex-shrink-0"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
    >
      {statItems.map(({ label, value, icon: Icon, color }) => (
        <motion.div
          key={label}
          variants={{ hidden: { opacity: 0, y: 12, scale: 0.97 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
        >
          <Card padding="sm" className="flex flex-col items-center gap-1 text-center">
            <Icon className={cn('w-icon-sm h-icon-sm', color)} strokeWidth={1.5} />
            <span className={cn('text-h2 font-bold', color)}>{value}</span>
            <span className="text-c1 text-text-tertiary">{label}</span>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}

/** 按 SM2 进化阶段返回左边框样式 */
function evolutionClass(card: Flashcard): string {
  const isNew = card.repetitions === 0;
  const isMastered = card.interval >= 21 && card.repetitions >= 5;
  if (isNew) return 'border-l-2 border-l-brand-300/50';
  if (isMastered) return 'border-l-2 border-l-emerald-400/70 shadow-[0_0_8px_rgba(16,185,129,0.12)]';
  return 'border-l-2 border-l-amber-400/50';
}

export interface DeckCardListProps {
  cards: Flashcard[];
  prefersReduced: boolean;
  onContextMenu: (e: React.MouseEvent, card: Flashcard) => void;
  onEdit: (card: Flashcard) => void;
  onDelete: (cardId: string | null) => void;
  onOpenSourceNote: (noteId: string) => void;
}

export function DeckCardList({
  cards, prefersReduced, onContextMenu, onEdit, onDelete, onOpenSourceNote,
}: DeckCardListProps) {
  return (
    <motion.div
      className="flex flex-col gap-kb-sm"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } } }}
    >
      {cards.map((card) => {
        const isNew = card.repetitions === 0;
        const isMastered = card.interval >= 21 && card.repetitions >= 5;

        return (
          <motion.div
            key={card.id}
            variants={{ hidden: { opacity: 0, x: -16, scale: 0.96 }, visible: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 28 } } }}
            whileHover={prefersReduced ? undefined : { y: -3, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
            whileTap={prefersReduced ? undefined : { scale: 0.98, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
          >
            <Card
              padding="sm"
              className={cn('flex items-center gap-3', evolutionClass(card))}
              onContextMenu={(e) => onContextMenu(e, card)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-b2 font-medium text-text-primary truncate">{card.front}</p>
                <div className="flex items-center gap-3 mt-1 text-c1 text-text-tertiary">
                  <span>EF: {card.easeFactor.toFixed(2)}</span>
                  <span>间隔: {card.interval}d</span>
                  <span>连续: {card.repetitions}</span>
                  {isNew && <Tag color="brand" className="text-[10px] px-1.5 py-0">新卡</Tag>}
                  {isMastered && <Tag color="flashcard" className="text-[10px] px-1.5 py-0">已掌握</Tag>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {card.sourceNoteId && (
                  <button
                    onClick={() => onOpenSourceNote(card.sourceNoteId!)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-c1 text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-kb-fast"
                    aria-label="查看上下文"
                    title="查看来源笔记"
                  >
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                    查看上下文
                  </button>
                )}
                <button
                  onClick={() => onEdit(card)}
                  className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
                  aria-label="编辑卡片"
                >
                  <Pencil className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => onDelete(card.id ?? null)}
                  className="p-1.5 rounded-kb-full text-text-tertiary hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-all duration-kb-fast"
                  aria-label="删除卡片"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
