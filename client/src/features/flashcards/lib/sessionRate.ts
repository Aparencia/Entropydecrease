/**
 * 学习会话 — 评分编排（调度 + 黄金错误压缩 + 复习记录落库）
 *
 * @ai-context: 从 useStudySessionStore.rateCard 拆出。统一执行：世界事件
 * 秩序波纹 → 调度策略（FSRS 或 SM-2）→ goldenError 判定与间隔压缩（F2）
 * → 难度阶梯建议（惰性写入档位）→ 更新会话卡列表 → 创建复习记录并落库
 * （createWithLog，rating 需 +1 映射到 1-4）。
 * @ai-context: Extracted from useStudySessionStore.rateCard. Orchestrates:
 * world-event order ripple → scheduler (FSRS or SM-2) → golden-error
 * detection and interval compression (F2) → difficulty-tier suggestion
 * (lazily written) → updated session cards → review-record creation and
 * persistence (createWithLog; rating is +1 mapped to 1-4).
 */
import { Rating } from '@/lib/sm2';
import { getScheduler } from '@/lib/schedulingFactory';
import { suggestDifficultyTier, type DifficultyTier, type ScheduleResult } from '@/lib/scheduler';
import { flashcardReviewStore } from '@/lib/storage';
import { createWithLog } from '@/lib/storage/writeWithLog';
import { generateId } from '@/lib/utils/uuid';
import { useWorldEvents } from '@/features/retention/store/useWorldEvents';
import { compressForGoldenError } from './sessionMath';
import type { Flashcard, FlashcardReview, Confidence, GoldenError } from '@/types/models';

export interface PlanCardRatingInput {
  rating: Rating;
  confidence?: Confidence;
  card: Flashcard;
  sessionCards: Flashcard[];
  currentIndex: number;
  goldenErrors: GoldenError[];
  cardStartTime: Date | null;
}

export interface PlanCardRatingResult {
  /** 调度策略原始结果（easeFactor/repetitions/stability 等） */
  result: ScheduleResult;
  isGoldenError: boolean;
  updatedAt: Date;
  effectiveDueDate: Date;
  effectiveInterval: number;
  nextTier: DifficultyTier;
  /** 更新后的会话卡片列表（当前卡应用调度结果） */
  updatedCards: Flashcard[];
  /** 追加 goldenError 后的会话错误列表 */
  newGoldenErrors: GoldenError[];
}

/**
 * 评分编排：返回调度结果与更新后的会话数据，供 store 推进会话状态
 * （复习记录已在内部落库）。
 */
export async function planCardRating({
  rating, confidence, card, sessionCards, currentIndex, goldenErrors, cardStartTime,
}: PlanCardRatingInput): Promise<PlanCardRatingResult> {
  // 宪法第一条：复习行为=秩序波纹。任何评分都是一次对混沌的推退
  // （包括 Again——唤醒本身即正向，零负向语义），经世界事件总线驱动深海场景
  useWorldEvents.getState().emitOrderRipple('flashcards');

  // v0.9.0: goldenError 判定 — 高自信答错（Again）
  const isWrong = rating === Rating.Again;
  const isGoldenError = confidence === 'high' && isWrong;

  // 调用调度策略（FSRS 或 SM-2，由用户设置决定）
  const scheduler = getScheduler();
  const result = scheduler.review(
    {
      easeFactor: card.easeFactor,
      interval: card.interval,
      repetitions: card.repetitions,
      lapses: card.lapses,
      stability: card.stability,
      difficulty: card.difficulty,
      lastReview: card.lastReviewDate,
    },
    rating,
  );

  // v0.9.0: 记录 goldenError
  const newGoldenErrors = isGoldenError
    ? [...goldenErrors, {
        flashcardId: card.id,
        timestamp: Date.now(),
        confidence: 'high' as const,
        correctAnswer: card.back,
        userAnswer: '', // 翻转卡片模式下无用户输入，留空
      }]
    : goldenErrors;

  // F2 黄金错误加速复习：压缩该卡下次复习间隔（调度结果后处理）
  const updatedAt = new Date();
  let effectiveDueDate = result.dueDate;
  let effectiveInterval = result.interval;
  if (isGoldenError) {
    const compressed = compressForGoldenError(result.dueDate, result.interval, updatedAt);
    effectiveDueDate = compressed.dueDate;
    effectiveInterval = compressed.interval;
  }

  // 自适应挑战阶梯：按调度结果（间隔/失误）计算建议档位，惰性写入
  const nextTier = suggestDifficultyTier({
    interval: effectiveInterval,
    repetitions: result.repetitions,
    lapses: result.lapses,
    difficulty: result.difficulty,
  });

  // 同步更新本地 sessionCards 中的对应卡片
  const updatedCards = sessionCards.map((c, i) =>
    i === currentIndex
      ? {
          ...c,
          easeFactor: result.easeFactor,
          interval: effectiveInterval,
          repetitions: result.repetitions,
          lapses: result.lapses,
          dueDate: effectiveDueDate,
          stability: result.stability,
          difficulty: result.difficulty,
          difficultyTier: nextTier,
          lastReviewDate: updatedAt,
          updatedAt,
        }
      : c,
  );

  // 创建复习记录（FlashcardReview.rating 为 1-4，需 +1 映射）
  const review: FlashcardReview = {
    id: generateId(),
    cardId: card.id,
    deckId: card.deckId,
    rating: (rating + 1) as FlashcardReview['rating'],
    easeFactorBefore: card.easeFactor,
    easeFactorAfter: result.easeFactor,
    intervalBefore: card.interval,
    intervalAfter: effectiveInterval,
    reviewedAt: updatedAt,
    confidence,
    goldenError: isGoldenError,
    timeSpent: cardStartTime
      ? Math.round((updatedAt.getTime() - cardStartTime.getTime()) / 1000)
      : 0,
  };
  await createWithLog(flashcardReviewStore, 'flashcardReviews', review);

  return {
    result, isGoldenError, updatedAt, effectiveDueDate, effectiveInterval,
    nextTier, updatedCards, newGoldenErrors,
  };
}
