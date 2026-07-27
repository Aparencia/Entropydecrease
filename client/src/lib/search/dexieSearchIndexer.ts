/**
 * 基于 Dexie (IndexedDB) 的搜索引擎实现
 * v0.9.0: 全文搜索引擎持久化索引
 * v1.2.0: 全局统一搜索，覆盖 notes/flashcards/feynmanNotes/inspirations/classroomNotes 五张表
 *
 * 使用 BM25 简化评分算法对搜索结果排序，
 * 索引数据存储在 IndexedDB searchIndex 表中。
 *
 * 性能优化：
 * - 使用 Dexie 多值索引 `*tokens` 先筛选候选文档，避免全表 toArray()
 * - 按 entityType 设置不同文档长度归一化权重
 */

import { db } from '../storage/database';
import { analyze } from './tokenizer';
import type {
  ISearchEngine,
  SearchOptions,
  SearchResult,
  SearchResultItem,
} from './types';
import type { SearchEntityType } from '@/types/models';

// ---------------------------------------------------------------------------
// BM25 参数（简化版，适合小规模多实体搜索）
// ---------------------------------------------------------------------------

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** 每批重建索引的条目数量 */
const REBUILD_BATCH_SIZE = 100;

/**
 * 各实体类型的文档长度归一化权重
 * 闪卡/灵感内容较短，费曼笔记/课堂笔记内容较长，
 * 通过权重调整 BM25 中的 docLen / avgDocLen 比值，
 * 使短内容（如闪卡）不至于因为长度短而得分偏高。
 */
