/**
 * 黄金错误历史聚合查询
 *
 * @ai-context: F2/F4 数据基础：从 flashcard_reviews 表聚合黄金错误（高自信答错）
 * 历史记录，供错误模式分析（F4）与黄金错误周报使用。
 * 数据写入点在 useStudySessionStore.rateCard（goldenError 字段）。
 */
import { flashcardReviewStore, flashcardStore } from '@/lib/storage';
import type { FlashcardReview, Flashcard } from '@/types/models';

/** 带卡片上下文的黄金错误记录（供 AI 模式分析与面板展示） */
export interface GoldenErrorRecord {
  review: FlashcardReview;
  /** 卡片正面（问题） */
  front: string;
  /** 卡片背面（正确答案） */
  back: string;
  deckId: string;
}

/** 黄金错误统计摘要 */
export interface GoldenErrorStats {
  /** 时间窗口内黄金错误总数 */
  total: number;
  /** 按牌组聚合：deckId -> 次数 */
  byDeck: Record<string, number>;
  /** 重复出现的卡片：cardId -> 次数（≥2 次视为顽固错误） */
  repeatOffenders: Record<string, number>;
}

/**
 * 查询最近 N 天内的黄金错误复习记录
 *
 * @ai-context: 使用 reviewedAt 索引范围查询避免全表扫描（复习表增长最快）。
 * 卡片信息通过 cardId 批量补查；卡片已删除时跳过该记录。
 */
export async function getGoldenErrorRecords(days = 30): Promise<GoldenErrorRecord[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const reviews = await flashcardReviewStore.getTable()
    .where('reviewedAt').aboveOrEqual(since)
    .filter((r) => r.goldenError === true)
    .toArray();

  if (reviews.length === 0) return [];

  const cardIds = [...new Set(reviews.map((r) => r.cardId))];
  const cards = new Map<string, Flashcard>();
  for (const id of cardIds) {
    const card = await flashcardStore.getById(id);
    if (card) cards.set(id, card);
  }

  const records: GoldenErrorRecord[] = [];
  for (const review of reviews) {
    const card = cards.get(review.cardId);
    if (!card) continue; // 卡片已删除，跳过
    records.push({
      review,
      front: card.front,
      back: card.back,
      deckId: review.deckId,
    });
  }
  // 按时间倒序（最新的在前）
  return records.sort(
    (a, b) => new Date(b.review.reviewedAt).getTime() - new Date(a.review.reviewedAt).getTime(),
  );
}

/** 从黄金错误记录计算统计摘要（纯函数，便于测试） */
export function summarizeGoldenErrors(records: GoldenErrorRecord[]): GoldenErrorStats {
  const byDeck: Record<string, number> = {};
  const repeatOffenders: Record<string, number> = {};
  for (const r of records) {
    byDeck[r.deckId] = (byDeck[r.deckId] ?? 0) + 1;
    repeatOffenders[r.review.cardId] = (repeatOffenders[r.review.cardId] ?? 0) + 1;
  }
  // 仅保留出现 ≥2 次的顽固错误卡片
  for (const [cardId, count] of Object.entries(repeatOffenders)) {
    if (count < 2) delete repeatOffenders[cardId];
  }
  return { total: records.length, byDeck, repeatOffenders };
}

/** 查询距上次复习的天数（F5 中断恢复包判定用），无记录返回 null */
export async function getDaysSinceLastReview(): Promise<number | null> {
  const latest = await flashcardReviewStore.getTable()
    .orderBy('reviewedAt').last();
  if (!latest) return null;
  return Math.floor((Date.now() - new Date(latest.reviewedAt).getTime()) / (24 * 60 * 60 * 1000));
}
