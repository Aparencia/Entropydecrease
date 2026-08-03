/**
 * 知识星座 · 共享类型（IPC 边界）
 * Knowledge constellation · shared types (IPC boundary)
 *
 * @ai-context: 主进程 knowledgeQueries 只读聚合的返回形状（阶段 B）。
 * 渲染进程 useKnowledgeGraph 经 knowledge:get-graph 获取后，交给
 * lib/knowledgeGraph.ts 纯函数派生图谱（主进程不做派生，派生规则
 * 单测覆盖在渲染进程侧）。createdAt/reviewedAt 用 Date 保证 IPC
 * structured clone 原样传递。
 *
 * @ai-context: Shape of the read-only aggregate returned by the
 * knowledge:get-graph IPC; the renderer derives the graph via the
 * pure layer in lib/knowledgeGraph.ts.
 */
import type { Flashcard, FlashcardReview } from '@/types/flashcard';
import type { FeynmanNote } from '@/types/feynman';

/** knowledge:get-graph 返回的三路数据 / Raw inputs for graph derivation */
export interface KnowledgeGraphData {
  cards: Array<Pick<Flashcard, 'id' | 'front' | 'easeFactor' | 'interval' | 'createdAt'> & { sourceRef?: string }>;
  feynman: Array<Pick<FeynmanNote, 'id' | 'concept' | 'status'>>;
  reviews: Array<Pick<FlashcardReview, 'cardId'> & { reviewedAt: Date }>;
}
