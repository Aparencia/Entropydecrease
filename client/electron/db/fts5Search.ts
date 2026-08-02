/**
 * 基于 SQLite FTS5 的全文搜索引擎
 * unicode61 分词器 + BM25 排序，为笔记/闪卡/灵感等提供本地全文搜索。
 *
 * @ai-context: SQLite FTS5 全文搜索封装（若可用），LIKE 搜索的升级路径。
 * @ai-context: 错误处理策略——search() 在"无结果"时返回空数组，
 * 但在 FTS5 虚拟表不存在等致命错误时抛出异常，由调用方（dbIpcHandlers）
 * 决定是否降级到 LIKE 搜索。这样避免了异常被内部吞没导致降级路径不可达。
 */
import type Database from 'better-sqlite3';
import { getConnection } from './sqliteService.js';
import { logger } from '../logger.js';

// ================================================================
// 类型定义
// ================================================================

export interface SearchOptions {
  table?: string;      // 限定搜索表
  limit?: number;      // 结果数量上限，默认 20
  offset?: number;     // 偏移量
  highlight?: boolean; // 是否返回高亮片段
}

export interface SearchResult {
  id: string;
  table: string;
  title: string;
  snippet: string;     // 匹配片段（高亮可选）
  rank: number;        // BM25 排序分数
}

export interface IndexTableInput {
  name: string;
  rows: Array<{ id: string; title?: string; content: string }>;
}

// ================================================================
// FTS5 虚拟表 DDL
// ================================================================

const FTS5_DDL = /* sql */ `
CREATE VIRTUAL TABLE IF NOT EXISTS fts_content USING fts5(
  id UNINDEXED, table_name UNINDEXED, title, content,
  tokenize='unicode61 remove_diacritics 2'
);`;

// ================================================================
// 公共 API
// ================================================================

/** 创建 FTS5 虚拟表（幂等） */
export function initializeFTS(db: Database.Database): void {
  db.exec(FTS5_DDL);
  logger.info('[FTS5] Full-text search virtual table initialized');
}

/** 索引或更新一条文档（先删后插保证幂等） */
export function indexDocument(table: string, id: string, title: string, content: string): void {
  const db = getConnection();
  db.prepare(`DELETE FROM fts_content WHERE id = ? AND table_name = ?`).run(id, table);
  db.prepare(`INSERT INTO fts_content (id, table_name, title, content) VALUES (?, ?, ?, ?)`)
    .run(id, table, title, content);
}

/** 从全文索引中删除一条文档 */
export function removeDocument(table: string, id: string): void {
  getConnection()
    .prepare(`DELETE FROM fts_content WHERE id = ? AND table_name = ?`)
    .run(id, table);
}

/**
 * 执行全文搜索
 *
 * 使用 FTS5 MATCH + BM25 排序 + snippet 高亮。
 * query 支持 FTS5 查询语法（AND、OR、NOT、前缀 *）。
 *
 * 错误处理策略：
 * - 查询无结果时返回空数组（正常情况）
 * - FTS5 虚拟表不存在、SQL 执行失败等致命错误时抛出异常，
 *   由调用方（dbIpcHandlers.ts）捕获并降级到 LIKE 搜索
 */
export function search(query: string, options?: SearchOptions): SearchResult[] {
  if (!query?.trim()) return [];

  const db = getConnection();
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const useHighlight = options?.highlight ?? true;

  const snippetFn = useHighlight
    ? `snippet(fts_content, 3, '<mark>', '</mark>', '...', 64)`
    : `snippet(fts_content, 3, '', '', '...', 64)`;

  const hasTableFilter = !!options?.table;
  const whereClause = hasTableFilter
    ? `WHERE fts_content MATCH ? AND table_name = ?`
    : `WHERE fts_content MATCH ?`;

  const sql = /* sql */ `
    SELECT id, table_name, title,
           ${snippetFn} as snippet,
           bm25(fts_content) as rank
    FROM fts_content
    ${whereClause}
    ORDER BY rank
    LIMIT ? OFFSET ?`;

  const params: (string | number)[] = hasTableFilter
    ? [query, options!.table!, limit, offset]
    : [query, limit, offset];

  // 不再内部 catch 异常——让致命错误（如 FTS5 表不存在）传播给调用方，
  // 由 dbIpcHandlers.ts 的外层 catch 捕获并降级到 LIKE 搜索
  const rows = db.prepare(sql).all(...params) as Array<{
    id: string; table_name: string; title: string; snippet: string; rank: number;
  }>;
  return rows.map((r) => ({
    id: r.id, table: r.table_name, title: r.title, snippet: r.snippet, rank: r.rank,
  }));
}

/** 批量重建全文索引（事务内先清空再逐表写入） */
export function rebuildIndex(tables: IndexTableInput[]): void {
  const db = getConnection();
  const insertStmt = db.prepare(
    `INSERT INTO fts_content (id, table_name, title, content) VALUES (?, ?, ?, ?)`,
  );

  const transaction = db.transaction(() => {
    db.exec(`DELETE FROM fts_content`);
    for (const t of tables) {
      for (const row of t.rows) {
        insertStmt.run(row.id, t.name, row.title ?? '', row.content);
      }
    }
  });

  transaction();
  logger.info(`[FTS5] Index rebuilt for ${tables.length} table(s)`);
}

// ================================================================
// FTS 可索引表配置——定义哪些表的哪些字段需要纳入全文搜索
// ================================================================

/**
 * 需要纳入 FTS5 全文索引的表及其字段映射。
 * titleField/contentField 映射到各业务表中语义对应的列名，
 * 使不同表结构（如 notes.title vs feynman_notes.concept）
 * 都能统一灌入 fts_content 虚拟表。
 */
export const FTS_INDEXABLE_TABLES: Array<{
  table: string;
  titleField?: string;   // 标题字段（可选，部分表没有标题）
  contentField: string;  // 内容字段（必须有）
}> = [
  { table: 'notes', titleField: 'title', contentField: 'content' },
  { table: 'flashcards', titleField: 'front', contentField: 'back' },
  { table: 'feynman_notes', titleField: 'concept', contentField: 'explanation' },
  { table: 'inspirations', contentField: 'content' },
  { table: 'predictions', titleField: 'question', contentField: 'ai_answer' },
];

/**
 * 从数据库中读取所有可索引表的存量数据，构造 rebuildIndex() 需要的格式。
 * 启动时调用一次，用于填充 FTS5 虚拟表。
 */
export function collectIndexableData(db: Database.Database): IndexTableInput[] {
  const result: IndexTableInput[] = [];

  for (const cfg of FTS_INDEXABLE_TABLES) {
    // 动态构建 SELECT 语句，将业务表字段映射为统一的 id/title/content
    const titleExpr = cfg.titleField ? `"${cfg.titleField}" AS title` : "'' AS title";
    const sql = `SELECT id, ${titleExpr}, "${cfg.contentField}" AS content FROM "${cfg.table}"`;

    try {
      const rows = db.prepare(sql).all() as Array<{ id: string; title: string; content: string }>;
      if (rows.length > 0) {
        result.push({ name: cfg.table, rows });
      }
    } catch (err) {
      // 某张表查询失败不影响其他表——记录警告继续
      logger.warn(`[FTS5] Failed to collect data from "${cfg.table}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
