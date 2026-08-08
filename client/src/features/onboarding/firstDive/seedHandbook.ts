/**
 * 《潜航员手册》种子服务 — 幂等写入 + 版本追加
 *
 * @ai-context: 副作用——写入 flashcardDecks/flashcards 表。幂等性靠固定
 * HANDBOOK_DECK_ID 与"front 去重追加"保证；绝不修改/删除已有卡片，
 * 保护用户复习进度（FSRS/SM-2 调度字段）。
 * @ai-context: 依赖注入——stores 通过参数传入，测试时传 Mock，
 * 禁止测试直连真实 IndexedDB。
 */
import {
  flashcardDeckStore as defaultDeckStore,
  flashcardStore as defaultCardStore,
} from '@/lib/storage';
import { getScheduler } from '@/lib/schedulingFactory';
import type { Flashcard, FlashcardDeck } from '@/types/models';
import {
  HANDBOOK_DECK_ID,
  HANDBOOK_DECK_NAME,
  HANDBOOK_DECK_DESCRIPTION,
  HANDBOOK_CARDS,
  HANDBOOK_VERSION,
  HANDBOOK_VERSION_KEY,
} from './handbookDeck';

interface DeckStoreLike {
  getById(id: string): Promise<FlashcardDeck | undefined>;
  create(item: FlashcardDeck): Promise<string>;
}

interface CardStoreLike {
  where(index: string, value: string): Promise<Flashcard[]>;
  create(item: Flashcard): Promise<string>;
}

/** 构建一张手册闪卡（调度字段用当前算法的新卡初始态） */
function buildHandbookCard(front: string, back: string): Flashcard {
  const now = new Date();
  const init = getScheduler().createNew();
  return {
    id: crypto.randomUUID(),
    deckId: HANDBOOK_DECK_ID,
    front,
    back,
    type: 'basic',
    easeFactor: init.easeFactor,
    interval: init.interval,
    repetitions: init.repetitions,
    lapses: init.lapses,
    dueDate: init.dueDate,
    stability: init.stability,
    difficulty: init.difficulty,
    createdAt: now,
    updatedAt: now,
    order: Date.now(),
  };
}

/**
 * 幂等种子：牌组不存在则创建；卡片按 front 去重追加。
 * 版本一致且牌组已存在时直接跳过（快路径，避免每次启动查卡片表）。
 *
 * @returns 本次新写入的卡片数
 */
export async function seedHandbookDeck(
  deckStore: DeckStoreLike = defaultDeckStore,
  cardStore: CardStoreLike = defaultCardStore,
): Promise<number> {
  const existingDeck = await deckStore.getById(HANDBOOK_DECK_ID);
  const storedVersion = Number(localStorage.getItem(HANDBOOK_VERSION_KEY) ?? '0');

  if (existingDeck && storedVersion >= HANDBOOK_VERSION) return 0;

  if (!existingDeck) {
    const now = new Date();
    await deckStore.create({
      id: HANDBOOK_DECK_ID,
      name: HANDBOOK_DECK_NAME,
      description: HANDBOOK_DECK_DESCRIPTION,
      color: '#4A9BD9', // 磷光蓝 — 微光水母的颜色
      createdAt: now,
      updatedAt: now,
      order: 0, // 排在最前，新用户第一眼可见
    });
  }

  // 版本追加：只补 front 不存在的卡，保护已有复习进度
  const existingCards = await cardStore.where('deckId', HANDBOOK_DECK_ID);
  const existingFronts = new Set(existingCards.map((c) => c.front));
  let added = 0;
  for (const card of HANDBOOK_CARDS) {
    if (existingFronts.has(card.front)) continue;
    await cardStore.create(buildHandbookCard(card.front, card.back));
    added += 1;
  }

  localStorage.setItem(HANDBOOK_VERSION_KEY, String(HANDBOOK_VERSION));
  return added;
}
