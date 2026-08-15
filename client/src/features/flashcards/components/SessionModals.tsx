/**
 * 学习会话 — 弹窗组合（AI 优化 / 记忆术 / 难度阶梯 / 完成统计）
 *
 * @ai-context: 从 StudySessionPage 拆出。四个弹窗均为受控组件：AI 优化与
 * 完成统计复用 StudySessionModals，记忆术与难度阶梯就地组装 Modal；所有
 * 打开状态与提交逻辑由父级持有并通过回调注入。
 * @ai-context: Extracted from StudySessionPage. Four controlled modals: AI
 * optimize and session summary reuse StudySessionModals; mnemonic and
 * difficulty-ladder are assembled from Modal in place. All open state and
 * submission logic stay in the parent, injected via callbacks.
 */
import { Modal } from '@/components/ui/Modal';
import MnemonicBadge from './MnemonicBadge';
import DifficultyLadder from './DifficultyLadder';
import { OptimizeSuggestionModal, SessionSummaryModal } from './StudySessionModals';
import type { Flashcard } from '@/types/models';
import type { DifficultyTier } from '@/lib/scheduler';
import type { MnemonicData, OptimizeCardResult } from '@/lib/ai/types';

export interface SessionModalsProps {
  showOptimizeModal: boolean;
  optimizeData: OptimizeCardResult | null | undefined;
  optimizeLoading: boolean;
  optimizeError: string | null | undefined;
  showMnemonicModal: boolean;
  mnemonicLoading: boolean;
  mnemonicError: string | null;
  mnemonicData: MnemonicData | null;
  showDifficultyModal: boolean;
  current: Flashcard | undefined;
  showSummary: boolean;
  completedCount: number;
  total: number;
  correctRate: number;
  sessionMastered: number;
  onAdoptSuggestion: () => void;
  onDismissOptimize: () => void;
  onCloseMnemonic: () => void;
  onPromoteTier: (tier: DifficultyTier) => void;
  onCloseDifficulty: () => void;
  onRestart: () => void;
  onFinish: () => void;
}

export function SessionModals({
  showOptimizeModal, optimizeData, optimizeLoading, optimizeError,
  showMnemonicModal, mnemonicLoading, mnemonicError, mnemonicData,
  showDifficultyModal, current, showSummary,
  completedCount, total, correctRate, sessionMastered,
  onAdoptSuggestion, onDismissOptimize, onCloseMnemonic, onPromoteTier,
  onCloseDifficulty, onRestart, onFinish,
}: SessionModalsProps) {
  return (
    <>
      {showOptimizeModal && (
        <OptimizeSuggestionModal
          data={optimizeData}
          loading={optimizeLoading}
          error={optimizeError}
          onAdopt={onAdoptSuggestion}
          onDismiss={onDismissOptimize}
        />
      )}

      {/* P2 记忆术提示弹层：谐音/故事/空间联想（懒加载生成） */}
      <Modal
        open={showMnemonicModal}
        onClose={onCloseMnemonic}
        title="✨ 记忆术提示"
        description="通过联想让记忆更牢固"
        size="sm"
      >
        {mnemonicLoading && (
          <div className="py-6 text-center text-c1 text-text-tertiary animate-pulse">
            正在构思记忆术…
          </div>
        )}
        {mnemonicError && !mnemonicLoading && (
          <p className="py-6 text-center text-c1 text-text-tertiary">记忆术生成失败，请稍后重试</p>
        )}
        {mnemonicData && !mnemonicLoading && <MnemonicBadge mnemonic={mnemonicData} />}
      </Modal>

      {/* 自适应挑战阶梯弹窗：展示当前卡档位（间隔信号驱动），升阶写入 difficultyTier */}
      <Modal
        open={showDifficultyModal}
        onClose={onCloseDifficulty}
        title="🎯 难度阶梯"
        description="自适应挑战：讲给小孩 → 创新应用，按间隔信号逐级升阶"
        size="sm"
      >
        {current ? (
          <DifficultyLadder
            card={{
              interval: current.interval,
              repetitions: current.repetitions,
              lapses: current.lapses,
              difficultyTier: current.difficultyTier,
            }}
            onPromote={onPromoteTier}
          />
        ) : (
          <p className="py-6 text-center text-c1 text-text-tertiary">当前没有可展示的卡片</p>
        )}
      </Modal>

      {showSummary && (
        <SessionSummaryModal
          completedCount={completedCount}
          total={total}
          correctRate={correctRate}
          sessionMastered={sessionMastered}
          onRestart={onRestart}
          onFinish={onFinish}
        />
      )}
    </>
  );
}
