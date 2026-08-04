/**
 * F3 睡前复习共享逻辑 — 到期卡统计与迷你复习目标选择
 * Bedtime review shared logic — due-card stats and mini-review target
 *
 * @ai-context: 纯查询函数（Dexie 索引范围查询，避免全表加载）。findTopDueDeck
 * 返回到期卡最多的牌组 id，供 useBedtimeReminder 检测与气泡点击拉起迷你
 * 复习共用，避免两处规则分叉。查询失败静默返回 undefined（仅提示不打扰）。
 * @ai-context: Shared pure queries used by both the reminder detector and
 * the bubble CTA so the mini-review target never diverges between them.
 */
import { flashcardStore, flashcardDeckStore } from '@/lib/storage';

/** 到期卡定义：dueDate ≤ now 且 repetitions > 0（非全新卡） */
export async function findDueCards(now: Date = new Date()) {
  return flashcardStore.getTable()
    .where('dueDate').belowOrEqual(now)
    .and((c) => c.repetitions > 0)
    .toArray();
}

/** 返回到期卡最多的牌组 id；无到期卡或无牌组时返回 undefined */
export async function findTopDueDeck(now: Date = new Date()): Promise<string | undefined> {
  try {
    const [dueCards, decks] = await Promise.all([
      findDueCards(now),
      flashcardDeckStore.getTable().toArray(),
    ]);
    if (decks.length === 0) return undefined;
    const byDeck = new Map<string, number>();
    dueCards.forEach((c) => byDeck.set(c.deckId, (byDeck.get(c.deckId) ?? 0) + 1));
    const top = decks
      .map((d) => ({ id: d.id, count: byDeck.get(d.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)[0];
    return top && top.count >= 1 ? top.id : undefined;
  } catch {
    return undefined;
  }
}
