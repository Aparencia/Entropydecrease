/**
 * 闪卡学习会话页
 *
 * @ai-context: 2026-07 拆分后的组合层。卡片交互时序（翻转门控/退出动画/
 * 拖拽评分）见 useCardInteraction，卡片舞台/评分区/两个弹窗为独立组件。
 * @ai-context: SM2 流程——进入即 startSession 装载到期卡；评分后 store 计算
 * 下次间隔并推进 currentIndex；会话结束（isActive 转 false 且已完成>0）弹出
 * 统计。右键菜单提供搁置（dueDate 推后一年）/标记困难（easeFactor -0.2，
 * 下限 1.3）/AI 优化。
 */
import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, useToast } from '@/components/ui';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { ContextMenu, type ContextMenuGroup } from '@/components/ui/ContextMenu';
import { X, BookOpen, PauseCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { useStudySessionStore } from '../store/useStudySessionStore';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '@/lib/contextMenu/useContextMenu';
import { calculateIntervals } from '@/lib/sm2';
import type { Flashcard } from '@/types/models';
import { useAIOptimizeCard } from '@/lib/ai/useAI';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { CardStage, SessionCompleteView } from '../components/CardStage';
import { SessionHeader } from '../components/SessionHeader';
import { RatingBar } from '../components/RatingBar';
import { MemoryStrengthPulse } from '../components/MemoryStrengthPulse';
import { OptimizeSuggestionModal, SessionSummaryModal } from '../components/StudySessionModals';
import { useCardInteraction } from '../hooks/useCardInteraction';

const sessionMenuGroups: ContextMenuGroup[] = [
  {
    label: '学习操作',
    items: [
      { key: 'suspend', label: '搁置当前卡', icon: <PauseCircle className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'mark-hard', label: '标记困难', icon: <AlertTriangle className="w-4 h-4" strokeWidth={1.5} /> },
    ],
  },
  {
    label: 'AI 操作',
    items: [
      { key: 'ai-optimize', label: 'AI 优化卡片内容', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
    ],
  },
];

export default function StudySessionPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const {
    sessionCards, currentIndex, isFlipped, completedCount, correctCount,
    isActive, goldenErrors, startSession, rateCard, flipCard, endSession, relearn,
    lastStabilityBefore, lastStabilityAfter, lastRating, showStrengthPulse,
  } = useStudySessionStore(useShallow(s => s));

  const { selectDeck, loadCards, updateCard } = useFlashcardStore(useShallow(s => s));
  const { toast } = useToast();
  const {
    optimize: aiOptimize,
    data: optimizeData,
    loading: optimizeLoading,
    error: optimizeError,
  } = useAIOptimizeCard();

  const prefersReduced = useReducedMotion();
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const total = sessionCards.length;
  const current = sessionCards[currentIndex];
  const isComplete = !isActive && completedCount > 0;

  const ci = useCardInteraction({
    current, currentIndex, isFlipped, prefersReduced, rateCard, relearn,
  });

  // 右键菜单
  const {
    isOpen: ctxOpen,
    position: ctxPos,
    context: ctxCard,
    handleContextMenu: ctxHandleMenu,
    close: ctxClose,
  } = useContextMenu<Flashcard>();

  const handleSessionSelect = useCallback(async (itemKey: string, card: Flashcard) => {
    switch (itemKey) {
      case 'suspend': {
        const farFuture = new Date();
        farFuture.setFullYear(farFuture.getFullYear() + 1);
        updateCard(card.id, { dueDate: farFuture });
        toast({ type: 'success', message: '卡片已搁置，请继续学习其他卡片' });
        break;
      }
      case 'mark-hard': {
        const newEaseFactor = Math.max(1.3, card.easeFactor - 0.2);
        updateCard(card.id, { lapses: card.lapses + 1, easeFactor: newEaseFactor });
        toast({ type: 'success', message: '已标记为困难卡片，后续会更频繁复习' });
        break;
      }
      case 'ai-optimize': {
        await aiOptimize(card.front, card.back);
        setShowOptimizeModal(true);
        break;
      }
    }
  }, [updateCard, toast, aiOptimize]);

  useEffect(() => {
    if (deckId) {
      selectDeck(deckId);
      loadCards(deckId).then(() => {
        startSession(deckId);
      });
    }
  }, [deckId, selectDeck, loadCards, startSession]);

  useEffect(() => {
    if (isComplete) setShowSummary(true);
  }, [isComplete]);

  const correctRate = completedCount > 0 ? Math.round((correctCount / completedCount) * 100) : 0;
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const intervals = current
    ? calculateIntervals({
        easeFactor: current.easeFactor,
        interval: current.interval,
        repetitions: current.repetitions,
      })
    : null;
  const intervalValues = intervals
    ? [intervals.again, intervals.hard, intervals.good, intervals.easy]
    : [1, 1, 1, 1];

  const handleRestart = () => {
    setShowSummary(false);
    endSession();
    if (deckId) startSession(deckId);
  };

  const handleFinish = () => {
    setShowSummary(false);
    endSession();
    navigate(`/flashcards/${deckId}`);
  };

  const handleOptimizeClick = async () => {
    if (!current) return;
    await aiOptimize(current.front, current.back);
    setShowOptimizeModal(true);
  };

  const handleAdoptSuggestion = () => {
    if (!current || !optimizeData) return;
    updateCard(current.id, {
      front: optimizeData.suggestedFront,
      back: optimizeData.suggestedBack,
    });
    setShowOptimizeModal(false);
    toast({ type: 'success', message: '已更新卡片内容' });
  };

  // 无可学习卡片
  if (total === 0 && !isActive) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-kb-sm px-kb-md py-3 flex-shrink-0">
          <button
            onClick={() => navigate(`/flashcards/${deckId}`)}
            className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
          >
            <X className="w-icon-md h-icon-md" strokeWidth={1.5} />
          </button>
          <ModuleRitualHeader title="学习" sealChar="呼" sealColor="#7BC4B8" compact />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<BookOpen className="w-12 h-12" strokeWidth={1.2} />}
            title="暂无可学习卡片"
            description="当前牌组没有到期卡片或新卡片，请先添加一些卡片"
            action={
              <Button variant="secondary" onClick={() => navigate(`/flashcards/${deckId}`)}>
                返回牌组
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <SessionHeader
        completedCount={completedCount}
        total={total}
        progress={progress}
        sessionMastered={ci.sessionMastered}
        showPlusOne={ci.showPlusOne}
        onClose={() => navigate(`/flashcards/${deckId}`)}
      />

      {/* 卡片主体 */}
      <div
        className="flex-1 flex items-center justify-center px-kb-md overflow-hidden"
        onContextMenu={(e) => { if (current) ctxHandleMenu(e, current); }}
      >
        {!isComplete && current ? (
          <CardStage
            card={current}
            isFlipped={isFlipped}
            entering={ci.entering}
            exiting={ci.exiting}
            exitDir={ci.exitDir}
            cardGlow={ci.cardGlow}
            prefersReduced={prefersReduced}
            dragX={ci.dragX}
            dragActive={ci.dragActive}
            dragOverlayRed={ci.dragOverlayRed}
            dragOverlayGreen={ci.dragOverlayGreen}
            optimizeLoading={optimizeLoading}
            onFlip={flipCard}
            onFlipEnd={() => ci.setFlipDone(true)}
            onDragStart={ci.handleDragStart}
            onDrag={ci.handleDrag}
            onDragEnd={ci.handleDragEnd}
            onOpenSourceNote={(noteId) => navigate(`/notes/${noteId}`)}
            onOptimize={handleOptimizeClick}
          />
        ) : (
          <SessionCompleteView
            completedCount={completedCount}
            sessionMastered={ci.sessionMastered}
            goldenErrors={goldenErrors}
            onRestart={handleRestart}
            onFinish={handleFinish}
            onRelearn={() => relearn()}
          />
        )}
      </div>

      {/* 右键菜单 */}
      {ctxOpen && ctxCard && (
        <ContextMenu
          groups={sessionMenuGroups}
          position={ctxPos}
          context={ctxCard}
          onSelect={handleSessionSelect}
          onClose={ctxClose}
        />
      )}

      {/* v0.29: 记忆强度微动画 */}
      {!isComplete && (
        <div className="flex justify-center">
          <MemoryStrengthPulse
            stabilityBefore={lastStabilityBefore ?? 0}
            stabilityAfter={lastStabilityAfter ?? 0}
            rating={lastRating ?? 2}
            visible={showStrengthPulse}
            onFadeComplete={() => useStudySessionStore.setState({ showStrengthPulse: false })}
          />
        </div>
      )}

      {/* 底部评分区 */}
      {!isComplete && current && (
        <RatingBar
          ready={ci.flipDone && isFlipped}
          intervalValues={intervalValues}
          confidence={ci.confidence}
          hoveredRating={ci.hoveredRating}
          prefersReduced={prefersReduced}
          onConfidenceChange={ci.setConfidence}
          onHoverRating={ci.setHoveredRating}
          onRate={ci.handleRate}
          onRelearn={ci.handleRelearn}
          onFlip={flipCard}
        />
      )}

      {showOptimizeModal && (
        <OptimizeSuggestionModal
          data={optimizeData}
          loading={optimizeLoading}
          error={optimizeError}
          onAdopt={handleAdoptSuggestion}
          onDismiss={() => setShowOptimizeModal(false)}
        />
      )}

      {showSummary && (
        <SessionSummaryModal
          completedCount={completedCount}
          total={total}
          correctRate={correctRate}
          sessionMastered={ci.sessionMastered}
          onRestart={handleRestart}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}
