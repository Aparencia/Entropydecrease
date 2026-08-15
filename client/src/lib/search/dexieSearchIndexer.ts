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
 *
 * @ai-context: 2026-07 拆分——评分/文本纯函数在 searchScoring，重建收集在
 * searchIndexBuilder；本文件保留引擎类与单例，旧导入路径全兼容。
 * @ai-context: 索引写入保留 noteId=entityId 双字段是 v1.2.0 向后兼容设计，
 * 删除 noteId 会破坏旧索引记录清理逻辑。分词策略变更必须 rebuildIndex。
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
import {
  BM25_K1, BM25_B, ENTITY_LENGTH_WEIGHT,
  extractPlainText, computeIDF, buildSnippet,
} from './searchScoring';
import { collectIndexableItems } from './searchIndexBuilder';

/** 每批重建索引的条目数量 */
const REBUILD_BATCH_SIZE = 100;

export class DexieSearchIndexer implements ISearchEngine {
  /** 初始化（Dexie 模式下无需额外初始化；无状态） */
  async init(): Promise<void> {
    // no-op：Dexie 表即用即开，无需连接准备
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
   * v1.2.0: 遍历五张表（收集逻辑见 searchIndexBuilder）
   * 使用 requestIdleCallback 异步批量处理，每批 REBUILD_BATCH_SIZE 条
   */
  async rebuildIndex(): Promise<void> {
    await db.searchIndex.clear();

    const allItems = await collectIndexableItems();

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
// 单例导出 + 向后兼容 re-export
// ---------------------------------------------------------------------------

export const dexieSearchIndexer = new DexieSearchIndexer();

export { extractPlainText, buildSnippet } from './searchScoring';
