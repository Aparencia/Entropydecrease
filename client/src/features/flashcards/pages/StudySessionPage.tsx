/**
 * 闪卡学习会话页
 *
 * @ai-context: 2026-07 拆分后的组合层。卡片交互时序（翻转门控/退出动画/
 * 拖拽评分）见 useCardInteraction，选择器见 useStudySessionSelectors，右键
 * 菜单见 useSessionContextMenu，卡片主体区见 SessionCardStage，弹窗组合见
 * SessionModals，间隔建议见 lib/intervalSuggest。
 * @ai-context: Assembly layer after the 2026-07 split. Interaction timing
 * lives in useCardInteraction; selectors in useStudySessionSelectors; the
 * context menu in useSessionContextMenu; the card body in SessionCardStage;
 * the modal group in SessionModals; interval hints in lib/intervalSuggest.
 * @ai-context: SM2 流程——进入即 startSession 装载到期卡；评分后 store 计算
 * 下次间隔并推进 currentIndex；会话结束（isActive 转 false 且已完成>0）弹出
 * 统计。右键菜单提供搁置（dueDate 推后一年）/标记困难（easeFactor -0.2，
 * 下限 1.3）/AI 优化。
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, useToast } from '@/components/ui';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { X, BookOpen } from 'lucide-react';
import { useStudySessionStore } from '../store/useStudySessionStore';
import { useContextMenu } from '@/lib/contextMenu/useContextMenu';
import type { DifficultyTier } from '@/lib/scheduler';
import type { Flashcard } from '@/types/models';
import { useAIOptimizeCard } from '@/lib/ai/useAI';
import { useAIMnemonic } from '@/lib/ai/hooks/useAIMnemonic';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SessionHeader } from '../components/SessionHeader';
import { RatingBar } from '../components/RatingBar';
import { MemoryStrengthPulse } from '../components/MemoryStrengthPulse';
import { ModeSelector } from '../components/ModeSelector';
import { SessionCardStage } from '../components/SessionCardStage';
import { SessionModals } from '../components/SessionModals';
import { useCardInteraction } from '../hooks/useCardInteraction';
import { useSessionContextMenu } from '../hooks/useSessionContextMenu';
import { useStudySessionSelectors } from '../hooks/useStudySessionSelectors';
import { suggestIntervalValues } from '../lib/intervalSuggest';
import type { ReviewMode } from '../lib/reviewMode';
import { ttsController } from '@/features/assistant/lib/ttsController';

export default function StudySessionPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  // F3 睡前迷你复习：?mini=N 限制会话卡数（hash 路由 search 在 hash 内解析）
  const searchParams = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const miniLimit = Number(searchParams.get('mini') ?? 0) || undefined;

  // M15: 细粒度订阅——每个字段单独订阅（见 useStudySessionSelectors），
  // 避免整 store 订阅导致重型子组件（卡片舞台/录音等）被无关字段重渲染
  const {
    sessionCards, currentIndex, isFlipped, completedCount, correctCount, isActive, goldenErrors,
    startSession, rateCard, flipCard, endSession, relearn,
    lastStabilityBefore, lastStabilityAfter, lastRating, showStrengthPulse,
    reviewMode, setReviewMode, selectDeck, loadCards, updateCard,
  } = useStudySessionSelectors();

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
  // P2 记忆术徽章：右键菜单懒加载生成（点击才调用，控 AI 用量）
  const { mnemonic: mnemonicData, loading: mnemonicLoading, error: mnemonicError, generateMnemonic } = useAIMnemonic();
  const [showMnemonicModal, setShowMnemonicModal] = useState(false);
  // 难度阶梯弹窗：右键菜单「🎯 难度阶梯」展示当前卡的自适应挑战档位
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);

  const total = sessionCards.length;
  const current = sessionCards[currentIndex];
  const isComplete = !isActive && completedCount > 0;

  // 右键菜单
  const {
    isOpen: ctxOpen,
    position: ctxPos,
    context: ctxCard,
    handleContextMenu: ctxHandleMenu,
    close: ctxClose,
  } = useContextMenu<Flashcard>();

  const sessionMenu = useSessionContextMenu({
    current,
    updateCard,
    aiOptimize,
    generateMnemonic,
    onOptimizeModal: () => setShowOptimizeModal(true),
    onMnemonicModal: () => setShowMnemonicModal(true),
    onDifficultyModal: () => setShowDifficultyModal(true),
  });

  const ci = useCardInteraction({
    current, currentIndex, isFlipped, prefersReduced, rateCard, relearn,
  });

  /** 难度阶梯升阶：把建议档位写入当前卡（复习流后续按此档位驱动） */
  const handleDifficultyPromote = (tier: DifficultyTier) => {
    if (!current) return;
    updateCard(current.id, { difficultyTier: tier });
    toast({ type: 'success', message: `已升阶至「${tier === 'master' ? '大师档' : tier === 'challenge' ? '挑战档' : '基础档'}」，等下次复习验收` });
  };

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

  // P0-5：calculateIntervals 每次渲染执行 4 次 sm2 计算，memo 化到当前卡变化
  const intervalValues = useMemo(() => suggestIntervalValues(current), [current]);

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
      <SessionCardStage
        current={current}
        isFlipped={isFlipped}
        reviewMode={reviewMode}
        isComplete={isComplete}
        completedCount={completedCount}
        sessionMastered={ci.sessionMastered}
        goldenErrors={goldenErrors}
        prefersReduced={prefersReduced}
        optimizeLoading={optimizeLoading}
        ci={ci}
        onFlip={flipCard}
        onOptimize={handleOptimizeClick}
        onRestart={handleRestart}
        onFinish={handleFinish}
        onRelearn={() => relearn()}
        onOpenSourceNote={(noteId) => navigate(`/notes/${noteId}`)}
        onContextMenu={ctxHandleMenu}
      />

      {/* 右键菜单 */}
      {ctxOpen && ctxCard && (
        <ContextMenu
          groups={sessionMenu.groups}
          position={ctxPos}
          context={ctxCard}
          onSelect={sessionMenu.handleSelect}
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

      {/* 弹窗组合：AI 优化 / 记忆术 / 难度阶梯 / 完成统计 */}
      <SessionModals
        showOptimizeModal={showOptimizeModal}
        optimizeData={optimizeData}
        optimizeLoading={optimizeLoading}
        optimizeError={optimizeError}
        showMnemonicModal={showMnemonicModal}
        mnemonicLoading={mnemonicLoading}
        mnemonicError={mnemonicError}
        mnemonicData={mnemonicData}
        showDifficultyModal={showDifficultyModal}
        current={current}
        showSummary={showSummary}
        completedCount={completedCount}
        total={total}
        correctRate={correctRate}
        sessionMastered={ci.sessionMastered}
        onAdoptSuggestion={handleAdoptSuggestion}
        onDismissOptimize={() => setShowOptimizeModal(false)}
        onCloseMnemonic={() => setShowMnemonicModal(false)}
        onPromoteTier={handleDifficultyPromote}
        onCloseDifficulty={() => setShowDifficultyModal(false)}
        onRestart={handleRestart}
        onFinish={handleFinish}
      />
    </div>
  );
}
