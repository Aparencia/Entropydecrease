/**
 * 数据访问 IPC handlers（db:*，v1.0.0）
 *
 * @ai-context: 从 main.ts 拆出。安全模型：表名白名单 + 方法白名单，
 * 不暴露原始 SQL 给渲染进程；ALLOWED_TABLES 与 schema.ts 建表清单
 * 必须同步维护，新增业务表需两处登记。
 * @ai-context: SqliteRow 以 Record+id 约束替代 any（动态表名场景
 * 无法静态推导具体行类型，这是类型收窄的边界）。
 */
import { safeHandle } from '../ipcUtils.js';
import { getConnection } from './sqliteService.js';
import SqliteRepository from './sqliteRepository.js';

/** 动态表名场景下的通用行类型（替代 any 的受控收窄） */
type SqliteRow = Record<string, unknown> & { id: string };

/** 允许的表名白名单（防止 SQL 注入，不暴露原始 SQL） */
const ALLOWED_TABLES = new Set([
  'notes', 'note_folders', 'flashcard_decks', 'flashcards',
  'flashcard_reviews', 'feynman_notes', 'feynman_summaries',
  'feynman_weak_points', 'operation_log', 'app_settings',
  'sync_conflicts', 'offline_queue', 'study_check_ins',
  'achievements', 'pomodoro_goals', 'pomodoro_sessions',
  'pomodoro_settings', 'window_captures', 'consent',
  'user_profile', 'inspirations', 'search_index',
]);

/** camelCase → snake_case（用于表名映射） */
const TABLE_NAME_MAP: Record<string, string> = {
  notes: 'notes',
  noteFolders: 'note_folders',
  flashcardDecks: 'flashcard_decks',
  flashcards: 'flashcards',
  flashcardReviews: 'flashcard_reviews',
  feynmanNotes: 'feynman_notes',
  feynmanSummaries: 'feynman_summaries',
  feynmanWeakPoints: 'feynman_weak_points',
  operationLog: 'operation_log',
  appSettings: 'app_settings',
  syncConflicts: 'sync_conflicts',
  offlineQueue: 'offline_queue',
  studyCheckIns: 'study_check_ins',
  achievements: 'achievements',
  pomodoroGoals: 'pomodoro_goals',
  pomodoroSessions: 'pomodoro_sessions',
  pomodoroSettings: 'pomodoro_settings',
  windowCaptures: 'window_captures',
  consent: 'consent',
  userProfile: 'user_profile',
  inspirations: 'inspirations',
  searchIndex: 'search_index',
};

function resolveTable(table: string): string {
  const snakeName = TABLE_NAME_MAP[table] || table;
  if (!ALLOWED_TABLES.has(snakeName)) {
    throw new Error(`[DB] Table "${table}" is not in the allowed whitelist`);
  }
  return snakeName;
}

/**
 * 注册全部 db:* IPC handlers（app ready 后调用一次）
 */
export function registerDbIpcHandlers(): void {
  /** db:query — 查询：接收 { table, method, args } → 调用 SqliteRepository 对应方法 */
  safeHandle('db:query', async (_event, params: { table: string; method: string; args?: unknown[] }) => {
    const tableName = resolveTable(params.table);
    const repo = new SqliteRepository<SqliteRow>(tableName);
    const allowedMethods = ['getAll', 'getById', 'count'] as const;
    const method = params.method as (typeof allowedMethods)[number];
    if (!allowedMethods.includes(method)) {
      throw new Error(`[DB] Query method "${params.method}" is not allowed`);
    }
    const fn = repo[method];
    if (typeof fn !== 'function') {
      throw new Error(`[DB] Method "${params.method}" does not exist on repository`);
    }
    return await (fn as (...args: unknown[]) => Promise<unknown>).call(repo, ...(params.args ?? []));
  });

  /** db:insert — 插入：接收 { table, item } → create() */
  safeHandle('db:insert', async (_event, params: { table: string; item: Record<string, unknown> }) => {
    const tableName = resolveTable(params.table);
    const repo = new SqliteRepository<SqliteRow>(tableName);
    return await repo.create(params.item as SqliteRow);
  });

  /** db:update — 更新：接收 { table, id, changes } → update() */
  safeHandle('db:update', async (_event, params: { table: string; id: string; changes: Record<string, unknown> }) => {
    const tableName = resolveTable(params.table);
    const repo = new SqliteRepository<SqliteRow>(tableName);
    return await repo.update(params.id, params.changes as Partial<SqliteRow>);
  });

  /** db:delete — 删除：接收 { table, id } → delete() */
  safeHandle('db:delete', async (_event, params: { table: string; id: string }) => {
    const tableName = resolveTable(params.table);
    const repo = new SqliteRepository<SqliteRow>(tableName);
    return await repo.delete(params.id);
  });

  /** db:search — 搜索：LIKE 模糊匹配（FTS5 在 T0.5 实现） */
  safeHandle('db:search', async (_event, params: { table: string; query: string }) => {
    const tableName = resolveTable(params.table);
    const dbConn = getConnection();
    const like = `%${params.query}%`;
    // 对 notes 表搜索 title 和 content，其余表搜索所有 TEXT 列
    if (tableName === 'notes') {
      return dbConn.prepare(
        `SELECT * FROM notes WHERE title LIKE ? OR content LIKE ?`
      ).all(like, like);
    }
    // 通用回退：获取表的 TEXT 列并搜索
    const colInfo = dbConn.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string; type: string }>;
    const textCols = colInfo.filter((c) => c.type === 'TEXT' && c.name !== 'id');
    if (textCols.length === 0) return [];
    const where = textCols.map((c) => `"${c.name}" LIKE ?`).join(' OR ');
    return dbConn.prepare(`SELECT * FROM "${tableName}" WHERE ${where}`).all(...textCols.map(() => like));
  });

  /** db:batch — 批量操作：事务执行 */
  safeHandle('db:batch', async (_event, params: { operations: Array<{ type: string; table: string; [key: string]: unknown }> }) => {
    const dbConn = getConnection();

    const txn = dbConn.transaction(() => {
      for (const op of params.operations) {
        const tableName = resolveTable(op.table as string);
        switch (op.type) {
          case 'insert': {
            const item = op.item as Record<string, unknown>;
            const cols = Object.keys(item);
            const placeholders = cols.map(() => '?').join(', ');
            const sql = `INSERT INTO "${tableName}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
            dbConn.prepare(sql).run(...Object.values(item));
            break;
          }
          case 'update': {
            const changes = op.changes as Record<string, unknown>;
            const entries = Object.entries(changes);
            if (entries.length === 0) break;
            const setClauses = entries.map(([col]) => `"${col}" = ?`).join(', ');
            const sql = `UPDATE "${tableName}" SET ${setClauses} WHERE id = ?`;
            dbConn.prepare(sql).run(...entries.map(([, v]) => v), op.id as string);
            break;
          }
          case 'delete':
            dbConn.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).run(op.id as string);
            break;
          default:
            throw new Error(`[DB] Unknown batch operation type: ${op.type}`);
        }
      }
    });
    txn();
    return { success: true };
  });
}
