/**
 * 知识图谱查询层 + IPC（knowledge:*，阶段 B 深度问题）
 * Knowledge graph query layer + IPC (read-only)
 *
 * @ai-context: 只读 SELECT 聚合三路数据（flashcards / feynman_notes /
 * flashcard_reviews），上限复用 MAX_LIMIT=100（粒度上限防整库抽取，
 * 与 MCP 记忆层同一约束）。不做图谱派生——派生规则在渲染进程
 * features/constellation/lib/knowledgeGraph.ts 纯函数层（单测覆盖）。
 * SQL 全部参数绑定；limit 经 clampLimit 封顶；失败抛错由 safeHandle
 * 的 Result 语义传导给渲染进程（星座是外壳增强项，hook 侧静默降级）。
 *
 * @ai-context: Read-only aggregation feeding the renderer's pure graph
 * derivation layer. Limit is clamped to MAX_LIMIT=100; all SQL is
 * parameter-bound.
 */
import { safeHandle } from '../ipcUtils.js';
import { logger } from '../logger.js';
import { getConnection } from './sqliteService.js';
import { clampLimit } from '../mcp/memoryQueries.js';
import type { KnowledgeGraphData } from '../../src/features/constellation/types.js';

/** flashcards 行（snake_case，SQLite 边界） / Flashcard row */
interface CardRow {
  id: string;
  front: string;
  ease_factor: number;
  interval: number;
  source_ref: string | null;
  created_at: string;
}

/** feynman_notes 行 / Feynman row */
interface FeynmanRow {
  id: string;
  concept: string;
  status: string;
}

/** flashcard_reviews 行 / Review row */
interface ReviewRow {
  card_id: string;
  reviewed_at: string;
}

/**
 * 聚合三路学习数据（只读，limit 封顶 100）
 * Aggregate flashcards, in-progress feynman notes and recent reviews.
 */
export function queryKnowledgeGraph(limitRaw: unknown): KnowledgeGraphData {
  const limit = clampLimit(limitRaw);
  const db = getConnection();

  const cards = db.prepare(`
    SELECT id, front, ease_factor, "interval", source_ref, created_at
    FROM flashcards ORDER BY updated_at DESC LIMIT ?
  `).all(limit) as CardRow[];

  const feynman = db.prepare(`
    SELECT id, concept, status FROM feynman_notes
    WHERE status = 'in_progress' ORDER BY updated_at DESC LIMIT ?
  `).all(limit) as FeynmanRow[];

  // 最近 limit 条复习（纯函数层会再按时间升序取窗口）
  const reviews = db.prepare(`
    SELECT card_id, reviewed_at FROM flashcard_reviews
    ORDER BY reviewed_at DESC LIMIT ?
  `).all(limit) as ReviewRow[];

  return {
    cards: cards.map((c) => ({
      id: c.id,
      front: c.front,
      easeFactor: c.ease_factor,
      interval: c.interval,
      sourceRef: c.source_ref ?? undefined,
      createdAt: new Date(c.created_at),
    })),
    feynman: feynman.map((f) => ({
      id: f.id,
      concept: f.concept,
      status: f.status as KnowledgeGraphData['feynman'][number]['status'],
    })),
    reviews: reviews.map((r) => ({
      cardId: r.card_id,
      reviewedAt: new Date(r.reviewed_at),
    })),
  };
}

/** 注册 knowledge:* IPC handlers（app ready 后调用一次） */
export function registerKnowledgeIpcHandlers(): void {
  safeHandle('knowledge:get-graph', async () => {
    try {
      return queryKnowledgeGraph(undefined);
    } catch (err) {
      // 查询失败记日志后向上抛——hook 侧会静默降级，不影响主流程
      logger.warn(`[knowledge] get-graph failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  });
}
