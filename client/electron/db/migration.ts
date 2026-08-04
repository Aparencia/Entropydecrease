/**
 * 数据迁移脚本（IndexedDB → SQLite）
 *
 * 协调模式：渲染进程读取 IndexedDB → IPC → 主进程写入 SQLite。
 * 迁移前自动备份、失败保留 IndexedDB 可重试、脚本幂等执行。
 *
 * @ai-context: IndexedDB→SQLite 数据迁移 IPC：表映射/分批导入；safeHandle 经参数注入避免循环依赖。
 */

import type Database from 'better-sqlite3';
import { getConnection } from './sqliteService.js';
import { rebuildIndex, collectIndexableData } from './fts5Search.js';
import { isImportableTable } from './importWhitelist.js';
import { logger } from '../logger.js';

// ================================================================
// 类型 & 常量
// ================================================================

export interface MigrationStatus {
  completed: boolean;
  currentTable: string;
  tablesTotal: number;
  tablesCompleted: number;
  rowsMigrated: number;
  error?: string;
}

/** Dexie 表名 → SQLite 表名映射 */
const TABLE_MAPPING: Array<{ dexie: string; sqlite: string }> = [
  { dexie: 'notes', sqlite: 'notes' },
  { dexie: 'noteFolders', sqlite: 'note_folders' },
  { dexie: 'flashcardDecks', sqlite: 'flashcard_decks' },
  { dexie: 'flashcards', sqlite: 'flashcards' },
  { dexie: 'flashcardReviews', sqlite: 'flashcard_reviews' },
  { dexie: 'feynmanNotes', sqlite: 'feynman_notes' },
  { dexie: 'feynmanSummaries', sqlite: 'feynman_summaries' },
  { dexie: 'feynmanWeakPoints', sqlite: 'feynman_weak_points' },
  { dexie: 'pomodoroSessions', sqlite: 'pomodoro_sessions' },
  { dexie: 'pomodoroSettings', sqlite: 'pomodoro_settings' },
  { dexie: 'appSettings', sqlite: 'app_settings' },
  { dexie: 'operationLog', sqlite: 'operation_log' },
  { dexie: 'syncConflicts', sqlite: 'sync_conflicts' },
  { dexie: 'offlineQueue', sqlite: 'offline_queue' },
  { dexie: 'studyCheckIns', sqlite: 'study_check_ins' },
  { dexie: 'achievements', sqlite: 'achievements' },
  { dexie: 'pomodoroGoals', sqlite: 'pomodoro_goals' },
  { dexie: 'windowCaptures', sqlite: 'window_captures' },
  { dexie: 'consent', sqlite: 'consent' },
  { dexie: 'userProfile', sqlite: 'user_profile' },
  { dexie: 'inspirations', sqlite: 'inspirations' },
  // 以下为 schema.ts 新增表的迁移映射（预测题 + AI 助手 + CRDT 同步）
  // 注意：这些表在 IndexedDB 中可能没有对应数据，映射仅用于白名单一致性
  { dexie: 'predictions', sqlite: 'predictions' },
  { dexie: 'assistantSessions', sqlite: 'assistant_sessions' },
  { dexie: 'assistantMessages', sqlite: 'assistant_messages' },
  { dexie: 'assistantTriggers', sqlite: 'assistant_triggers' },
  { dexie: 'crdtDocs', sqlite: 'crdt_docs' },
  { dexie: 'crdtChanges', sqlite: 'crdt_changes' },
];

/** 合法 SQLite 表名列表（迁移白名单；与 importWhitelist 扩展表共同构成可导入集） */
const MIGRATION_TABLE_LIST = TABLE_MAPPING.map((m) => m.sqlite);

/** camelCase → snake_case */
function toSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// ================================================================
// 核心
// ================================================================

/** 检查是否需要迁移：无 migrationComplete 标记 + SQLite 无业务数据 → 需要迁移 */
export function needsMigration(db: Database.Database): boolean {
  try {
    const row = db.prepare(`SELECT value FROM app_settings WHERE "key" = 'migrationComplete'`).get() as { value: string } | undefined;
    if (row?.value === 'true') return false;
    const notesCount = db.prepare('SELECT COUNT(*) AS cnt FROM notes').get() as { cnt: number };
    if (notesCount.cnt > 0) return false;
    return true;
  } catch (err) {
    logger.error('[Migration] Failed to check migration status', err);
    return false;
  }
}

/**
 * 导入单表数据到 SQLite（INSERT OR REPLACE）
 *
 * @param sqliteTable - SQLite 表名（snake_case，需在白名单内）
 * @param rows - 数据行数组（camelCase keys，由渲染进程发送）
 * @returns 成功插入的行数
 */
