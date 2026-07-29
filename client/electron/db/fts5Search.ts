/**
 * 基于 SQLite FTS5 的全文搜索引擎
 * unicode61 分词器 + BM25 排序，为笔记/闪卡/灵感等提供本地全文搜索。
 *
 * @ai-context: SQLite FTS5 全文搜索封装（若可用），LIKE 搜索的升级路径。
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

  try {
    const rows = db.prepare(sql).all(...params) as Array<{
      id: string; table_name: string; title: string; snippet: string; rank: number;
    }>;
    return rows.map((r) => ({
      id: r.id, table: r.table_name, title: r.title, snippet: r.snippet, rank: r.rank,
    }));
  } catch (err) {
    logger.error('[FTS5] Search failed', err);
    return [];
  }
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
