/**
 * 学习会话 — 细粒度 store 选择器聚合 hook
 *
 * @ai-context: 从 StudySessionPage 拆出。M15 细粒度订阅：每个字段单独订阅，
 * 避免整 store 订阅导致重型子组件（卡片舞台/录音）被无关字段变化重渲染；
 * 按会话数据 / 会话动作 / 记忆强度脉冲 / 复习模式 / 牌组动作分组。
 * @ai-context: Extracted from StudySessionPage. M15 fine-grained subscription:
 * each field subscribes separately so heavy children (card stage / audio)
 * are not re-rendered by unrelated store changes. Grouped into session data,
 * session actions, strength pulse, review mode and flashcard actions.
 */
import { useStudySessionStore } from '../store/useStudySessionStore';
import { useFlashcardStore } from '../store/useFlashcardStore';

export function useStudySessionSelectors() {
  // 会话数据
  const sessionCards = useStudySessionStore((s) => s.sessionCards);
  const currentIndex = useStudySessionStore((s) => s.currentIndex);
  const isFlipped = useStudySessionStore((s) => s.isFlipped);
  const completedCount = useStudySessionStore((s) => s.completedCount);
  const correctCount = useStudySessionStore((s) => s.correctCount);
  const isActive = useStudySessionStore((s) => s.isActive);
  const goldenErrors = useStudySessionStore((s) => s.goldenErrors);
  // 会话动作（稳定引用）
  const startSession = useStudySessionStore((s) => s.startSession);
  const rateCard = useStudySessionStore((s) => s.rateCard);
  const flipCard = useStudySessionStore((s) => s.flipCard);
  const endSession = useStudySessionStore((s) => s.endSession);
  const relearn = useStudySessionStore((s) => s.relearn);
  // v0.29 记忆强度脉冲
  const lastStabilityBefore = useStudySessionStore((s) => s.lastStabilityBefore);
  const lastStabilityAfter = useStudySessionStore((s) => s.lastStabilityAfter);
  const lastRating = useStudySessionStore((s) => s.lastRating);
  const showStrengthPulse = useStudySessionStore((s) => s.showStrengthPulse);
  // 3.5 复习模式
  const reviewMode = useStudySessionStore((s) => s.reviewMode);
  const setReviewMode = useStudySessionStore((s) => s.setReviewMode);
  // 牌组动作
  const selectDeck = useFlashcardStore((s) => s.selectDeck);
  const loadCards = useFlashcardStore((s) => s.loadCards);
  const updateCard = useFlashcardStore((s) => s.updateCard);

  return {
    sessionCards, currentIndex, isFlipped, completedCount, correctCount, isActive, goldenErrors,
    startSession, rateCard, flipCard, endSession, relearn,
    lastStabilityBefore, lastStabilityAfter, lastRating, showStrengthPulse,
    reviewMode, setReviewMode, selectDeck, loadCards, updateCard,
  };
}
