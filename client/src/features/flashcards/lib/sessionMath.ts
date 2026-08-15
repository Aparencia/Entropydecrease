/**
 * 学习会话 — 会话构建与调度后处理的纯函数
 *
 * @ai-context: 从 useStudySessionStore 拆出。洗牌（Fisher-Yates）、黄金错误
 * 间隔压缩（F2 后处理：dueDate 提前 + interval 封顶，不修改 FSRS 权重）、
 * 会话卡片去重，以及按每日限额组装会话列表（buildSessionCards，含 F3 迷你
 * 复习 limit 截断与"到期卡不足补新卡"策略）。
 * @ai-context: Extracted from useStudySessionStore. Pure helpers: Fisher-Yates
 * shuffle, golden-error interval compression (F2 post-processing: earlier
 * dueDate + capped interval, never touches FSRS weights), session-card
 * dedupe, and daily-quota session assembly (buildSessionCards, including the
 * F3 mini-review limit slice and the top-up-new-cards strategy).
 */
import { flashcardReviewStore } from '@/lib/storage';
import { getMaxNewCardsPerDay, getMaxReviewsPerDay, getMaxSessionCards } from '@/lib/schedulingFactory';
import type { Flashcard } from '@/types/models';

/** 到期卡片不足此数量时，补充新卡 */
const MIN_DUE_THRESHOLD = 10;
/** 黄金错误加速复习：下次间隔压缩上限（天） */
const GOLDEN_ERROR_MAX_INTERVAL_DAYS = 1;

/** 洗牌（Fisher-Yates） */
export function shuffle<T>(arr: T[]): T[] {
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
export function compressForGoldenError(
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

/**
 * 会话卡片去重：每次调用使用独立 Set；dedupedNew 继承 dedupedDue 的 ID，
 * 避免同一张卡同时出现在到期与新卡两份列表（Bug #9）。
 */
export function dedupeCards(cards: Flashcard[], inheritIds?: Set<string>): Flashcard[] {
  const seenIds = new Set<string>(inheritIds);
  return cards.filter((c) => {
    if (!c.id || seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });
}

/**
 * 统计当日已复习数量（reviewedAt 索引查询），避免 getAll 全量加载所有
 * 复习记录（增长最快的数据，半年可达数万条）再内存 filter（P1-8 性能修复）。
 */
export async function countReviewsToday(now: Date): Promise<number> {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return flashcardReviewStore.getTable()
    .where('reviewedAt').aboveOrEqual(todayStart).count();
}

export interface BuildSessionCardsInput {
  /** 当前牌组全部卡片 */
  allCards: Flashcard[];
  /** 今日已复习数量（countReviewsToday 查询结果） */
  reviewsToday: number;
  /** 今日已学新卡数（repetitions === 0 且 lastReviewDate 为今日的卡片） */
  newCardsStartedToday: number;
  now: Date;
  /** 可选卡数上限（F3 睡前迷你复习等轻量会话用） */
  limit?: number;
}

/**
 * 按每日限额组装会话卡片列表：到期卡充足时只用到期卡，否则补充新卡；
 * 今日复习额度用尽或无可学习卡片时返回空数组（调用方不启动会话）。
 */
export function buildSessionCards({
  allCards, reviewsToday, newCardsStartedToday, now, limit,
}: BuildSessionCardsInput): Flashcard[] {
  const maxReviews = getMaxReviewsPerDay();
  const maxNewCards = getMaxNewCardsPerDay();
  const remainingNewCards = Math.max(0, maxNewCards - newCardsStartedToday);
  const remainingReviews = Math.max(0, maxReviews - reviewsToday);

  // 今日复习额度已用尽，不启动会话
  if (remainingReviews <= 0) return [];

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

  const maxSessionCards = getMaxSessionCards();
  let sessionCards: Flashcard[];
  if (dueCards.length >= MIN_DUE_THRESHOLD) {
    // 到期卡充足：只用到期卡（上限 maxSessionCards 和 remainingReviews）
    const cap = Math.min(maxSessionCards, remainingReviews);
    sessionCards = dedupeCards(dueCards).slice(0, cap);
  } else {
    // 到期卡不足：补充新卡，总量不超过 maxSessionCards 和 remainingReviews
    const dedupedDue = dedupeCards(dueCards);
    const dueIds = new Set(dedupedDue.map((c) => c.id!));
    const dedupedNew = dedupeCards(newCards, dueIds);
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

  return sessionCards;
}