const ENTITY_LENGTH_WEIGHT: Record<SearchEntityType, number> = {
  note: 1.0,
  flashcard: 0.6,   // 闪卡内容短，降低长度影响
  feynman: 1.2,     // 费曼笔记偏长
  inspiration: 0.7, // 灵感较短
  classroom: 1.3,   // 课堂笔记较长
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 从 TipTap JSON 内容中提取纯文本
 * content 可能是 JSON 字符串（TipTap 文档结构）、也可能已经是纯文本
 */
function extractPlainText(content: string): string {
  try {
    const doc = JSON.parse(content);
    if (doc?.type === 'doc' && Array.isArray(doc.content)) {
      const extract = (nodes: Array<Record<string, unknown>>): string => {
        const parts: string[] = [];
        for (const node of nodes) {
          if (node.type === 'text' && typeof node.text === 'string') {
            parts.push(node.text);
          }
          if (Array.isArray(node.content)) {
            parts.push(extract(node.content as Array<Record<string, unknown>>));
          }
        }
        return parts.join(' ');
      };
      return extract(doc.content);
    }
  } catch {
    // 非 JSON 或解析失败，当作纯文本处理
  }
  return content;
}

/**
 * 计算 IDF（逆文档频率）
 * IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
 */
function computeIDF(totalDocs: number, docFreq: number): number {
  return Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
}

// ---------------------------------------------------------------------------
// DexieSearchIndexer 类
// ---------------------------------------------------------------------------

export class DexieSearchIndexer implements ISearchEngine {
  private initialized = false;

  /** 初始化（Dexie 模式下无需额外初始化） */
  async init(): Promise<void> {
    this.initialized = true;
  }

  /**
   * 添加或更新一条实体的搜索索引
   * v1.2.0: 扩展为支持多实体类型
   */
  async upsert(
    entityId: string,
    entityType: SearchEntityType,
    title: string,
    content: string,
    updatedAt: number,
  ): Promise<void> {
    const plainContent = extractPlainText(content);
    const combinedText = `${title} ${plainContent}`;
    const tokens = analyze(combinedText);

    await db.transaction('rw', db.searchIndex, async () => {
      // 删除旧索引（兼容旧版 noteId 字段）
      await db.searchIndex.where('entityId').equals(entityId).delete();
      // 同时清理可能残留的旧 noteId-only 记录
      await db.searchIndex.where('noteId').equals(entityId).delete();
      // 写入新索引
      await db.searchIndex.add({
        noteId: entityId,   // 向后兼容
        entityId,
        entityType,
        tokens,
        title,
        content: plainContent.slice(0, 2000),
        updatedAt,
      });
    });
  }

  /**
   * 删除指定实体的搜索索引
   */
  async remove(entityId: string, _entityType?: SearchEntityType): Promise<void> {
    await db.transaction('rw', db.searchIndex, async () => {
      await db.searchIndex.where('entityId').equals(entityId).delete();
      // 兼容旧记录（可能只有 noteId 字段）
      await db.searchIndex.where('noteId').equals(entityId).delete();
    });
  }

  /**
   * 基于 BM25 简化评分执行搜索
   * v1.2.0: 支持 entityTypes 过滤 + Dexie 多值索引优化
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();
    const { query, limit = 20, offset = 0, fuzzy = false, entityTypes } = options;

    const queryTokens = analyze(query);
    if (queryTokens.length === 0) {
      return { items: [], totalCount: 0, elapsedMs: 0, queryTokens: [] };
    }

    // ── 性能优化：利用 Dexie 多值索引筛选候选文档 ──────────────────────────
    // 先用索引找出包含任一 queryToken 的文档，避免全表扫描
    let candidateEntries: Array<{
      id?: number;
      noteId: string;
      entityId: string;
      entityType: SearchEntityType;
      tokens: string[];
      title: string;
      content: string;
      updatedAt: number;
    }>;

    try {
      // anyOf 多值索引查询：找出 tokens 字段包含任一 queryToken 的所有文档
      candidateEntries = await db.searchIndex
        .where('tokens')
        .anyOf(queryTokens)
        .distinct()
        .toArray();
    } catch {
      // 多值索引查询失败时回退到全表扫描
      candidateEntries = await db.searchIndex.toArray();
    }

    // 在 entityTypes 过滤前获取全库文档总数，用于 IDF 计算（避免过滤后 IDF 失真）
    const totalDocs = await db.searchIndex.count();

    // ── entityTypes 过滤 ───────────────────────────────────────────────────
    if (entityTypes && entityTypes.length > 0) {
      const typeSet = new Set(entityTypes);
      candidateEntries = candidateEntries.filter((e) => typeSet.has(e.entityType));
    }

    if (totalDocs === 0) {
      return { items: [], totalCount: 0, elapsedMs: 0, queryTokens };
    }

    // 计算每个 token 的文档频率（df）
    const docFreqMap = new Map<string, number>();
    for (const token of queryTokens) {
      let df = 0;
      for (const entry of candidateEntries) {
        if (entry.tokens.includes(token)) df++;
      }
      docFreqMap.set(token, df);
    }

    // 计算平均文档长度（token 数量），使用候选集长度而非全库文档数
    const avgDocLen = candidateEntries.length > 0
      ? candidateEntries.reduce((sum, e) => sum + e.tokens.length, 0) / candidateEntries.length
      : 0;

    // 为每篇文档计算 BM25 得分
    const scored: Array<{
      entry: typeof candidateEntries[0];
      score: number;
      matchedTokens: string[];
    }> = [];

    for (const entry of candidateEntries) {
      // 限定笔记 ID 范围（向后兼容旧 API）
      if (options.noteIds?.length && !options.noteIds.includes(entry.entityId)) continue;

      let score = 0;
      const matchedTokens: string[] = [];
      const docLen = entry.tokens.length;
      const lenWeight = ENTITY_LENGTH_WEIGHT[entry.entityType] ?? 1.0;
      const weightedDocLen = docLen * lenWeight;

      for (const token of queryTokens) {
        // 统计该 token 在当前文档中的出现次数
        const tf = entry.tokens.includes(token) ? 1 : 0;
        if (tf === 0 && !fuzzy) continue;

        // 模糊匹配：检查前缀匹配
        if (tf === 0 && fuzzy) {
          const prefixMatch = entry.tokens.some((t) => t.startsWith(token.slice(0, 2)));
          if (!prefixMatch) continue;
        }

        const df = docFreqMap.get(token) ?? 0;
        const idf = computeIDF(totalDocs, df);

        // BM25 TF 分量（应用实体类型长度权重）
        const tfNorm =
          (tf * (BM25_K1 + 1)) /
          (tf + BM25_K1 * (1 - BM25_B + BM25_B * (weightedDocLen / avgDocLen)));
        score += idf * tfNorm;
        matchedTokens.push(token);
      }

      if (score > 0 && matchedTokens.length > 0) {
        scored.push({ entry, score, matchedTokens });
      }
    }

    // 按得分降序排序
    scored.sort((a, b) => b.score - a.score);
    const totalCount = scored.length;

    // 归一化得分到 0-1
    const maxScore = scored.length > 0 ? scored[0].score : 1;
    const pageItems = scored.slice(offset, offset + limit);

    const items: SearchResultItem[] = pageItems.map(({ entry, score, matchedTokens }) => {
      const snippet = buildSnippet(entry.content, matchedTokens);
      return {
        noteId: entry.entityId,   // 向后兼容
        entityId: entry.entityId,
        entityType: entry.entityType,
        title: entry.title,
        snippet,
        score: maxScore > 0 ? score / maxScore : 0,
        matchedTokens,
        updatedAt: entry.updatedAt,
      };
    });

    const elapsedMs = Math.round(performance.now() - startTime);
    return { items, totalCount, elapsedMs, queryTokens };
  }

  /**
   * 重建全部搜索索引
   * v1.2.0: 遍历 notes/flashcards/feynmanNotes/inspirations/classroomNotes 五张表
   * 使用 requestIdleCallback 异步批量处理，每批 REBUILD_BATCH_SIZE 条
   */
  async rebuildIndex(): Promise<void> {
    await db.searchIndex.clear();

    // ── 收集五张表的条目，统一转换为标准格式 ──────────────────────────────────
    interface IndexableItem {
      entityId: string;
      entityType: SearchEntityType;
      title: string;
      content: string;
      updatedAt: number;
    }

    const allItems: IndexableItem[] = [];

    // notes: title + content
    const notes = await db.notes.toArray();
    for (const note of notes) {
      const plainContent = extractPlainText(note.content);
      allItems.push({
        entityId: note.id,
        entityType: 'note',
        title: note.title,
        content: plainContent,
        updatedAt:
          note.updatedAt instanceof Date
            ? note.updatedAt.getTime()
            : new Date(note.updatedAt).getTime(),
      });
    }

    // flashcards: front + back
    const flashcards = await db.flashcards.toArray();
    for (const card of flashcards) {
      allItems.push({
        entityId: card.id,
        entityType: 'flashcard',
        title: card.front?.slice(0, 60) ?? '闪卡',
        content: `${card.front ?? ''} ${card.back ?? ''}`.trim(),
        updatedAt:
          card.updatedAt instanceof Date
            ? card.updatedAt.getTime()
            : new Date(card.updatedAt ?? Date.now()).getTime(),
      });
    }

    // feynmanNotes: concept + explanation
    const feynmanNotes = await db.feynmanNotes.toArray();
    for (const fn of feynmanNotes) {
      allItems.push({
        entityId: fn.id,
        entityType: 'feynman',
        title: fn.concept ?? '费曼笔记',
        content: `${fn.concept ?? ''} ${fn.explanation ?? ''}`.trim(),
        updatedAt:
          fn.updatedAt instanceof Date
            ? fn.updatedAt.getTime()
            : new Date(fn.updatedAt ?? Date.now()).getTime(),
      });
    }

    // inspirations: content (标题取前 60 字)
    const inspirations = await db.inspirations.toArray();
    for (const insp of inspirations) {
      const content = insp.content ?? '';
      allItems.push({
        entityId: insp.id,
        entityType: 'inspiration',
        title: content.slice(0, 60) || '灵感',
        content,
        updatedAt: new Date(insp.updatedAt ?? Date.now()).getTime(),
      });
    }

    // classroomNotes: title + content (Markdown)
    const classroomNotes = await db.classroomNotes.toArray();
    for (const cn of classroomNotes) {
      allItems.push({
        entityId: cn.id,
        entityType: 'classroom',
        title: cn.title ?? '课堂笔记',
        content: `${cn.title ?? ''} ${cn.content ?? ''}`.trim(),
        updatedAt:
          cn.updatedAt instanceof Date
            ? cn.updatedAt.getTime()
            : new Date(cn.updatedAt ?? Date.now()).getTime(),
      });
    }

    // ── 批量写入索引 ───────────────────────────────────────────────────────
    let cursor = 0;

    const processBatch = async (): Promise<void> => {
      const batch = allItems.slice(cursor, cursor + REBUILD_BATCH_SIZE);
      if (batch.length === 0) return;

      await db.transaction('rw', db.searchIndex, async () => {
        for (const item of batch) {
          const combinedText = `${item.title} ${item.content}`;
          const tokens = analyze(combinedText);
          await db.searchIndex.add({
            noteId: item.entityId,   // 向后兼容
            entityId: item.entityId,
            entityType: item.entityType,
            tokens,
            title: item.title,
            content: item.content.slice(0, 2000),
            updatedAt: item.updatedAt,
          });
        }
      });

      cursor += REBUILD_BATCH_SIZE;

      if (cursor < allItems.length) {
        await new Promise<void>((resolve) => {
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
        await processBatch();
      }
    };

    await processBatch();
  }

  /** 释放资源（Dexie 模式下无需额外清理） */
  dispose(): void {
    this.initialized = false;
  }
}

// ---------------------------------------------------------------------------
// 内部辅助：生成匹配上下文摘要
// ---------------------------------------------------------------------------

function buildSnippet(content: string, matchedTokens: string[]): string {
  if (!content) return '';
  const lowerContent = content.toLowerCase();

  let bestIndex = -1;
  for (const token of matchedTokens) {
    const idx = lowerContent.indexOf(token);
    if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
      bestIndex = idx;
    }
  }

  if (bestIndex === -1) {
    return content.slice(0, 120) + (content.length > 120 ? '...' : '');
  }

  const start = Math.max(0, bestIndex - 30);
  const end = Math.min(content.length, bestIndex + 90);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

export const dexieSearchIndexer = new DexieSearchIndexer();
