import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Button, EmptyState, useToast } from '@/components/ui';
import { ContextMenu, type ContextMenuGroup } from '@/components/ui/ContextMenu';
import { FlipCard, type FlipCardGlow } from '../components/FlipCard';
import { ConfidenceSelector } from '../components/ConfidenceSelector';
import { GoldenErrorPanel } from '../components/GoldenErrorPanel';
import { X, RotateCcw, BookOpen, PauseCircle, AlertTriangle, Sparkles, ExternalLink, Check, XIcon, Star } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useStudySessionStore } from '../store/useStudySessionStore';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '@/lib/contextMenu/useContextMenu';
import { Rating, calculateIntervals } from '@/lib/sm2';
import type { Flashcard, Confidence } from '@/types/models';
import { useAIFlashcards, useAIOptimizeCard } from '@/lib/ai/useAI';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const ENTER_ANIMATION_DURATION_MS = 300;
const PLUS_ONE_ANIMATION_DURATION_MS = 800;

function formatInterval(days: number): string {
  if (days === 0) return '<1d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

const ratingStyles = [
  { label: 'Again', rating: Rating.Again, color: 'bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700', glow: 'shadow-[0_4px_16px_rgba(244,63,94,0.35)]' },
  { label: 'Hard', rating: Rating.Hard, color: 'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700', glow: 'shadow-[0_4px_16px_rgba(245,158,11,0.3)]' },
  { label: 'Good', rating: Rating.Good, color: 'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700', glow: 'shadow-[0_4px_16px_rgba(16,185,129,0.3)]' },
  { label: 'Easy', rating: Rating.Easy, color: 'bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700', glow: 'shadow-[0_4px_16px_rgba(59,130,246,0.3)]' },
];

export default function StudySessionPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const {
    sessionCards,
    currentIndex,
    isFlipped,
    completedCount,
    correctCount,
    isActive,
    goldenErrors,
    startSession,
    rateCard,
    flipCard,
    endSession,
    relearn,
  } = useStudySessionStore(useShallow(s => s));

  const { selectDeck, loadCards, updateCard } = useFlashcardStore(useShallow(s => s));
  const { toast } = useToast();
  const { generate: aiGenerate } = useAIFlashcards();
  const {
    optimize: aiOptimize,
    data: optimizeData,
    loading: optimizeLoading,
    error: optimizeError,
  } = useAIOptimizeCard();

  // Flip-completion gate
  const [flipDone, setFlipDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null);
  const [cardGlow, setCardGlow] = useState<FlipCardGlow>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [entering, setEntering] = useState(true);
  const prevIndexRef = useRef(currentIndex);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [sessionMastered, setSessionMastered] = useState(0);
  const [showPlusOne, setShowPlusOne] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  // v0.9.0: Confidence selector state
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  // Drag gesture state
  const prefersReduced = useReducedMotion();
  const dragX = useMotionValue(0);
  const [dragActive, setDragActive] = useState(false);
  const exitingRef = useRef(false);
  const dragOverlayRed = useTransform(dragX, [-200, -50, 0], [0.55, 0, 0]);
  const dragOverlayGreen = useTransform(dragX, [0, 50, 200], [0, 0, 0.55]);
  const [dragLabel, setDragLabel] = useState<'forgot' | 'remembered' | null>(null);

  useEffect(() => {
    if (!isFlipped) setFlipDone(false);
  }, [isFlipped]);

  useEffect(() => {
    if (prevIndexRef.current !== currentIndex) {
      setEntering(true);
      setFlipDone(false);
      setExiting(false);
      setExitDir(null);
      setCardGlow(null);
      exitingRef.current = false;
      prevIndexRef.current = currentIndex;
      const timer = setTimeout(() => setEntering(false), ENTER_ANIMATION_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [currentIndex]);

  // Context menu
  const {
    isOpen: ctxOpen,
    position: ctxPos,
    context: ctxCard,
    handleContextMenu: ctxHandleMenu,
    close: ctxClose,
  } = useContextMenu<Flashcard>();

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
    return () => {};
  }, [deckId, selectDeck, loadCards, startSession]);

  const total = sessionCards.length;
  const current = sessionCards[currentIndex];
  const isComplete = !isActive && completedCount > 0;

  useEffect(() => {
    if (isComplete) setShowSummary(true);
  }, [isComplete]);

  const correctRate = completedCount > 0 ? Math.round((correctCount / completedCount) * 100) : 0;

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

  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  useEffect(() => {
    exitingRef.current = exiting;
  }, [exiting]);

  const handleRelearn = () => {
    if (exitingRef.current || !current) return;
    relearn();
    setFlipDone(false);
    setExiting(false);
    exitingRef.current = false;
  };

  const handleRate = (rating: Rating) => {
    if (exitingRef.current) return;
    // v0.9.0: default to 'medium' if no confidence selected
    const effectiveConfidence = confidence ?? 'medium';
    if (current && current.repetitions === 0 && rating !== Rating.Again) {
      setSessionMastered((n) => n + 1);
      setShowPlusOne(true);
      setTimeout(() => setShowPlusOne(false), PLUS_ONE_ANIMATION_DURATION_MS);
    }
    setCardGlow(rating === Rating.Again ? 'wrong' : 'correct');
    setExitDir(rating === Rating.Again ? 'left' : 'right');
    setExiting(true);
    exitingRef.current = true;
    setTimeout(() => {
      setExiting(false);
      exitingRef.current = false;
      setFlipDone(false);
      setExitDir(null);
      setCardGlow(null);
      rateCard(rating, effectiveConfidence);
      setConfidence(null);
    }, 400);
  };

  const handleDragStart = useCallback(() => {
    if (isFlipped && !prefersReduced && !exitingRef.current) {
      soundPlayer.play('ui_drag_start');
      setDragActive(true);
    }
  }, [isFlipped, prefersReduced]);

  const handleDrag = useCallback((_e: unknown, info: { offset: { x: number } }) => {
    if (!isFlipped || prefersReduced) return;
    if (info.offset.x < -50) setDragLabel('forgot');
    else if (info.offset.x > 50) setDragLabel('remembered');
    else setDragLabel(null);
  }, [isFlipped, prefersReduced]);

  const handleDragEnd = useCallback((_e: unknown, info: PanInfo) => {
    setDragActive(false);
    setDragLabel(null);
    if (!isFlipped || prefersReduced || exitingRef.current) return;
    soundPlayer.play('ui_drop');
    const threshold = 100;
    if (info.offset.x < -threshold) {
      handleRate(Rating.Again);
    } else if (info.offset.x > threshold) {
      handleRate(Rating.Good);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlipped, prefersReduced, current]);

  const handleBtnClick = (index: number, e?: React.MouseEvent<HTMLButtonElement>) => {
    const el = btnRefs.current[index];
    if (el) {
      el.classList.add('animate-scale-bounce');
      el.addEventListener('animationend', () => {
        el.classList.remove('animate-scale-bounce');
      }, { once: true });
      if ((index === 2 || index === 3) && e) {
        const rect = el.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'kb-ripple-effect';
        ripple.style.left = `${e.clientX - rect.left}px`;
        ripple.style.top = `${e.clientY - rect.top}px`;
        el.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      }
    }
  };

  const handleRestart = () => {
    setShowSummary(false);
    endSession();
    if (deckId) {
      startSession(deckId);
    }
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

  const handleDismissSuggestion = () => {
    setShowOptimizeModal(false);
  };

  // No cards available
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
          <h1 className="text-h2 font-semibold text-text-primary flex-1">学习</h1>
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
      {/* 顶栏 */}
      <div className="flex items-center gap-kb-sm px-kb-md py-3 flex-shrink-0">
        <button
          onClick={() => navigate(`/flashcards/${deckId}`)}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <X className="w-icon-md h-icon-md" strokeWidth={1.5} />
        </button>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-b3 font-medium text-text-secondary">
              {completedCount}/{total} 已学习
            </span>
            {sessionMastered > 0 && (
              <span className="inline-flex items-center gap-1 text-c1 font-medium text-brand-600">
                <Star className="w-3 h-3 fill-brand-400 text-brand-400" strokeWidth={1.5} />
                <span className="relative">
                  {sessionMastered}
                  {showPlusOne && (
                    <span
                      className="absolute -right-5 -top-0.5 text-c1 font-bold text-brand-500 animate-fade-in-up"
                      style={{ animationDuration: '600ms' }}
                    >
                      +1
                    </span>
                  )}
                </span>
              </span>
            )}
            <span className="text-c1 text-text-tertiary">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-kb-full bg-bg-tertiary overflow-hidden flex-1 min-h-0">
            <div
              className="h-full rounded-kb-full bg-flashcard transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 卡片主体 */}
      <div
        className="flex-1 flex items-center justify-center px-kb-md overflow-hidden"
        onContextMenu={(e) => {
          if (current) ctxHandleMenu(e, current);
        }}
      >
        {!isComplete && current ? (
          <motion.div
            className={cn('w-full max-w-xl relative', entering && 'animate-fade-in-up')}
            drag={isFlipped && !prefersReduced && !exiting ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            dragSnapToOrigin
            dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
            style={{ x: isFlipped && !prefersReduced ? dragX : undefined }}
            animate={
              exitDir === 'right'
                ? { x: 500, opacity: 0, rotateZ: 15 }
                : exitDir === 'left'
                  ? { x: -500, opacity: 0, rotateZ: -15 }
                  : { x: 0, opacity: 1, rotateZ: 0 }
            }
            transition={
              exitDir
                ? { type: 'spring', stiffness: 300, damping: 25 }
                : undefined
            }
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            whileDrag={{ cursor: 'grabbing' }}
          >
            {dragActive && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-kb-xl bg-rose-500 z-10 pointer-events-none flex items-center justify-center"
                  style={{ opacity: dragOverlayRed }}
                >
                  <span className="text-white font-bold text-h1 select-none">✗ 忘记</span>
                </motion.div>
                <motion.div
                  className="absolute inset-0 rounded-kb-xl bg-emerald-500 z-10 pointer-events-none flex items-center justify-center"
                  style={{ opacity: dragOverlayGreen }}
                >
                  <span className="text-white font-bold text-h1 select-none">✓ 记得</span>
                </motion.div>
              </>
            )}
            <FlipCard
              front={current.front}
              back={current.back}
              isFlipped={isFlipped}
              onFlip={flipCard}
              onFlipEnd={() => setFlipDone(true)}
              exiting={exiting}
              glow={cardGlow}
            />
            {isFlipped && (
              <div className="flex justify-center gap-3 mt-3">
                {current.sourceNoteId && (
                  <button
                    onClick={() => navigate(`/notes/${current.sourceNoteId}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium text-text-secondary hover:text-brand-600 hover:bg-brand-50 transition-all duration-kb-fast"
                    title="查看来源笔记"
                  >
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                    查看上下文
                  </button>
                )}
                <button
                  onClick={handleOptimizeClick}
                  disabled={optimizeLoading}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium",
                    "text-text-secondary hover:text-amber-600 hover:bg-amber-50",
                    "transition-all duration-kb-fast",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                  title="AI 优化建议"
                >
                  {optimizeLoading ? (
                    <AIThinkingIndicator size={4} gap={2} />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                  AI 优化建议
                </button>
              </div>
            )}
            {isFlipped && !prefersReduced && !dragActive && (
              <p className="text-c1 text-text-tertiary text-center mt-1.5 select-none">
                左右滑动卡片可快速评分
              </p>
            )}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-kb-md text-center py-kb-2xl">
            <div className={cn(
              'w-16 h-16 rounded-kb-xl',
              'bg-semantic-success/10 flex items-center justify-center',
              'text-semantic-success',
            )}>
              <RotateCcw className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h2 className="text-h1 font-semibold text-text-primary">本轮学习完成！</h2>
            <p className="text-b2 text-text-tertiary">共复习了 {completedCount} 张卡片</p>
            {sessionMastered > 0 && (
              <p className="inline-flex items-center gap-1.5 text-b3 font-medium text-brand-600">
                <Star className="w-3.5 h-3.5 fill-brand-400 text-brand-400" strokeWidth={1.5} />
                本轮新掌握 {sessionMastered} 个知识点
              </p>
            )}
            <div className="flex gap-3 mt-kb-sm">
              <Button variant="secondary" onClick={handleRestart}>
                再来一轮
              </Button>
              <Button onClick={handleFinish}>
                返回牌组
              </Button>
            </div>
            {/* v0.9.0: Golden Error panel after session complete */}
            {goldenErrors.length > 0 && (
              <div className="mt-4 w-full max-w-xl mx-auto">
                <GoldenErrorPanel
                  errors={goldenErrors}
                  onRelearn={(flashcardId) => {
                    relearn();
                  }}
                />
              </div>
            )}
          </div>
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

      {/* 底部评分区 */}
      {!isComplete && current && (
        <div className={cn(
          'flex-shrink-0 px-kb-md py-4 border-t border-border/50',
          'bg-bg-elevated',
        )}>
          {flipDone && isFlipped ? (
            <div className="flex flex-col gap-2">
              {/* v0.9.0: Confidence selector before rating */}
              <ConfidenceSelector
                value={confidence}
                onChange={setConfidence}
              />
              {hoveredRating !== null && (
                <div className="flex justify-center animate-fade-in-up">
                  <span className="text-c2 text-text-secondary px-2 py-0.5 rounded-kb-sm bg-bg-tertiary">
                    下次复习：{formatInterval(intervalValues[hoveredRating])} 后
                  </span>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {ratingStyles.map(({ label, rating, color, glow }, i) => (
                  <motion.button
                    ref={(el) => { btnRefs.current[i] = el; }}
                    key={label}
                    onClick={(e) => { handleBtnClick(i, e); handleRate(rating); }}
                    onMouseEnter={() => setHoveredRating(i)}
                    onMouseLeave={() => setHoveredRating(null)}
                    initial={prefersReduced ? false : { y: 20, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={
                      prefersReduced
                        ? { duration: 0.01 }
                        : { type: 'spring', stiffness: 400, damping: 22, delay: i * 0.06 }
                    }
                    whileHover={{ scale: 1.06, y: -2 }}
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      'relative overflow-hidden flex flex-col items-center gap-0.5 py-3 rounded-kb-lg',
                      'text-white font-semibold text-b2',
                      'transition-shadow duration-200',
                      color,
                      glow,
                    )}
                  >
                    <span className="text-c1 opacity-80">{formatInterval(intervalValues[i])}</span>
                    {label}
                  </motion.button>
                ))}
              </div>
              <div className="flex justify-center">
                <button
                  onClick={handleRelearn}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-kb-md',
                    'text-b3 font-medium text-text-secondary',
                    'hover:text-brand-600 hover:bg-brand-50',
                    'transition-all duration-kb-fast',
                  )}
                  title="将当前卡片重新加入学习队列"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                  重学此卡
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                size="lg"
                icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                onClick={flipCard}
                className="min-w-[160px]"
              >
                翻转查看
              </Button>
            </div>
          )}
        </div>
      )}

      {/* AI 优化建议模态框 */}
      {showOptimizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-kb-md">
          <div className="w-full max-w-md bg-bg-elevated rounded-kb-xl shadow-kb-lg p-kb-lg animate-fade-in-up">
            <div className="flex items-center justify-between mb-kb-md">
              <h3 className="text-h2 font-semibold text-text-primary flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" strokeWidth={1.5} />
                AI 优化建议
              </h3>
              <button
                onClick={handleDismissSuggestion}
                className="p-1 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {optimizeLoading && (
              <div className="flex flex-col items-center gap-3 py-kb-lg">
                <AIThinkingIndicator />
                <p className="text-b2 text-text-secondary">AI 正在分析卡片内容…</p>
              </div>
            )}

            {optimizeError && !optimizeLoading && (
              <div className="py-kb-md">
                <p className="text-b2 text-semantic-error">{optimizeError}</p>
              </div>
            )}

            {optimizeData && !optimizeLoading && (
              <div className="flex flex-col gap-kb-md kb-ai-result-enter">
                <div>
                  <p className="text-c1 font-medium text-text-tertiary mb-1">建议正面</p>
                  <p className="text-b2 text-text-primary bg-bg-tertiary rounded-kb-md px-3 py-2">
                    {optimizeData.suggestedFront}
                  </p>
                </div>
                <div>
                  <p className="text-c1 font-medium text-text-tertiary mb-1">建议背面</p>
                  <p className="text-b2 text-text-primary bg-bg-tertiary rounded-kb-md px-3 py-2">
                    {optimizeData.suggestedBack}
                  </p>
                </div>
                {optimizeData.improvements.length > 0 && (
                  <div>
                    <p className="text-c1 font-medium text-text-tertiary mb-1">改进说明</p>
                    <ul className="list-disc list-inside space-y-1">
                      {optimizeData.improvements.map((imp, i) => (
                        <li key={i} className="text-b3 text-text-secondary">{imp}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-3 mt-kb-sm">
                  <Button
                    variant="secondary"
                    onClick={handleDismissSuggestion}
                    className="flex-1"
                    icon={<XIcon className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                  >
                    忽略
                  </Button>
                  <Button
                    onClick={() => { soundPlayer.play('ui_click'); handleAdoptSuggestion(); }}
                    className="flex-1"
                    icon={<Check className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
                  >
                    采用建议
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 学习完成率弹窗 */}
      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-kb-md">
          <div className="w-full max-w-sm bg-bg-elevated rounded-kb-xl shadow-kb-lg p-kb-lg animate-fade-in-up">
            <div className="flex justify-center mb-kb-md">
              <div className={cn(
                'w-14 h-14 rounded-kb-xl flex items-center justify-center',
                correctRate >= 80
                  ? 'bg-semantic-success/10 text-semantic-success'
                  : correctRate >= 50
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-semantic-error/10 text-semantic-error',
              )}>
                <Sparkles className="w-7 h-7" strokeWidth={1.5} />
              </div>
            </div>

            <h3 className="text-h2 font-semibold text-text-primary text-center mb-kb-md">
              本轮学习完成
            </h3>

            <div className="grid grid-cols-2 gap-3 mb-kb-lg">
              <div className="bg-bg-secondary rounded-kb-lg p-3 text-center">
                <p className="text-h1 font-bold text-text-primary">{completedCount}/{total}</p>
                <p className="text-c1 text-text-tertiary mt-0.5">完成卡片</p>
              </div>
              <div className="bg-bg-secondary rounded-kb-lg p-3 text-center">
                <p className={cn(
                  'text-h1 font-bold',
                  correctRate >= 80
                    ? 'text-semantic-success'
                    : correctRate >= 50
                      ? 'text-amber-500'
                      : 'text-semantic-error',
                )}>
                  {correctRate}%
                </p>
                <p className="text-c1 text-text-tertiary mt-0.5">正确率</p>
              </div>
            </div>

            {sessionMastered > 0 && (
              <div className="flex items-center justify-center gap-1.5 mb-kb-md">
                <Star className="w-4 h-4 fill-brand-400 text-brand-400" strokeWidth={1.5} />
                <span className="text-b3 font-medium text-brand-600">
                  新掌握 {sessionMastered} 个知识点
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleRestart}
                className="flex-1"
                icon={<RotateCcw className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              >
                再来一轮
              </Button>
              <Button
                onClick={handleFinish}
                className="flex-1"
              >
                返回牌组
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
