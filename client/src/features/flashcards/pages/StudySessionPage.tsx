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
import { X, BookOpen, PauseCircle, AlertTriangle, Sparkles, Tablet } from 'lucide-react';
import { useStudySessionStore } from '../store/useStudySessionStore';
import { useFlashcardStore } from '../store/useFlashcardStore';
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
import { ModeSelector } from '../components/ModeSelector';
import { AudioReviewMode } from '../components/AudioReviewMode';
import { WritingReviewMode } from '../components/WritingReviewMode';
import { SpeakingReviewMode } from '../components/SpeakingReviewMode';
import { SituationalReviewMode } from '../components/SituationalReviewMode';
import { extractPlainText, type ReviewMode } from '../lib/reviewMode';
import { ttsController } from '@/features/assistant/lib/ttsController';

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
  // F3 睡前迷你复习：?mini=N 限制会话卡数（hash 路由 search 在 hash 内解析）
  const searchParams = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const miniLimit = Number(searchParams.get('mini') ?? 0) || undefined;

  // M15: 细粒度订阅——整 store 订阅（useShallow(s => s)）会在任何字段变化时重渲染
  // 重型子组件（卡片舞台/录音等），改为每个用到的字段单独订阅
  const sessionCards = useStudySessionStore((s) => s.sessionCards);
  const currentIndex = useStudySessionStore((s) => s.currentIndex);
  const isFlipped = useStudySessionStore((s) => s.isFlipped);
  const completedCount = useStudySessionStore((s) => s.completedCount);
  const correctCount = useStudySessionStore((s) => s.correctCount);
  const isActive = useStudySessionStore((s) => s.isActive);
  const goldenErrors = useStudySessionStore((s) => s.goldenErrors);
  const startSession = useStudySessionStore((s) => s.startSession);
  const rateCard = useStudySessionStore((s) => s.rateCard);
  const flipCard = useStudySessionStore((s) => s.flipCard);
  const endSession = useStudySessionStore((s) => s.endSession);
  const relearn = useStudySessionStore((s) => s.relearn);
  const lastStabilityBefore = useStudySessionStore((s) => s.lastStabilityBefore);
  const lastStabilityAfter = useStudySessionStore((s) => s.lastStabilityAfter);
  const lastRating = useStudySessionStore((s) => s.lastRating);
  const showStrengthPulse = useStudySessionStore((s) => s.showStrengthPulse);
  const reviewMode = useStudySessionStore((s) => s.reviewMode);
  const setReviewMode = useStudySessionStore((s) => s.setReviewMode);

  const selectDeck = useFlashcardStore((s) => s.selectDeck);
  const loadCards = useFlashcardStore((s) => s.loadCards);
  const updateCard = useFlashcardStore((s) => s.updateCard);
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
        startSession(deckId, miniLimit);
      });
    }
  }, [deckId, selectDeck, loadCards, startSession, miniLimit]);

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

  // 3.5 多感官复习：切换模式——离开听力模式停止 TTS；翻面状态回到正面
  const handleModeChange = (mode: ReviewMode) => {
    if (mode === reviewMode) return;
    ttsController.stop();
    if (isFlipped) flipCard();
    setReviewMode(mode);
  };

  // 3.18 电子墨水学习板：次窗口展示当前卡片（仅在 Electron 环境可用）
  const handleEinkShow = () => {
    if (!current) return;
    const api = window.electronAPI;
    if (!api) {
      toast({ type: 'warning', message: '墨水屏复习仅在桌面应用（Electron）中可用' });
      return;
    }
    // M15: 非 Electron 或窗口创建失败时优雅降级（toast 提示），避免 unhandled rejection
    api.invoke('eink:show-card', {
      id: current.id,
      front: extractPlainText(current.front),
      back: extractPlainText(current.back),
    }).catch(() => {
      toast({ type: 'warning', message: '墨水屏窗口打开失败，请在桌面应用中重试' });
    });
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

      {/* 3.5 多感官复习：模式切换栏（阅读为默认） */}
      <ModeSelector mode={reviewMode} onChange={handleModeChange} />

      {/* 卡片主体 */}
      <div
        className="relative flex-1 flex items-center justify-center px-kb-md overflow-hidden"
        onContextMenu={(e) => { if (current) ctxHandleMenu(e, current); }}
      >
        {/* 3.18 墨水屏复习：Electron 次窗口展示当前卡片 */}
        {!isComplete && current && (
          <button
            type="button"
            onClick={handleEinkShow}
            className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-kb-full text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary border border-border-subtle bg-bg-elevated/70 transition-colors"
            title="在墨水屏窗口复习当前卡片"
          >
            <Tablet className="w-4 h-4" strokeWidth={1.5} />
            墨水屏复习
          </button>
        )}
        {!isComplete && current ? (
          reviewMode === 'reading' ? (
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
          ) : reviewMode === 'listening' ? (
            <div key={current.id} className="w-full animate-fade-in-up">
              <AudioReviewMode
                card={current}
                isFlipped={isFlipped}
                onFlip={flipCard}
                onFlipEnd={() => ci.setFlipDone(true)}
              />
            </div>
          ) : reviewMode === 'writing' ? (
            <div key={current.id} className="w-full animate-fade-in-up">
              <WritingReviewMode
                card={current}
                isFlipped={isFlipped}
                onFlip={flipCard}
                onFlipEnd={() => ci.setFlipDone(true)}
              />
            </div>
          ) : reviewMode === 'speaking' ? (
            <div key={current.id} className="w-full animate-fade-in-up">
              <SpeakingReviewMode
                card={current}
                isFlipped={isFlipped}
                onFlip={flipCard}
                onFlipEnd={() => ci.setFlipDone(true)}
              />
            </div>
          ) : (
            <div key={current.id} className="w-full animate-fade-in-up">
              <SituationalReviewMode
                card={current}
                isFlipped={isFlipped}
                onFlip={flipCard}
                onFlipEnd={() => ci.setFlipDone(true)}
              />
            </div>
          )
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
