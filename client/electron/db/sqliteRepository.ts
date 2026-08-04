/**
 * SQLite 通用仓库 — 实现 IRepository<T> 接口
 *
 * 在 Electron 主进程中直接调用 better-sqlite3（不走 IPC）。
 * 自动处理 camelCase ↔ snake_case 转换、JSON 序列化/反序列化、boolean ↔ INTEGER 映射。
 *
 * @ai-context: SQLite 通用仓储（泛型 CRUD），表名由调用方经白名单校验后传入。
 */

import type { IRepository } from '../../src/lib/storage/interfaces';
import type Database from 'better-sqlite3';
import { getConnection } from './sqliteService';

// ================================================================
// 工具函数
// ================================================================

/** camelCase → snake_case */
function toSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** snake_case → camelCase */
function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ================================================================
// 每张表的元数据：哪些列是 JSON / Boolean
// ================================================================

interface TableMeta {
  jsonFields: string[];   // camelCase 字段名，值需 JSON.stringify / JSON.parse
  boolFields: string[];   // camelCase 字段名，SQLite 中为 INTEGER(0/1)
}

const TABLE_META: Record<string, TableMeta> = {
  notes:             { jsonFields: ['tags'],                                    boolFields: ['pinned'] },
  flashcards:        { jsonFields: [],                                          boolFields: [] },
  flashcardReviews:  { jsonFields: [],                                          boolFields: ['goldenError'] },
  feynmanWeakPoints: { jsonFields: ['position'],                                boolFields: ['mastered'] },
  operationLog:      { jsonFields: [],                                          boolFields: ['synced'] },
  syncConflicts:     { jsonFields: [],                                          boolFields: [] },
  offlineQueue:      { jsonFields: [],                                          boolFields: [] },
  studyCheckIns:     { jsonFields: ['modulesUsed'],                             boolFields: [] },
  windowCaptures:    { jsonFields: ['segments'],                                boolFields: [] },
  inspirations:      { jsonFields: ['tags', 'sortResult'],                      boolFields: ['tagsManuallyEdited'] },
  searchIndex:       { jsonFields: ['tokens'],                                  boolFields: [] },
  pomodoroSessions:  { jsonFields: [],                                          boolFields: ['interrupted'] },
  pomodoroSettings:  { jsonFields: [],                                          boolFields: ['autoStartBreak', 'autoStartWork', 'soundEnabled', 'notificationEnabled'] },
};

function getMeta(tableName: string): TableMeta {
  return TABLE_META[tableName] ?? { jsonFields: [], boolFields: [] };
}

// ================================================================
// 行 ↔ 实体转换
// ================================================================

/** SQLite 行（snake_case keys）→ TypeScript 实体（camelCase keys） */
function rowToEntity<T>(row: Record<string, unknown>, meta: TableMeta): T {
  const jsonSet = new Set(meta.jsonFields);
  const boolSet = new Set(meta.boolFields);
  const result: Record<string, unknown> = {};

  for (const [snakeKey, raw] of Object.entries(row)) {
    const camelKey = toCamel(snakeKey);
    if (jsonSet.has(camelKey) && typeof raw === 'string') {
      try { result[camelKey] = JSON.parse(raw); } catch { result[camelKey] = raw; }
    } else if (boolSet.has(camelKey)) {
      result[camelKey] = raw === 1 || raw === true;
    } else {
      result[camelKey] = raw;
    }
  }
  return result as T;
}

/** TypeScript 实体（camelCase keys）→ SQL 参数对象（snake_case keys） */
function entityToRow(entity: Record<string, unknown>, meta: TableMeta): Record<string, unknown> {
  const jsonSet = new Set(meta.jsonFields);
  const boolSet = new Set(meta.boolFields);
  const row: Record<string, unknown> = {};

  for (const [camelKey, value] of Object.entries(entity)) {
    const snakeKey = toSnake(camelKey);
    if (value === undefined) continue;
    if (jsonSet.has(camelKey)) {
      row[snakeKey] = JSON.stringify(value);
    } else if (boolSet.has(camelKey)) {
      row[snakeKey] = value ? 1 : 0;
    } else {
      row[snakeKey] = value;
    }
  }
  return row;
}

