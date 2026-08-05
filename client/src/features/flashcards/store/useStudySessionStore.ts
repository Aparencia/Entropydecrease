/**
 * @ai-context: flashcards 功能模块状态管理：useStudySessionStore。
 */
import { create } from 'zustand';
import { createWithLog } from '@/lib/storage/writeWithLog';
import {
  flashcardReviewStore,
} from '@/lib/storage';
import { Rating } from '@/lib/sm2';
import { getScheduler } from '@/lib/schedulingFactory';
import { suggestDifficultyTier } from '@/lib/scheduler';
import { getMaxNewCardsPerDay, getMaxReviewsPerDay, getMaxSessionCards } from '@/lib/schedulingFactory';
import type { Flashcard, FlashcardReview, Confidence, GoldenError } from '@/types/models';
import { useFlashcardStore } from './useFlashcardStore';
import { generateId } from '@/lib/utils/uuid';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useWorldEvents } from '@/features/retention/store/useWorldEvents';
import { loadReviewMode, saveReviewMode, type ReviewMode } from '../lib/reviewMode';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 到期卡片不足此数量时，补充新卡 */
const MIN_DUE_THRESHOLD = 10;
/** 单次会话上限：由设置页配置（kb-max-session-cards，默认 20） */
/** 黄金错误加速复习：下次间隔压缩上限（天） */
const GOLDEN_ERROR_MAX_INTERVAL_DAYS = 1;

/**
 * R9 成就检查会话级节流：startSession 重置，每次会话只触发一次检查，
 * 避免评分高频路径反复全表 count（模块级变量，store 为单例）
 */
