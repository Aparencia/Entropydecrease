/**
 * F5 中断恢复包
 *
 * @ai-context: 间隔重复 + 记忆重放（P16）——多日未复习后生成"快速恢复包"：
 * 从到期卡片中精选核心卡片（≤10 张）+ 记忆回响摘要，帮助用户 10 分钟回温。
 * 选择逻辑纯本地（零 AI 依赖）；记忆回响为可选 AI 增强，失败静默跳过。
 * 设计原则：奖赏回来——文案强调"欢迎回来"而非"你中断了"。
 */
import { flashcardStore } from '@/lib/storage';
import { getDaysSinceLastReview } from './goldenErrorQueries';
import type { Flashcard } from '@/types/models';

/** 触发恢复包的中断天数阈值 */
export const RECOVERY_GAP_DAYS = 3;
/** 恢复包卡片数量上限 */
export const RECOVERY_PACK_SIZE = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 恢复包数据结构 */
export interface RecoveryPack {
  /** 距上次复习的天数 */
  gapDays: number;
  /** 精选核心卡片 */
  cards: Flashcard[];
  /** 到期卡片总数（含未入选） */
  totalDue: number;
  /** 到期卡最多的牌组（CTA 跳转目标） */
  topDeckId: string | null;
}

/**
 * 恢复包卡片优先级评分（纯函数，便于测试）
 *
 * @ai-context: 逾期越久 + 历史复习次数越多（说明曾是核心知识）→ 优先级越高。
 * repetitions 封顶 10 避免老卡片垄断；逾期天数封顶 30 避免极端值。
 */
export function recoveryPriority(card: Flashcard, now: number): number {
  const overdueDays = Math.min(30, Math.max(0, (now - new Date(card.dueDate).getTime()) / DAY_MS));
  const familiarity = Math.min(10, card.repetitions);
  return overdueDays * 2 + familiarity;
}

/**
 * 从到期卡片中精选恢复包卡片（纯函数）
 *
 * @ai-context: 按优先级降序取前 size 张；仅选 repetitions > 0 的旧卡
 * （新卡走正常学习流程，不混入恢复场景）。
 */
export function selectRecoveryCards(
  cards: Flashcard[],
  now: number,
  size = RECOVERY_PACK_SIZE,
): Flashcard[] {
  return cards
    .filter((c) => c.repetitions > 0 && new Date(c.dueDate).getTime() <= now)
    .sort((a, b) => recoveryPriority(b, now) - recoveryPriority(a, now))
    .slice(0, size);
}

/**
 * 加载恢复包数据
 *
 * @returns 满足中断条件返回 RecoveryPack；否则返回 null
 */
export async function loadRecoveryPack(): Promise<RecoveryPack | null> {
  const gapDays = await getDaysSinceLastReview();
  if (gapDays == null || gapDays < RECOVERY_GAP_DAYS) return null;

  const now = Date.now();
  const allCards = await flashcardStore.getAll();
  const selected = selectRecoveryCards(allCards, now);
  if (selected.length === 0) return null;

  // 到期总数含新卡（与 UI 文案"共 X 张卡片到了复习时间"一致）；
  // 牌组 CTA 仍只统计旧卡（repetitions>0，恢复场景针对旧知识）
  let totalDue = 0;
  const dueByDeck = new Map<string, number>();
  for (const c of allCards) {
    if (new Date(c.dueDate).getTime() > now) continue;
    totalDue += 1;
    if (c.repetitions > 0) {
      dueByDeck.set(c.deckId, (dueByDeck.get(c.deckId) ?? 0) + 1);
    }
  }
  let topDeckId: string | null = null;
  let maxDue = 0;
  for (const [deckId, count] of dueByDeck) {
    if (count > maxDue) { maxDue = count; topDeckId = deckId; }
  }

  return {
    gapDays,
    cards: selected,
    totalDue,
    topDeckId,
  };
}
