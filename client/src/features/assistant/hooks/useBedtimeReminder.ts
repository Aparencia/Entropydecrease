/**
 * F3 睡前复习推荐检测
 *
 * @ai-context: 睡眠巩固（P23）——晚间窗口（21:30-23:30）内检测到到期卡 ≥5
 * 且当日未复习时，向事件总线发射 review:bedtime，由 ProactiveEngine 按规则触发气泡。
 * 可选增强设计：任何检测异常静默跳过，绝不打扰用户。
 */
import { useEffect } from 'react';
import { flashcardReviewStore } from '@/lib/storage';
import { assistantEventBus } from '../lib/eventBus';
import { findDueCards, findTopDueDeck } from '../lib/bedtimeReview';

/** 睡前推荐窗口起点（21:30，以分钟计） */
const BEDTIME_START_MIN = 21 * 60 + 30;
/** 睡前推荐窗口终点（23:30） */
const BEDTIME_END_MIN = 23 * 60 + 30;
/** 检测间隔：10 分钟一次，窗口内至多触发数次由规则冷却兜底 */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** 到期卡数量门槛 */
const MIN_DUE_CARDS = 5;

export function useBedtimeReminder(): void {
  useEffect(() => {
    const check = async () => {
      try {
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        if (minutes < BEDTIME_START_MIN || minutes > BEDTIME_END_MIN) return;

        // 当日已复习则不再打扰（奖赏回来：已完成的行为不重复提醒）
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const reviewsToday = await flashcardReviewStore.getTable()
          .where('reviewedAt').aboveOrEqual(todayStart).count();
        if (reviewsToday > 0) return;

        // 到期卡计数（dueDate 索引范围查询，避免全表加载）
        const dueCards = await findDueCards(now);
        if (dueCards.length < MIN_DUE_CARDS) return;

        // F3 闭环：到期卡最多的牌组作为迷你复习目标（无牌组则纯提醒）
        const topDeckId = await findTopDueDeck(now);

        assistantEventBus.emit('review:bedtime', {
          currentHour: now.getHours(),
          dueCardCount: dueCards.length,
          topDeckId,
        });
      } catch {
        // 可选增强：检测失败静默跳过
      }
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