export function importTable(sqliteTable: string, rows: Record<string, unknown>[]): number {
  if (!isImportableTable(sqliteTable, MIGRATION_TABLE_LIST)) {
    throw new Error(`[Migration] Table "${sqliteTable}" is not in the migration whitelist`);
  }

  const db = getConnection();
  if (rows.length === 0) {
    logger.info(`[Migration] Table "${sqliteTable}" — 0 rows to import, skipping`);
    return 0;
  }

  // 构建列名（从第一行推断，camelCase → snake_case）
  // CL-H2: 列集合以首行为准；每行取值时显式按该列集合对齐，
  // 防止行间字段集合/顺序不一致时按位置错位写入（SQLite 不校验列类型，会静默损坏）
  const cols = Object.keys(rows[0]).map(toSnake);

  const placeholders = cols.map(() => '?').join(', ');
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const sql = `INSERT OR REPLACE INTO "${sqliteTable}" (${colList}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);

  const txn = db.transaction((items: Record<string, unknown>[]) => {
    for (const item of items) {
      // 先将本行 key 归一化为 snake_case，再按首行列集合取值（缺失补 null）
      const snakeRow: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        snakeRow[toSnake(k)] = v;
      }
      const values = cols.map((col) => {
        const val = snakeRow[col];
        // 自动 JSON 序列化对象/数组字段
        if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
          return JSON.stringify(val);
        }
        // boolean → INTEGER
        if (typeof val === 'boolean') return val ? 1 : 0;
        // Date → ISO string
        if (val instanceof Date) return val.toISOString();
        // 缺失字段补 null（better-sqlite3 不接受 undefined 绑定）
        return val === undefined ? null : val;
      });
      stmt.run(...values);
    }
  });

  txn(rows);
  logger.info(`[Migration] Imported ${rows.length} rows into "${sqliteTable}"`);
  return rows.length;
}

/**
 * 标记迁移完成
 *
 * 写入 migrationComplete 标记到 app_settings + 运行 PRAGMA integrity_check
 */
export function completeMigration(db: Database.Database): { ok: boolean; integrity: string } {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT OR REPLACE INTO app_settings (id, "key", value, updated_at) VALUES (?, 'migrationComplete', 'true', ?)`
  ).run(crypto.randomUUID(), now);

  // 运行完整性检查
  const result = db.pragma('integrity_check', { simple: true }) as string;
  const ok = result === 'ok';

  if (ok) {
    logger.info('[Migration] Migration completed successfully, integrity check passed');
  } else {
    logger.error(`[Migration] Integrity check failed: ${result}`);
  }

  return { ok, integrity: result };
}

// ================================================================
// IPC handler 注册
// ================================================================

/**
 * 注册迁移相关 IPC handler（在 main.ts 的 app.whenReady 中调用）
 *
 * 需要外部传入 safeHandle 以避免循环依赖。
 */
export function registerMigrationHandlers(
  safeHandle: <Args extends unknown[]>(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Promise<unknown>) => void,
): void {
  const db = getConnection();

  /** migration:check — 检查是否需要迁移 */
  safeHandle('migration:check', async () => {
    const needed = needsMigration(db);
    logger.info(`[Migration] Check result: ${needed ? 'migration needed' : 'no migration needed'}`);
    return { needed, tableMapping: TABLE_MAPPING };
  });

  /** migration:import-table — 导入单表数据 */
  safeHandle('migration:import-table', async (_event, params: { table: string; rows: Record<string, unknown>[] }) => {
    try {
      const count = importTable(params.table, params.rows);
      return { success: true, rowsImported: count };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Migration] Failed to import table "${params.table}"`, err);
      return { success: false, error: msg };
    }
  });

  /** migration:complete — 标记迁移完成 */
  safeHandle('migration:complete', async () => {
    try {
      const result = completeMigration(db);
      // 迁移完成后重建 FTS5 全文索引（迁移数据绕过业务写入路径，未触发增量索引维护）
      try {
        const indexData = collectIndexableData(db);
        await rebuildIndex(indexData);
        logger.info(`[Migration] FTS5 index rebuilt: ${indexData.reduce((sum, t) => sum + t.rows.length, 0)} documents`);
      } catch (ftsErr) {
        logger.warn(`[Migration] FTS5 index rebuild failed (non-fatal): ${ftsErr instanceof Error ? ftsErr.message : String(ftsErr)}`);
      }
      return { success: result.ok, integrity: result.integrity };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Migration] Failed to complete migration', err);
      return { success: false, error: msg };
    }
  });

  logger.info('[Migration] Migration IPC handlers registered');
}
