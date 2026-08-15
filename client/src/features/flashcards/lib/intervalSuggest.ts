/**
 * 学习会话 — 评分间隔建议（纯函数）
 *
 * @ai-context: 从 StudySessionPage 拆出。calculateIntervals 每次执行 4 次
 * sm2 计算，调用方用 useMemo 化到当前卡变化（P0-5 性能修复）；无当前卡时
 * 返回 [1,1,1,1] 占位，保证评分栏按钮可用。
 * @ai-context: Extracted from StudySessionPage. calculateIntervals runs four
 * sm2 computations per call, so callers memoize it on the current card
 * (P0-5 perf fix); falls back to [1,1,1,1] when there is no current card.
 */
import { calculateIntervals } from '@/lib/sm2';
import type { Flashcard } from '@/types/models';

/** 当前卡四个评分档位的建议间隔（again / hard / good / easy） */
export function suggestIntervalValues(
  card: Flashcard | undefined,
): [number, number, number, number] {
  if (!card) return [1, 1, 1, 1];
  const intervals = calculateIntervals({
    easeFactor: card.easeFactor,
    interval: card.interval,
    repetitions: card.repetitions,
  });
  return [intervals.again, intervals.hard, intervals.good, intervals.easy];
}
