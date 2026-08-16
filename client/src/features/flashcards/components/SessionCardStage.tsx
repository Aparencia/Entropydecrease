/**
 * 学习会话 — 卡片主体区（墨水屏按钮 / 模式切换渲染 / 完成态）
 *
 * @ai-context: 从 StudySessionPage 拆出。按 reviewMode 分发五种复习模式
 * 组件（阅读/听力/书写/讲解/情境）；墨水屏按钮仅在 Electron 可用，失败
 * toast 优雅降级；会话完成时渲染 SessionCompleteView。交互状态（入场/
 * 退出/拖拽）由父级 useCardInteraction 整体传入，不再逐字段透传。
 * @ai-context: Extracted from StudySessionPage. Dispatches the five review
 * mode components by reviewMode; the e-ink button only works under Electron
 * (graceful toast fallback); renders SessionCompleteView when the session
 * finishes. Interaction state (entering/exiting/drag) is passed in wholesale
 * from the parent's useCardInteraction.
 */
import { useToast } from '@/components/ui';
import { Tablet } from 'lucide-react';
import { CardStage, SessionCompleteView } from './CardStage';
import { AudioReviewMode } from './AudioReviewMode';
import { WritingReviewMode } from './WritingReviewMode';
import { SpeakingReviewMode } from './SpeakingReviewMode';
import { SituationalReviewMode } from './SituationalReviewMode';
import { extractPlainText, type ReviewMode } from '../lib/reviewMode';
import type { useCardInteraction } from '../hooks/useCardInteraction';
import type { Flashcard, GoldenError } from '@/types/models';

/** useCardInteraction 返回值整体透传，避免 10+ 个逐字段 props */
type CardInteraction = ReturnType<typeof useCardInteraction>;

export interface SessionCardStageProps {
  current: Flashcard | undefined;
  isFlipped: boolean;
  reviewMode: ReviewMode;
  isComplete: boolean;
  completedCount: number;
  sessionMastered: number;
  goldenErrors: GoldenError[];
  prefersReduced: boolean;
  optimizeLoading: boolean;
  ci: CardInteraction;
  onFlip: () => void;
  onOptimize: () => void;
  onRestart: () => void;
  onFinish: () => void;
  onRelearn: () => void;
  onOpenSourceNote: (noteId: string) => void;
  onContextMenu: (e: React.MouseEvent, card: Flashcard) => void;
}

export function SessionCardStage({
  current, isFlipped, reviewMode, isComplete, completedCount, sessionMastered,
  goldenErrors, prefersReduced, optimizeLoading, ci,
  onFlip, onOptimize, onRestart, onFinish, onRelearn, onOpenSourceNote, onContextMenu,
}: SessionCardStageProps) {
  const { toast } = useToast();

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

  return (
    <div
      className="relative flex-1 flex items-center justify-center px-kb-md overflow-hidden"
      onContextMenu={(e) => { if (current) onContextMenu(e, current); }}
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
            onFlip={onFlip}
            onFlipEnd={() => ci.setFlipDone(true)}
            onDragStart={ci.handleDragStart}
            onDrag={ci.handleDrag}
            onDragEnd={ci.handleDragEnd}
            onOpenSourceNote={onOpenSourceNote}
            onOptimize={onOptimize}
          />
        ) : reviewMode === 'listening' ? (
          <div key={current.id} className="w-full animate-fade-in-up">
            <AudioReviewMode
              card={current}
              isFlipped={isFlipped}
              onFlip={onFlip}
              onFlipEnd={() => ci.setFlipDone(true)}
            />
          </div>
        ) : reviewMode === 'writing' ? (
          <div key={current.id} className="w-full animate-fade-in-up">
            <WritingReviewMode
              card={current}
              isFlipped={isFlipped}
              onFlip={onFlip}
              onFlipEnd={() => ci.setFlipDone(true)}
            />
          </div>
        ) : reviewMode === 'speaking' ? (
          <div key={current.id} className="w-full animate-fade-in-up">
            <SpeakingReviewMode
              card={current}
              isFlipped={isFlipped}
              onFlip={onFlip}
              onFlipEnd={() => ci.setFlipDone(true)}
            />
          </div>
        ) : (
          <div key={current.id} className="w-full animate-fade-in-up">
            <SituationalReviewMode
              card={current}
              isFlipped={isFlipped}
              onFlip={onFlip}
              onFlipEnd={() => ci.setFlipDone(true)}
            />
          </div>
        )
      ) : (
        <SessionCompleteView
          completedCount={completedCount}
          sessionMastered={sessionMastered}
          goldenErrors={goldenErrors}
          onRestart={onRestart}
          onFinish={onFinish}
          onRelearn={onRelearn}
        />
      )}
    </div>
  );
}
