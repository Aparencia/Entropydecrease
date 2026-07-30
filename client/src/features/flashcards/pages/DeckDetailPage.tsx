/**
 * 卡组详情页
 *
 * @ai-context: 2026-07 拆分后的组合层。顶栏见 DeckDetailHeader，3D 堆叠
 * 预览见 DueCardStack，统计行与列表见 DeckCardList，三个弹窗见 DeckModals，
 * 卡片 CRUD/导出/AI 生成见 useDeckCards。
 * @ai-context: 右键菜单语义——重学=重置 SM2 状态（createNewCardState）使卡片
 * 立即可学；搁置=到期日推后一年；删除走二次确认。
 */
import { useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Skeleton, useToast } from '@/components/ui';
import { ContextMenu, type ContextMenuGroup } from '@/components/ui/ContextMenu';
import { BookOpen, Plus, Pencil, Trash2, PauseCircle, RotateCcw } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '@/lib/contextMenu/useContextMenu';
import type { Flashcard } from '@/types/models';
import { createNewCardState } from '@/lib/sm2';
import { DueCardStack } from '../components/DueCardStack';
import { DeckStatsRow, DeckCardList } from '../components/DeckCardList';
import { DeckDetailHeader } from '../components/DeckDetailHeader';
import { CardEditModal, AIGenerateModal, DeleteCardModal } from '../components/DeckModals';
import { useDeckCards } from '../hooks/useDeckCards';

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

export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const {
    decks, cards, isLoading,
    loadCards, selectDeck, loadDecks, createCard, updateCard, deleteCard, getDeckStats,
  } = useFlashcardStore(useShallow(s => s));

  const deck = decks.find((d) => d.id === deckId);
  const { toast } = useToast();
  const prefersReduced = useReducedMotion();

  const dc = useDeckCards({
    deckId,
    deckName: deck?.name,
    createCard,
    updateCard,
    deleteCard,
  });

  const {
    isOpen: ctxOpen,
    position: ctxPos,
    context: ctxCard,
    handleContextMenu: ctxHandleMenu,
    close: ctxClose,
  } = useContextMenu<Flashcard>();

  const handleCardSelect = useCallback((itemKey: string, card: Flashcard) => {
    switch (itemKey) {
      case 'edit':
        dc.openEditModal(card);
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
        dc.setDeleteCardId(card.id ?? null);
        break;
    }
  }, [updateCard, toast, dc]);

  useEffect(() => {
    if (deckId) {
      loadDecks();
      selectDeck(deckId);
      loadCards(deckId);
    }
  }, [deckId, loadDecks, selectDeck, loadCards]);

  const stats = deckId ? getDeckStats(deckId) : { total: 0, due: 0, newCards: 0 };
  const canStudy = stats.due > 0 || stats.newCards > 0;

  // 待复习卡片（用于 3D 堆叠预览）：到期卡片 + 新卡
  const dueCards = useMemo(() => {
    const now = new Date();
    return cards.filter((c) => new Date(c.dueDate) <= now || c.repetitions === 0);
  }, [cards]);

  const deleteTargetCard = cards.find((c) => c.id === dc.deleteCardId);

  return (
    <div className="flex flex-col h-full">
      <DeckDetailHeader
        deckName={deck?.name}
        deckColor={deck?.color}
        aiLoading={dc.aiLoading}
        exporting={dc.exporting}
        onBack={() => navigate('/flashcards')}
        onAddCard={dc.openAddModal}
        onOpenAIGenerate={dc.openAIModal}
        onExport={dc.handleExport}
      />

      <DeckStatsRow stats={stats} />

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
                onClick={dc.openAddModal}
              >
                添加卡片
              </Button>
            }
          />
        ) : (
          <>
            <DueCardStack dueCards={dueCards} prefersReduced={prefersReduced} />
            <DeckCardList
              cards={cards}
              prefersReduced={prefersReduced}
              onContextMenu={ctxHandleMenu}
              onEdit={dc.openEditModal}
              onDelete={dc.setDeleteCardId}
              onOpenSourceNote={(noteId) => navigate(`/notes/${noteId}`)}
            />
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

      <CardEditModal
        open={dc.cardModalOpen}
        editingCardId={dc.editingCardId}
        front={dc.cardFront}
        back={dc.cardBack}
        saving={dc.saving}
        onFrontChange={dc.setCardFront}
        onBackChange={dc.setCardBack}
        onClose={dc.closeCardModal}
        onSave={dc.handleSaveCard}
      />

      <AIGenerateModal
        open={dc.aiModalOpen}
        inputContent={dc.aiInputContent}
        generatedCards={dc.aiGeneratedCards}
        loading={dc.aiLoading}
        error={dc.aiError}
        needsConfig={dc.aiNeedsConfig}
        addingIndex={dc.aiAddingIndex}
        onInputChange={dc.setAIInputContent}
        onClose={() => dc.setAIModalOpen(false)}
        onGenerate={dc.handleAIGenerate}
        onAddCard={dc.handleAddGeneratedCard}
        onGoSettings={() => { dc.setAIModalOpen(false); navigate('/settings'); }}
      />

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

      <DeleteCardModal
        open={dc.deleteCardId !== null}
        cardFront={deleteTargetCard?.front}
        onClose={() => dc.setDeleteCardId(null)}
        onConfirm={dc.handleDeleteCard}
      />
    </div>
  );
}
