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
// FTS5 全文搜索引擎——优先使用 BM25 排序搜索，LIKE 作为降级方案
import { search as fts5Search, indexDocument, removeDocument, FTS_INDEXABLE_TABLES } from './fts5Search.js';
import { logger } from '../logger.js';

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
  // predictions — 预测题表（基于笔记内容生成的预测问答）
  'predictions',
  // assistant_sessions — AI 助手会话记录
  'assistant_sessions',
  // assistant_messages — AI 助手消息记录
  'assistant_messages',
  // assistant_triggers — AI 助手触发规则记录
  'assistant_triggers',
  // world_snapshots — 世界状态快照（渲染进程 retention 数据→MCP 记忆服务器跨进程桥）
  'world_snapshots',
  // crdt_docs — CRDT 同步引擎文档快照（v3 迁移新增）
  'crdt_docs',
  // crdt_changes — CRDT 同步引擎变更日志（v3 迁移新增）
  'crdt_changes',
  // implementation_intentions — A4 实施意图（v6 迁移新增）
  'implementation_intentions',
  // imports — 知识入籍记录（v8 迁移新增）
  'imports',
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
  // 以下为 v1.0.0 新增表映射（预测题 + AI 助手 + CRDT 同步）
  predictions: 'predictions',
  assistantSessions: 'assistant_sessions',
  assistantMessages: 'assistant_messages',
  assistantTriggers: 'assistant_triggers',
  crdtDocs: 'crdt_docs',
  crdtChanges: 'crdt_changes',
  // v6 新增：A4 实施意图
  implementationIntentions: 'implementation_intentions',
  // v7 新增：世界状态快照（MCP 记忆接口跨进程桥）
  worldSnapshots: 'world_snapshots',
  // v8 新增：知识入籍记录（阶段 A 入口问题）
  imports: 'imports',
};

function resolveTable(table: string): string {
  const snakeName = TABLE_NAME_MAP[table] || table;
  if (!ALLOWED_TABLES.has(snakeName)) {
    throw new Error(`[DB] Table "${table}" is not in the allowed whitelist`);
  }
  return snakeName;
}

/**
 * 尝试从行数据中提取 FTS 索引所需的 title/content 字段。
 * 如果表不在 FTS_INDEXABLE_TABLES 配置中，或行数据缺少对应字段，则返回 null。
 * 这是增量索引维护的核心——只有配置了映射关系的表才会被索引。
 */
function extractFtsFields(tableName: string, row: Record<string, unknown>): { title: string; content: string } | null {
  const cfg = FTS_INDEXABLE_TABLES.find((t) => t.table === tableName);
  if (!cfg) return null; // 该表不需要 FTS 索引

  // 从行数据中读取配置的字段（titleField 可选，contentField 必须有）
  const title = cfg.titleField ? String(row[cfg.titleField] ?? '') : '';
  const content = String(row[cfg.contentField] ?? '');

  // 如果 content 为空，跳过索引（无意义）
  if (!content) return null;
  return { title, content };
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
    // SEC: 过滤非法列名，防止列名注入
    const sanitized = repo.filterAllowedColumns(params.item as SqliteRow);
    const result = await repo.create(sanitized as Omit<SqliteRow, 'id'> & { id: string });

    // 增量索引维护：对含 title/content 字段的表自动更新 FTS5 索引
    // 在插入成功后同步执行，确保搜索索引与业务数据保持一致
    const ftsFields = extractFtsFields(tableName, params.item);
    if (ftsFields && params.item.id) {
      try {
        indexDocument(tableName, String(params.item.id), ftsFields.title, ftsFields.content);
      } catch (err) {
        // FTS 索引更新失败不应阻塞业务操作——仅记录警告
        logger.warn(`[FTS5] Failed to index document after insert: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  });

  /** db:update — 更新：接收 { table, id, changes } → update() */
  safeHandle('db:update', async (_event, params: { table: string; id: string; changes: Record<string, unknown> }) => {
    const tableName = resolveTable(params.table);
    const repo = new SqliteRepository<SqliteRow>(tableName);
    // SEC: 过滤非法列名，防止列名注入
    const sanitized = repo.filterAllowedColumns(params.changes as Partial<SqliteRow>);
    const result = await repo.update(params.id, sanitized);

    // 增量索引维护：更新操作需要重新读取完整行数据（changes 可能只包含部分字段），
    // 然后更新 FTS5 索引中的对应文档
    if (Object.keys(params.changes).length > 0) {
      try {
        const dbConn = getConnection();
        const fullRow = dbConn.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(params.id) as Record<string, unknown> | undefined;
        if (fullRow) {
          const ftsFields = extractFtsFields(tableName, fullRow);
          if (ftsFields) {
            indexDocument(tableName, params.id, ftsFields.title, ftsFields.content);
          }
        }
      } catch (err) {
        // FTS 索引更新失败不应阻塞业务操作——仅记录警告
        logger.warn(`[FTS5] Failed to index document after update: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  });

  /** db:delete — 删除：接收 { table, id } → delete() */
  safeHandle('db:delete', async (_event, params: { table: string; id: string }) => {
    const tableName = resolveTable(params.table);
    const repo = new SqliteRepository<SqliteRow>(tableName);
    const result = await repo.delete(params.id);

    // 增量索引维护：删除业务数据后同步清理 FTS5 索引中的对应文档，
    // 避免搜索结果指向已删除的数据（幽灵引用）
    try {
      removeDocument(tableName, params.id);
    } catch (err) {
      // FTS 索引删除失败不应阻塞业务操作——仅记录警告
      logger.warn(`[FTS5] Failed to remove document from index: ${err instanceof Error ? err.message : String(err)}`);
    }

    return result;
  });

  /**
   * db:search — 搜索：优先使用 FTS5 全文搜索（BM25 排序 + snippet 高亮），
   * 当 FTS5 不可用（虚拟表未初始化、查询语法错误等）时降级到 LIKE 模糊匹配。
   * FTS5 在 main.ts 启动链中通过 initializeFTS() 初始化。
   */
  safeHandle('db:search', async (_event, params: { table: string; query: string }) => {
    const tableName = resolveTable(params.table);
    const query = params.query?.trim();
    if (!query) return [];

    // 优先使用 FTS5 全文搜索（BM25 排序，结果质量更高）
    try {
      const ftsResults = fts5Search(query, { table: tableName, limit: 20, highlight: true });
      if (ftsResults.length > 0) {
        // FTS5 返回的是 { id, table, title, snippet, rank }，需要回查原表获取完整行
        const dbConn = getConnection();
        const ids = ftsResults.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const rows = dbConn.prepare(
          `SELECT * FROM "${tableName}" WHERE id IN (${placeholders})`
        ).all(...ids) as Array<Record<string, unknown>>;
        // 按 FTS5 排序结果排列行（保持 BM25 相关性顺序）
        const rowMap = new Map(rows.map((r) => [r.id as string, r]));
        return ftsResults
          .map((r) => rowMap.get(r.id))
          .filter(Boolean) as Array<Record<string, unknown>>;
      }
    } catch (err) {
      // FTS5 搜索失败（如虚拟表不存在、SQL 执行错误），降级到 LIKE 搜索。
      // fts5Search() 不再内部吞没异常——致命错误会传播到这里被捕获。
      logger.warn(`[DB] FTS5 search failed, falling back to LIKE: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 降级方案：LIKE 模糊匹配（兼容 FTS5 不可用或结果为空时）
    const dbConn = getConnection();
    const like = `%${query}%`;
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
