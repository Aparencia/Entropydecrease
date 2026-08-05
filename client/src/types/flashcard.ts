/**
 * 闪卡领域类型
 *
 * @ai-context: Flashcard 同时携带 SM-2 与 FSRS-5 两套调度算法字段，
 * FSRS 字段（stability/difficulty）采用惰性迁移策略，初始为 undefined，
 * 首次以 FSRS 调度复习时才写入。删除这两个字段会破坏 FSRS 用户的复习进度。
 */

import type { Confidence } from './common';

/** 闪卡牌组 */
export interface FlashcardDeck {
  id: string;
  name: string;
  description?: string;
  parentId?: string;             // 支持嵌套牌组
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  order: number;
}

/** 闪卡 */
export interface Flashcard {
  id: string;
  deckId: string;
  front: string;                 // 正面内容（支持 HTML/Markdown）
  back: string;                  // 背面内容
  type: 'basic' | 'cloze' | 'multi_choice';  // 卡片类型
  // SM-2 算法字段
  easeFactor: number;            // 难度因子，初始 2.5
  interval: number;              // 当前间隔（天）
  repetitions: number;           // 连续正确次数
  lapses: number;                // 累计失误次数
  dueDate: Date;                 // 下次复习日期
  lastReviewDate?: Date;         // 上次复习日期
  // FSRS-5 扩展字段（惰性迁移，初始为 null/undefined）
  stability?: number;            // 记忆稳定性（天）
  difficulty?: number;           // 记忆难度（1-10）
  /** 自适应挑战档位（惰性迁移，复习时由 suggestDifficultyTier 写入）
   *  / Adaptive challenge tier (lazy, written by suggestDifficultyTier) */
  difficultyTier?: 'basic' | 'challenge' | 'master';
  createdAt: Date;
  updatedAt: Date;
  sourceNoteId?: string;         // 来源笔记 ID（用于双向关联）
  /** 来源溯源（知识入籍：文件名/URL/粘贴来源，v8 迁移新增） / Settling source reference */
  sourceRef?: string;
  order: number;
  // 卡片标签（用于分类筛选与智能检索，v1.1 牌组分享格式已携带此字段）
  tags?: string[];
}

/** 闪卡复习记录 */
export interface FlashcardReview {
  id: string;
  cardId: string;
  deckId: string;
  rating: 1 | 2 | 3 | 4;       // Again(1) / Hard(2) / Good(3) / Easy(4)
  easeFactorBefore: number;
  easeFactorAfter: number;
  intervalBefore: number;
  intervalAfter: number;
  reviewedAt: Date;
  timeSpent: number;             // 本次复习耗时（秒）
  /** v0.9.0: 本次复习自信度 */
  confidence?: Confidence;
  /** v0.9.0: 是否为黄金错误（高自信答错） */
  goldenError?: boolean;
}

/** 牌组分享文件格式 (.kban-deck) */
export interface KbanDeckFile {
  version: '1.0' | '1.1';
  type: 'deck';
  exportedAt: string;       // ISO 8601
  author?: string;          // v1.1 新增：导出者标识
  deck: {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    cardCount?: number;     // v1.1 新增：卡片数量提示
    tags?: string[];        // v1.1 新增：牌组标签
  };
  cards: Array<{
    front: string;           // TipTap JSON 字符串
    back: string;
    tags: string[];
    type?: 'basic' | 'cloze' | 'multi_choice';  // v1.1 新增
    sourceNoteId?: string;   // v1.1 新增：来源笔记关联
  }>;
}