let achievementCheckedInSession = false;

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface StudySessionState {
  // 会话数据
  sessionCards: Flashcard[];
  currentIndex: number;
  isFlipped: boolean;
  completedCount: number;
  /** 正确回答次数（Good 或 Easy） */
  correctCount: number;
  sessionStartTime: Date | null;
  isActive: boolean;
  /** 当前卡片开始展示的时间戳（用于计算 timeSpent） */
  cardStartTime: Date | null;
  /** v0.9.0: 本次会话中收集的 goldenErrors */
  goldenErrors: GoldenError[];
  /** v0.29: 上一次评分的 stability 变化（供 MemoryStrengthPulse 消费） */
  lastStabilityBefore: number | null;
  lastStabilityAfter: number | null;
  lastRating: number | null;
  /** v0.29: 记忆强度脉冲可见性 */
  showStrengthPulse: boolean;

  // 会话操作
  /** @param limit 可选卡数上限（F3 睡前迷你复习等轻量会话用） */
  startSession: (deckId: string, limit?: number) => Promise<void>;
  rateCard: (rating: Rating, confidence?: Confidence) => Promise<void>;
  flipCard: () => void;
  endSession: () => void;
  /** 将当前卡片重新加入学习队列（不计入 completedCount） */
  relearn: () => void;
  /** 清理指定牌组的会话数据（牌组删除时调用） */
  clearDeckSession: (deckId: string) => void;
  /** v0.9.0: 获取当前会话及历史 goldenErrors */
  getGoldenErrors: () => GoldenError[];
  /** CL-H5: 评分处理中标志——防双击/连点导致同一卡片被调度两次 */
  isRating: boolean;

  // 3.5 多感官复习：当前复习模式（阅读/听力/书写/讲解/情境），持久化到 localStorage
  reviewMode: ReviewMode;
  setReviewMode: (mode: ReviewMode) => void;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 洗牌（Fisher-Yates） */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * F2 黄金错误加速复习：高自信答错是最大学习机会，压缩下次复习间隔。
 * 仅在调度结果之上做后处理（dueDate 提前 + interval 封顶），不修改 FSRS 权重。
 */
function compressForGoldenError(
  dueDate: Date,
  interval: number,
  now: Date,
): { dueDate: Date; interval: number } {
  const maxDue = new Date(now.getTime() + GOLDEN_ERROR_MAX_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  return {
    dueDate: dueDate > maxDue ? maxDue : dueDate,
    interval: Math.min(interval, GOLDEN_ERROR_MAX_INTERVAL_DAYS),
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStudySessionStore = create<StudySessionState>((set, get) => {
  return {
    sessionCards: [],
    currentIndex: 0,
    isFlipped: false,
    completedCount: 0,
    correctCount: 0,
    sessionStartTime: null,
    isActive: false,
    cardStartTime: null,
    goldenErrors: [],
    lastStabilityBefore: null,
    lastStabilityAfter: null,
    lastRating: null,
    showStrengthPulse: false,
    isRating: false,
    reviewMode: loadReviewMode(),

    // -----------------------------------------------------------------------
    // startSession：加载到期卡片 + 补充新卡（带每日限额）
    // -----------------------------------------------------------------------
    startSession: async (deckId, limit) => {
      const { cards, loadCards } = useFlashcardStore.getState();
      if (cards.length === 0 || useFlashcardStore.getState().selectedDeckId !== deckId) {
        await loadCards(deckId);
      }

      const allCards = useFlashcardStore.getState().cards.filter(
        (c) => c.deckId === deckId,
      );
      const now = new Date();

      // 每日限额：用 reviewedAt 索引查询当日已复习数量，避免 getAll 全量加载
      // 所有复习记录（增长最快的数据，半年可达数万条）再内存 filter（P1-8 性能修复）
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const reviewsToday = await flashcardReviewStore.getTable()
        .where('reviewedAt').aboveOrEqual(todayStart).count();
      const maxReviews = getMaxReviewsPerDay();
      const maxNewCards = getMaxNewCardsPerDay();

      // 计算当日已学新卡数（repetitions === 0 且 lastReviewDate 为今日的卡片）
      const newCardsStartedToday = allCards.filter(
        (c) => c.repetitions === 0 && c.lastReviewDate && new Date(c.lastReviewDate) >= todayStart,
      ).length;
      const remainingNewCards = Math.max(0, maxNewCards - newCardsStartedToday);
      const remainingReviews = Math.max(0, maxReviews - reviewsToday);

      if (remainingReviews <= 0) {
        // 今日复习额度已用尽，不启动会话
        return;
      }

      // 到期卡片：dueDate <= now 且 repetitions > 0（非全新卡）
      const dueCards = shuffle(
        allCards.filter(
          (c) => new Date(c.dueDate) <= now && c.repetitions > 0,
        ),
      );

      // 新卡片：从未复习过
      const newCards = shuffle(
        allCards.filter((c) => c.repetitions === 0),
      );

      // Bug #9: 每次 dedupe 使用独立的 Set，dedupedNew 继承 dedupedDue 的 ID
      const dedupe = (cards: Flashcard[], inheritIds?: Set<string>) => {
        const seenIds = new Set<string>(inheritIds);
        return cards.filter((c) => {
          if (!c.id || seenIds.has(c.id)) return false;
          seenIds.add(c.id);
          return true;
        });
      };

      // 组装会话卡片列表（受每日限额约束）
      const maxSessionCards = getMaxSessionCards();
      let sessionCards: Flashcard[];
      if (dueCards.length >= MIN_DUE_THRESHOLD) {
        // 到期卡充足：只用到期卡（上限 maxSessionCards 和 remainingReviews）
        const limit = Math.min(maxSessionCards, remainingReviews);
        sessionCards = dedupe(dueCards).slice(0, limit);
      } else {
        // 到期卡不足：补充新卡，总量不超过 maxSessionCards 和 remainingReviews
        const dedupedDue = dedupe(dueCards);
        const dueIds = new Set(dedupedDue.map((c) => c.id!));
        const dedupedNew = dedupe(newCards, dueIds);
        const totalLimit = Math.min(maxSessionCards, remainingReviews);
        const needNew = Math.min(
          totalLimit - dedupedDue.length,
          dedupedNew.length,
          remainingNewCards,
        );
        sessionCards = [...dedupedDue, ...dedupedNew.slice(0, Math.max(0, needNew))];
      }

      // 可选 limit（F3 睡前迷你复习：仅复习前 5 张，降低入睡前启动门槛）
      if (limit && limit > 0 && sessionCards.length > limit) {
        sessionCards = sessionCards.slice(0, limit);
      }

      if (sessionCards.length === 0) {
        // 无可学习卡片，不启动会话
        return;
      }

      set({
        sessionCards,
        currentIndex: 0,
        isFlipped: false,
        completedCount: 0,
        correctCount: 0,
        goldenErrors: [],
        sessionStartTime: new Date(),
        isActive: true,
        cardStartTime: new Date(),
      });
      // R9: 新会话重置成就检查节流标记
      achievementCheckedInSession = false;
    },

    // -----------------------------------------------------------------------
    // rateCard：评分并推进到下一张
    // -----------------------------------------------------------------------
    rateCard: async (rating, confidence) => {
      const { sessionCards, currentIndex, cardStartTime, isFlipped, goldenErrors, isRating } = get();

      // 必须已翻面才能评分
      if (!isFlipped) return;

      // CL-H5: 防重入——rateCard 中有 await 落库窗口（isFlipped 尚未重置），
      // 快速双击/触屏误触会让同一卡片被调度两次（双条复习记录 + 重复调度）
      if (isRating) return;
      set({ isRating: true });

      const card = sessionCards[currentIndex];
      if (!card || card.id === undefined) {
        set({ isRating: false });
        return;
      }

      try {
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

      // 更新卡片持久化存储（由 useFlashcardStore.updateCard 统一走 writeWithLog）

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

      // R9 百卡复习成就：每次会话仅检查一次（评分高频路径避免反复全表 count）；
      // 检查失败时复位节流标记，允许本会话稍后重试
      if (!achievementCheckedInSession) {
        achievementCheckedInSession = true;
        import('@/lib/achievements/evaluator').then(({ checkAchievements }) => {
          return checkAchievements({ type: 'review_completed' });
        }).then((unlocked) => {
          unlocked.forEach(a => {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: a }));
          });
        }).catch(() => {
          achievementCheckedInSession = false;
        });
      }

      // 同步 flashcard store 中对应的卡片状态（含操作日志）
      const flashcardState = useFlashcardStore.getState();
      try {
        // ALG-M2: updateCard 为异步写（原未 await 的 rejection 是 unhandled）。
        // 若此处失败（review 已落库、card 未更新），捕获并继续推进 UI——
        // 内存态（updatedCards）已是最新，DB 旧值将在下次复习时被覆盖，
        // 不丢数据；失败仅造成一次性的调度偏差，而非半写卡死或重复调度
        await flashcardState.updateCard(card.id, {
          easeFactor: result.easeFactor,
          interval: effectiveInterval,
          repetitions: result.repetitions,
          lapses: result.lapses,
          dueDate: effectiveDueDate,
          stability: result.stability,
          difficulty: result.difficulty,
          difficultyTier: nextTier,
          lastReviewDate: updatedAt,
        });
      } catch (updateErr) {
        console.error('[StudySession] 卡片状态更新失败（复习记录已保存）:', updateErr);
      }

      const nextIndex = currentIndex + 1;
      const isLastCard = nextIndex >= sessionCards.length;

      // 播放评分音效
      if (rating <= 1) soundPlayer.play('rate_forgot');
      else if (rating === 2) soundPlayer.play('rate_fuzzy');
      else soundPlayer.play('rate_remember');

      // 正确回答：Good(2) 或 Easy(3)
      const isCorrect = rating >= 2;

      if (isLastCard) {
        // 会话结束
        soundPlayer.play('deck_complete');
        set({
          sessionCards: updatedCards,
          currentIndex: nextIndex,
          completedCount: get().completedCount + 1,
          correctCount: get().correctCount + (isCorrect ? 1 : 0),
          goldenErrors: newGoldenErrors,
          isActive: false,
          isFlipped: false,
          cardStartTime: null,
          isRating: false,
          // v0.29: 记忆强度追踪
          lastStabilityBefore: card.stability ?? 0,
          lastStabilityAfter: result.stability ?? 0,
          lastRating: rating,
          showStrengthPulse: true,
        });
      } else {
        // 推进到下一张卡片
        set({
          sessionCards: updatedCards,
          currentIndex: nextIndex,
          completedCount: get().completedCount + 1,
          correctCount: get().correctCount + (isCorrect ? 1 : 0),
          goldenErrors: newGoldenErrors,
          isFlipped: false,
          cardStartTime: new Date(),
          isRating: false,
          // v0.29: 记忆强度追踪
          lastStabilityBefore: card.stability ?? 0,
          lastStabilityAfter: result.stability ?? 0,
          lastRating: rating,
          showStrengthPulse: true,
        });
      }
      } finally {
        // 异常路径（落库失败）也必须释放锁，避免评分永久不可用
        set({ isRating: false });
      }
    },

    // -----------------------------------------------------------------------
    // flipCard：翻转卡片
    // -----------------------------------------------------------------------
    flipCard: () => {
      set((state) => ({ isFlipped: !state.isFlipped }));
      soundPlayer.play('card_flip');
    },

    // -----------------------------------------------------------------------
    // relearn：将当前卡片重新加入队列末尾
    // -----------------------------------------------------------------------
    relearn: () => {
      const { sessionCards, currentIndex } = get();
      const currentCard = sessionCards[currentIndex];
      if (!currentCard) return;
      // 将当前卡片追加到队列末尾，不递增 completedCount
      // 同时推进 currentIndex 并重置 cardStartTime 以正确计时
      set((state) => ({
        sessionCards: [...state.sessionCards, currentCard],
        currentIndex: currentIndex + 1,
        cardStartTime: new Date(),
      }));
    },

    // -----------------------------------------------------------------------
    // endSession：提前结束会话
    // -----------------------------------------------------------------------
    endSession: () => {
      set({
        sessionCards: [],
        currentIndex: 0,
        isFlipped: false,
        completedCount: 0,
        correctCount: 0,
        goldenErrors: [],
        sessionStartTime: null,
        isActive: false,
        cardStartTime: null,
      });
    },

    // -----------------------------------------------------------------------
    // clearDeckSession：牌组删除时清理对应会话数据
    // -----------------------------------------------------------------------
    clearDeckSession: (deckId: string) => {
      const { sessionCards, isActive } = get();
      if (!isActive) return;
      // 如果当前会话中包含该牌组的卡片，结束会话
      if (sessionCards.some((c) => c.deckId === deckId)) {
        get().endSession();
      }
    },

    // -----------------------------------------------------------------------
    // getGoldenErrors：返回当前会话中收集的 goldenErrors
    // -----------------------------------------------------------------------
    getGoldenErrors: () => {
      return get().goldenErrors;
    },

    // -----------------------------------------------------------------------
    // setReviewMode：切换多感官复习模式并持久化
    // -----------------------------------------------------------------------
    setReviewMode: (mode) => {
      set({ reviewMode: mode });
      saveReviewMode(mode);
    },
  };
});
