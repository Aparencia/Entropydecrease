import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Modal, Input, Tag, EmptyState, Skeleton, useToast } from '@/components/ui';
import { ContextMenu, type ContextMenuGroup } from '@/components/ui/ContextMenu';
import {
  ArrowLeft,
  BookOpen,
  Sparkles,
  Clock,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  Download,
  PauseCircle,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { exportDeck, downloadDeckFile } from '@/lib/storage/exportImport';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { useShallow } from 'zustand/react/shallow';
import { useAIFlashcards } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useContextMenu } from '@/lib/contextMenu/useContextMenu';
import type { Flashcard } from '@/types/models';
import { createNewCardState } from '@/lib/sm2';
import type { Flashcard as AIFlashcard } from '@/lib/ai/types';

/** 堆叠卡片内部内容组件 */
function StackCardContent({ card, i }: { card: Flashcard; i: number }) {
  return (
    <div className="p-4 h-full flex flex-col">
      {/* 顶栏：编号 + 状态 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
          #{i + 1}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
          card.repetitions === 0
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
        }`}>
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

export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const {
    decks,
    cards,
    isLoading,
    loadCards,
    selectDeck,
    loadDecks,
    createCard,
    updateCard,
    deleteCard,
    getDeckStats,
  } = useFlashcardStore(useShallow(s => s));

  const deck = decks.find((d) => d.id === deckId);

  // Add / Edit modal state
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);

  // AI generate state
  const [aiModalOpen, setAIModalOpen] = useState(false);
  const [aiInputContent, setAIInputContent] = useState('');
  const [aiGeneratedCards, setAIGeneratedCards] = useState<AIFlashcard[]>([]);
  const [aiAddingIndex, setAIAddingIndex] = useState<number | null>(null);
  const { loading: aiLoading, error: aiError, needsConfig: aiNeedsConfig, generate } = useAIFlashcards();
  const { toast } = useToast();
  const handleAIGenerateError = useAIErrorHandler('AI 闪卡生成失败');
  const [exporting, setExporting] = useState(false);

  // Context menu
  const {
    isOpen: ctxOpen,
    position: ctxPos,
    context: ctxCard,
    handleContextMenu: ctxHandleMenu,
    close: ctxClose,
  } = useContextMenu<Flashcard>();

  const cardMenuGroups: ContextMenuGroup[] = [
    {
      label: '卡片操作',
      items: [
        { key: 'edit', label: '编辑卡片', icon: <Pencil className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'relearn', label: '重学此卡', icon: <RotateCcw className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'suspend', label: '搁置卡片', icon: <PauseCircle className="w-4 h-4" strokeWidth={1.5} /> },
      ],
    },
    {
      label: '管理',
      items: [
        { key: 'delete', label: '删除卡片', icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />, danger: true },
      ],
    },
  ];

  const handleCardSelect = useCallback((itemKey: string, card: Flashcard) => {
    switch (itemKey) {
      case 'edit':
        openEditModal(card);
        break;
      case 'relearn': {
        // 重学：重置 SM-2 状态，使卡片立即变为可学习状态
        const fresh = createNewCardState();
        updateCard(card.id, {
          easeFactor: fresh.easeFactor,
          interval: fresh.interval,
          repetitions: fresh.repetitions,
          lapses: fresh.lapses,
          dueDate: fresh.dueDate,
        });
        toast({ type: 'success', message: '卡片已重置，可立即学习' });
        break;
      }
      case 'suspend': {
        // 搁置：将到期日设为 1 年后
        const farFuture = new Date();
        farFuture.setFullYear(farFuture.getFullYear() + 1);
        updateCard(card.id, { dueDate: farFuture });
        toast({ type: 'success', message: '卡片已搁置' });
        break;
      }
      case 'delete':
        setDeleteCardId(card.id ?? null);
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateCard, toast]);

  const handleExport = async () => {
    if (!deckId) return;
    setExporting(true);
    try {
      const data = await exportDeck(deckId);
      downloadDeckFile(data);
      toast({ type: 'success', message: `牌组「${deck?.name}」已导出` });
    } catch {
      toast({ type: 'error', message: '导出失败，请稍后重试' });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (deckId) {
      loadDecks();
      selectDeck(deckId);
      loadCards(deckId);
    }
  }, [deckId, loadDecks, selectDeck, loadCards]);

  const prefersReduced = useReducedMotion();
  const stats = deckId ? getDeckStats(deckId) : { total: 0, due: 0, newCards: 0 };

  // 待复习卡片（用于 3D 堆叠预览）：到期卡片 + 新卡
  const dueCards = useMemo(() => {
    const now = new Date();
    return cards.filter((c) => new Date(c.dueDate) <= now || c.repetitions === 0);
  }, [cards]);

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

  const canStudy = stats.due > 0 || stats.newCards > 0;

  const openAddModal = () => {
    setEditingCardId(null);
    setCardFront('');
    setCardBack('');
    setCardModalOpen(true);
  };

  const openEditModal = (card: (typeof cards)[0]) => {
    setEditingCardId(card.id ?? null);
    setCardFront(card.front);
    setCardBack(card.back);
    setCardModalOpen(true);
  };

  const handleSaveCard = async () => {
    if (!cardFront.trim() || !cardBack.trim()) return;
    setSaving(true);
    try {
      if (editingCardId !== null) {
        await updateCard(editingCardId, { front: cardFront.trim(), back: cardBack.trim() });
      } else {
        await createCard({
          deckId: deckId!,
          front: cardFront.trim(),
          back: cardBack.trim(),
          type: 'basic',
        });
      }
      setCardModalOpen(false);
      setCardFront('');
      setCardBack('');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCard = async () => {
    if (deleteCardId === null) return;
    await deleteCard(deleteCardId);
    soundPlayer.play('feedback_delete');
    setDeleteCardId(null);
  };

  const deleteTargetCard = cards.find((c) => c.id === deleteCardId);

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50 flex-shrink-0">
        <button
          onClick={() => navigate('/flashcards')}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {deck?.color && (
            <span
              className="w-2.5 h-2.5 rounded-kb-full flex-shrink-0"
              style={{ backgroundColor: deck.color }}
            />
          )}
          <h1 className="text-h2 font-semibold text-text-primary truncate">
            {deck?.name ?? '加载中…'}
          </h1>
        </div>
        <Button size="sm" icon={<Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />} onClick={openAddModal}>
          添加卡片
        </Button>

        <Button
          size="sm"
          variant="secondary"
          icon={aiLoading ? <AIThinkingIndicator size={4} gap={3} /> : <Sparkles className="w-icon-sm h-icon-sm" />}
          onClick={() => {
            setAIInputContent('');
            setAIGeneratedCards([]);
            setAIModalOpen(true);
          }}
        >
          AI 生成闪卡
        </Button>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast disabled:opacity-50"
          aria-label="导出牌组"
          title="导出牌组"
        >
          {exporting
            ? <Loader2 className="w-icon-sm h-icon-sm animate-spin" strokeWidth={1.5} />
            : <Download className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
        </button>
      </div>

      {/* 统计行 */}
      <motion.div
        className="grid grid-cols-4 gap-kb-sm px-kb-md py-kb-md flex-shrink-0"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
      >
        {statItems.map(({ label, value, icon: Icon, color }) => (
          <motion.div key={label}
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

      {/* 卡片列表 */}
      <div className="flex-1 overflow-y-auto px-kb-md pb-kb-md">
        {isLoading ? (
          <div className="flex flex-col gap-kb-sm">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={64} />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-12 h-12" strokeWidth={1.2} />}
            title="牌组还没有卡片"
            description="点击「添加卡片」开始为这个牌组创建学习卡片"
            action={
              <Button
                size="sm"
                icon={<Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />}
                onClick={openAddModal}
              >
                添加卡片
              </Button>
            }
          />
        ) : (
          <>
          {/* 3D 堆叠预览区 */}
          {dueCards.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-text-tertiary text-sm mb-6">
              所有卡片已复习 ✓
            </div>
          ) : (
            <div className="relative h-52 flex items-center justify-center mb-6 rounded-xl bg-gradient-to-b from-gray-50 to-gray-100/50 dark:from-transparent dark:to-transparent mx-auto max-w-lg" style={{ perspective: '1200px' }}>
              {/* 标题提示 */}
              <div className="absolute top-0 left-4 text-xs font-medium text-text-secondary z-20">
                待复习 · {dueCards.length} 张
              </div>

              {dueCards.slice(0, 5).map((card, i) => {
                const bgClasses = [
                  'bg-white dark:bg-[#242830]',
                  'bg-blue-50/80 dark:bg-[#1E2228]',
                  'bg-blue-100/60 dark:bg-[#1A1D23]/80',
                  'bg-blue-100/40 dark:bg-[#1A1D23]/50',
                  'bg-blue-100/40 dark:bg-[#1A1D23]/50',
                ];
                const borderClasses = [
                  'border-l-[3px] border-l-brand-500 border border-gray-200 dark:border-border-subtle',
                  'border border-blue-200/60 dark:border-border-subtle/60',
                  'border border-blue-200/40 dark:border-border-subtle/30',
                  'border border-blue-200/30 dark:border-border-subtle/20',
                  'border border-blue-200/20 dark:border-border-subtle/20',
                ];
                const shadowStyles = [
                  '0 8px 28px rgba(0,0,0,0.14)',
                  '0 4px 16px rgba(0,0,0,0.08)',
                  '0 2px 8px rgba(0,0,0,0.04)',
                  '0 1px 4px rgba(0,0,0,0.02)',
                  '0 1px 2px rgba(0,0,0,0.01)',
                ];
                // dark shadows handled via dark:* tailwind on container where possible
                const depthY = [0, -10, -20, -28, -34];
                const depthScale = [1, 0.92, 0.85, 0.80, 0.76];
                const depthRotateX = [0, 4, 7, 9, 11];

                return (
                <motion.div
                  key={card.id}
                  className={cn(
                    'absolute w-80 h-36 rounded-xl',
                    bgClasses[i] ?? bgClasses[4],
                    borderClasses[i] ?? borderClasses[4],
                  )}
                  style={{
                    transformStyle: 'preserve-3d',
                    zIndex: 10 - i,
                    boxShadow: shadowStyles[i] ?? shadowStyles[4],
                  }}
                  initial={{
                    y: depthY[i],
                    scale: depthScale[i],
                    rotateX: depthRotateX[i],
                    opacity: i === 0 ? 1 : Math.max(0.45, 0.75 - i * 0.08),
                  }}
                  animate={{
                    y: depthY[i],
                    scale: depthScale[i],
                    rotateX: depthRotateX[i],
                    opacity: i === 0 ? 1 : Math.max(0.45, 0.75 - i * 0.08),
                  }}
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
                {dueCards.slice(0, 5).map((_, i) => (
                  <div key={i} className="w-10 h-[2px] rounded-full bg-gray-300/60 dark:bg-border-subtle/40" />
                ))}
              </div>
            </div>
          )}
          <motion.div
            className="flex flex-col gap-kb-sm"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } } }}
          >
            {cards.map((card) => {
              // 进化阶段视觉标记
              const isNew = card.repetitions === 0;
              const isMastered = card.interval >= 21 && card.repetitions >= 5;
              const evolutionClass = isNew
                ? 'border-l-2 border-l-brand-300/50'
                : isMastered
                  ? 'border-l-2 border-l-emerald-400/70 shadow-[0_0_8px_rgba(16,185,129,0.12)]'
                  : 'border-l-2 border-l-amber-400/50';

              return (
              <motion.div key={card.id}
                variants={{ hidden: { opacity: 0, x: -16, scale: 0.96 }, visible: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 28 } } }}
                whileHover={prefersReduced ? undefined : { y: -3, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
                whileTap={prefersReduced ? undefined : { scale: 0.98, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
              >
              <Card
                padding="sm"
                className={cn('flex items-center gap-3', evolutionClass)}
                onContextMenu={(e) => ctxHandleMenu(e, card)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-b2 font-medium text-text-primary truncate">{card.front}</p>
                  <div className="flex items-center gap-3 mt-1 text-c1 text-text-tertiary">
                    <span>EF: {card.easeFactor.toFixed(2)}</span>
                    <span>间隔: {card.interval}d</span>
                    <span>连续: {card.repetitions}</span>
                    {isNew && (
                      <Tag color="brand" className="text-[10px] px-1.5 py-0">新卡</Tag>
                    )}
                    {isMastered && (
                      <Tag color="flashcard" className="text-[10px] px-1.5 py-0">已掌握</Tag>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {card.sourceNoteId && (
                    <button
                      onClick={() => navigate(`/notes/${card.sourceNoteId}`)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-c1 text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all duration-kb-fast"
                      aria-label="查看上下文"
                      title="查看来源笔记"
                    >
                      <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                      查看上下文
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(card)}
                    className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
                    aria-label="编辑卡片"
                  >
                    <Pencil className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => setDeleteCardId(card.id ?? null)}
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
          </>
        )}
      </div>

      {/* 底部固定按钮 */}
      <div className="flex-shrink-0 px-kb-md py-3 border-t border-border/50">
        <Button
          size="lg"
          className="w-full"
          disabled={!canStudy}
          onClick={() => navigate(`/flashcards/${deckId}/study`)}
        >
          {canStudy ? `开始学习（${stats.due + stats.newCards} 张）` : '暂无可学习卡片'}
        </Button>
      </div>

      {/* 添加/编辑卡片 Modal */}
      <Modal
        open={cardModalOpen}
        onClose={() => { setCardModalOpen(false); setEditingCardId(null); }}
        title={editingCardId !== null ? '编辑卡片' : '添加卡片'}
        description={editingCardId !== null ? '修改卡片正面和背面内容' : '创建一张新的基础卡片'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCardModalOpen(false); setEditingCardId(null); }}>
              取消
            </Button>
            <Button
              onClick={handleSaveCard}
              loading={saving}
              disabled={!cardFront.trim() || !cardBack.trim()}
            >
              {editingCardId !== null ? '保存' : '添加'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-kb-md">
          <Input
            label="正面（问题）"
            placeholder="输入卡片正面的问题或概念"
            value={cardFront}
            onChange={(e) => setCardFront(e.target.value)}
            autoFocus
          />
          <Input
            label="背面（答案）"
            placeholder="输入卡片背面的答案或解释"
            value={cardBack}
            onChange={(e) => setCardBack(e.target.value)}
          />
        </div>
      </Modal>

      {/* AI 生成闪卡 Modal */}
      <Modal
        open={aiModalOpen}
        onClose={() => setAIModalOpen(false)}
        title="AI 生成闪卡"
        description="输入知识内容，AI 将自动生成闪卡"
        size="lg"
        footer={
          aiGeneratedCards.length === 0 ? (
            <>
              <Button variant="secondary" onClick={() => setAIModalOpen(false)}>取消</Button>
              <Button
                onClick={() => {
                  if (!aiInputContent.trim()) {
                    toast({ type: 'warning', message: '请输入一些内容再生成闪卡' });
                    return;
                  }
                  generate(aiInputContent)
                    .then((result) => {
                      if (result) setAIGeneratedCards(result.cards);
                    })
                    .catch(handleAIGenerateError);
                }}
                loading={aiLoading}
                disabled={!aiInputContent.trim()}
                icon={<Sparkles className="w-icon-sm h-icon-sm" />}
              >
                生成闪卡
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setAIModalOpen(false)}>关闭</Button>
          )
        }
      >
        <div className="flex flex-col gap-kb-md">
          {aiGeneratedCards.length === 0 ? (
            <>
              <div>
                <label className="text-b2 font-medium text-text-primary mb-kb-xs block">知识内容</label>
                <textarea
                  value={aiInputContent}
                  onChange={(e) => setAIInputContent(e.target.value)}
                  placeholder="粘贴或输入笔记、教材内容等，AI 将提取关键信息生成闪卡…"
                  className={cn(
                    'w-full min-h-[120px] p-kb-md bg-bg-secondary border border-border/50 rounded-kb-md',
                    'text-b2 text-text-primary placeholder:text-text-tertiary/60',
                    'outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20',
                    'resize-y',
                  )}
                />
              </div>
              {aiError && (
                <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                  {aiError}
                  {aiNeedsConfig && (
                    <button
                      onClick={() => { setAIModalOpen(false); navigate('/settings'); }}
                      className="mt-2 block text-b3 underline hover:no-underline"
                    >
                      前往设置页配置 API Key
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-kb-sm kb-ai-result-enter">
              <p className="text-b2 text-text-tertiary mb-1">
                生成 {aiGeneratedCards.length} 张闪卡，点击「添加到卡组」将其加入当前牌组：
              </p>
              {aiGeneratedCards.map((card, idx) => (
                <Card key={idx} padding="sm" className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-b2 font-medium text-text-primary">{card.front}</p>
                    <p className="text-b3 text-text-secondary mt-0.5">{card.back}</p>
                    {card.hint && <p className="text-c1 text-text-tertiary mt-0.5 italic">提示：{card.hint}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Check className="w-icon-sm h-icon-sm" />}
                    disabled={aiAddingIndex === idx}
                    onClick={() => {
                      setAIAddingIndex(idx);
                      createCard({
                        deckId: deckId!,
                        front: card.front,
                        back: card.back,
                        type: 'basic',
                      })
                        .then(() => toast({ type: 'success', message: '卡片已添加' }))
                        .catch(() => toast({ type: 'error', message: '添加失败' }))
                        .finally(() => setAIAddingIndex(null));
                    }}
                  >
                    {aiAddingIndex === idx ? '添加中…' : '添加到卡组'}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* 右键菜单 */}
      {ctxOpen && ctxCard && (
        <ContextMenu
          groups={cardMenuGroups}
          position={ctxPos}
          context={ctxCard}
          onSelect={handleCardSelect}
          onClose={ctxClose}
        />
      )}

      {/* 删除卡片确认 Modal */}
      <Modal
        open={deleteCardId !== null}
        onClose={() => setDeleteCardId(null)}
        title="删除卡片"
        description={`确定要删除卡片「${deleteTargetCard?.front?.slice(0, 30) ?? ''}」吗？该操作不可撤销。`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteCardId(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              onClick={handleDeleteCard}
            >
              删除
            </Button>
          </>
        }
      >
        <div />
      </Modal>
    </div>
  );
}
