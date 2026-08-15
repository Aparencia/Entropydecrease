/**
 * @ai-context: flashcards 功能模块状态管理：useStudySessionStore。纯逻辑已
 * 外移至 lib/sessionMath（洗牌/黄金错误压缩/每日限额会话组装/当日复习计数）
 * 与 lib/sessionRate（评分编排：调度+落库），本文件仅保留状态形状与薄动作。
 * @ai-context: Study-session store. Pure logic now lives in lib/sessionMath
 * (shuffle / golden-error compression / quota-based session assembly / daily
 * review count) and lib/sessionRate (rating orchestration incl. persistence);
 * this file keeps the state shape and thin actions only.
 */
import { create } from 'zustand';
import type { Rating } from '@/lib/sm2';
import type { Flashcard, Confidence, GoldenError } from '@/types/models';
import { useFlashcardStore } from './useFlashcardStore';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { loadReviewMode, saveReviewMode, type ReviewMode } from '../lib/reviewMode';
import { buildSessionCards, countReviewsToday } from '../lib/sessionMath';
import { planCardRating } from '../lib/sessionRate';

// --- 类型定义 ---

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

/**
 * R9 成就检查会话级节流：startSession 重置，每次会话只触发一次检查，
 * 避免评分高频路径反复全表 count（模块级变量，store 为单例）
 */
let achievementCheckedInSession = false;

// --- Store ---

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

    // --- startSession：加载到期卡片 + 补充新卡（带每日限额） ---
    startSession: async (deckId, limit) => {
      const { cards, loadCards } = useFlashcardStore.getState();
      if (cards.length === 0 || useFlashcardStore.getState().selectedDeckId !== deckId) {
        await loadCards(deckId);
      }

      const allCards = useFlashcardStore.getState().cards.filter(
        (c) => c.deckId === deckId,
      );
      const now = new Date();

      // 每日限额：用 reviewedAt 索引查询当日已复习数量（P1-8 性能修复，
      // 避免全量加载复习记录再内存 filter）
      const reviewsToday = await countReviewsToday(now);
      // 计算当日已学新卡数（repetitions === 0 且 lastReviewDate 为今日的卡片）
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const newCardsStartedToday = allCards.filter(
        (c) => c.repetitions === 0 && c.lastReviewDate && new Date(c.lastReviewDate) >= todayStart,
      ).length;

      // 组装会话卡片列表（受每日限额约束；空数组表示无可学习卡片）
      const sessionCards = buildSessionCards({
        allCards, reviewsToday, newCardsStartedToday, now, limit,
      });
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

    // --- rateCard：评分并推进到下一张（调度/落库见 lib/sessionRate.planCardRating） ---
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
        const plan = await planCardRating({
          rating, confidence, card, sessionCards, currentIndex, goldenErrors, cardStartTime,
        });

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
            easeFactor: plan.result.easeFactor,
            interval: plan.effectiveInterval,
            repetitions: plan.result.repetitions,
            lapses: plan.result.lapses,
            dueDate: plan.effectiveDueDate,
            stability: plan.result.stability,
            difficulty: plan.result.difficulty,
            difficultyTier: plan.nextTier,
            lastReviewDate: plan.updatedAt,
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

        // 会话结束（isLastCard）或推进到下一张：状态推进与记忆强度追踪
        if (isLastCard) soundPlayer.play('deck_complete');
        set({
          sessionCards: plan.updatedCards,
          currentIndex: nextIndex,
          completedCount: get().completedCount + 1,
          correctCount: get().correctCount + (isCorrect ? 1 : 0),
          goldenErrors: plan.newGoldenErrors,
          isActive: !isLastCard,
          isFlipped: false,
          cardStartTime: isLastCard ? null : new Date(),
          isRating: false,
          // v0.29: 记忆强度追踪
          lastStabilityBefore: card.stability ?? 0,
          lastStabilityAfter: plan.result.stability ?? 0,
          lastRating: rating,
          showStrengthPulse: true,
        });
      } finally {
        // 异常路径（落库失败）也必须释放锁，避免评分永久不可用
        set({ isRating: false });
      }
    },

    // --- flipCard：翻转卡片 ---
    flipCard: () => {
      set((state) => ({ isFlipped: !state.isFlipped }));
      soundPlayer.play('card_flip');
    },

    // --- relearn：将当前卡片重新加入队列末尾 ---
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

    // --- endSession：提前结束会话 ---
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

    // --- clearDeckSession：牌组删除时清理对应会话数据 ---
    clearDeckSession: (deckId: string) => {
      const { sessionCards, isActive } = get();
      if (!isActive) return;
      // 如果当前会话中包含该牌组的卡片，结束会话
      if (sessionCards.some((c) => c.deckId === deckId)) {
        get().endSession();
      }
    },

    // --- getGoldenErrors：返回当前会话中收集的 goldenErrors ---
    getGoldenErrors: () => {
      return get().goldenErrors;
    },

    // --- setReviewMode：切换多感官复习模式并持久化 ---
    setReviewMode: (mode) => {
      set({ reviewMode: mode });
      saveReviewMode(mode);
    },
  };
});