// ================================================================
// SQL 安全工具
// ================================================================

/** 用双引号包裹列名，防止 SQLite 保留字冲突 */
function q(col: string): string {
  // SEC: 转义列名中的双引号，防止列名注入（如 `a" --` 闭合引号后注释掉剩余 SQL）
  return `"${col.replace(/"/g, '""')}"`;
}

/** 缓存每张表的列名白名单 */
const columnCache = new Map<string, Set<string>>();

/**
 * CL-M6: 使列名白名单缓存失效——schema 变更（ALTER TABLE）或数据库
 * 连接重开（reinitialize 到新路径）后必须调用，否则 filterAllowedColumns
 * 会用旧列集合过滤掉新列，导致新列数据静默丢弃。
 */
export function clearColumnCache(): void {
  columnCache.clear();
}

/**
 * 获取表的合法列名集合（从 PRAGMA table_info 查询并缓存）
 */
function getTableColumns(tableName: string): Set<string> {
  const cached = columnCache.get(tableName);
  if (cached) return cached;
  const db = getConnection();
  const rows = db.prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`).all() as Array<{ name: string }>;
  const cols = new Set(rows.map((r) => r.name));
  columnCache.set(tableName, cols);
  return cols;
}

// ================================================================
// SqliteRepository
// ================================================================

export default class SqliteRepository<T extends { id: string }> implements IRepository<T> {
  private tableName: string;
  private meta: TableMeta;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.meta = getMeta(tableName);
  }

  private get db(): Database.Database {
    return getConnection();
  }

  /**
   * 过滤非法列名，仅保留表中真实存在的列
   * SEC: 防止列名注入（防御纵深：配合 q() 的双引号转义）
   */
  filterAllowedColumns(data: Record<string, unknown>): Record<string, unknown> {
    const allowed = getTableColumns(this.tableName);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) {
        result[key] = value;
      }
    }
    return result;
  }

  async getAll(): Promise<T[]> {
    const rows = this.db.prepare(`SELECT * FROM ${this.tableName}`).all() as Record<string, unknown>[];
    return rows.map((r) => rowToEntity<T>(r, this.meta));
  }

  async getById(id: string): Promise<T | undefined> {
    const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToEntity<T>(row, this.meta) : undefined;
  }

  async create(item: Omit<T, 'id'> & { id: string }): Promise<string> {
    const row = entityToRow(item as unknown as Record<string, unknown>, this.meta);
    const cols = Object.keys(row);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${cols.map(q).join(', ')}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...Object.values(row));
    return item.id;
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    const row = entityToRow(changes as Record<string, unknown>, this.meta);
    const entries = Object.entries(row);
    if (entries.length === 0) return;
    const setClauses = entries.map(([col]) => `${q(col)} = ?`).join(', ');
    const sql = `UPDATE ${this.tableName} SET ${setClauses} WHERE id = ?`;
    this.db.prepare(sql).run(...entries.map(([, v]) => v), id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    const all = await this.getAll();
    return all.filter(predicate);
  }

  async bulkCreate(items: (Omit<T, 'id'> & { id: string })[]): Promise<string[]> {
    if (items.length === 0) return [];
    const rows = items.map((item) => entityToRow(item as unknown as Record<string, unknown>, this.meta));
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${cols.map(q).join(', ')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);

    const txn = this.db.transaction((entries: Record<string, unknown>[]) => {
      for (const entry of entries) {
        stmt.run(...cols.map((c) => entry[c]));
      }
    });
    txn(rows);
    return items.map((item) => item.id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    const sql = `DELETE FROM ${this.tableName} WHERE id IN (${placeholders})`;
    this.db.prepare(sql).run(...ids);
  }

  async count(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS cnt FROM ${this.tableName}`).get() as { cnt: number };
    return row.cnt;
  }

  async clear(): Promise<void> {
    this.db.prepare(`DELETE FROM ${this.tableName}`).run();
  }
}
