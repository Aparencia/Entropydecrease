/**
 * SQLite 服务（单例）
 *
 * 管理 better-sqlite3 连接的初始化、获取与关闭。
 * 数据库文件默认存储于 Electron userData/keban.db。
 * WAL 模式 + 外键约束在初始化时自动开启。
 *
 * @ai-context: SQLite 连接生命周期（initialize/reinitialize/checkpointAndClose)；库文件 userData/keban.db 为存量数据标识，永久豁免改名。
 */

import Database from 'better-sqlite3';
import { logger } from '../logger.js';

// ================================================================
// 模块级状态
// ================================================================

/** 单例数据库连接引用 */
let db: Database.Database | null = null;

/** 当前数据库文件路径（initialize 成功后记录） */
let currentDbPath: string | null = null;

// ================================================================
// 公共 API
// ================================================================

/**
 * 初始化 SQLite 连接
 *
 * @param dbPath - 可选自定义数据库路径；省略时使用 `userData/keban.db`
 * @returns 已初始化的 Database 实例
 *
 * 幂等调用：若连接已存在则直接返回，不会重复创建。
 */
export function initialize(dbPath?: string): Database.Database {
  if (db) {
    logger.info('[SQLite] Connection already initialized, returning existing instance');
    return db;
  }

  const resolvedPath = dbPath;
  if (!resolvedPath) {
    throw new Error('[SQLite] dbPath is required — resolve the path before calling initialize()');
  }
  logger.info(`[SQLite] Initializing database at: ${resolvedPath}`);

  try {
    db = new Database(resolvedPath);

    // 开启 WAL 模式：提升并发读写性能，减少锁竞争
    db.pragma('journal_mode = WAL');
    logger.info('[SQLite] WAL mode enabled');

    // 开启外键约束：保证引用完整性
    db.pragma('foreign_keys = ON');
    logger.info('[SQLite] Foreign key constraints enabled');

    // 设置 busy timeout（5 秒），避免 WAL checkpoint 期间立即报 SQLITE_BUSY
    db.pragma('busy_timeout = 5000');

    logger.info('[SQLite] Database initialized successfully');
    currentDbPath = resolvedPath;
    return db;
  } catch (err) {
    db = null;
    logger.error('[SQLite] Failed to initialize database', err);
    throw err;
  }
}

/**
 * 获取已初始化的数据库连接
 *
 * @throws 若尚未调用 `initialize()` 则抛出错误
 */
export function getConnection(): Database.Database {
  if (!db) {
    const msg = '[SQLite] Database not initialized — call initialize() first';
    logger.error(msg);
    throw new Error(msg);
  }
  return db;
}

/**
 * 安全关闭数据库连接
 *
 * 幂等调用：连接已关闭或从未初始化时静默返回。
 */
export function close(): void {
  if (!db) {
    logger.info('[SQLite] No active connection to close');
    return;
  }

  try {
    db.close();
    logger.info('[SQLite] Database connection closed');
  } catch (err) {
    logger.error('[SQLite] Error while closing database', err);
  } finally {
    db = null;
    currentDbPath = null;
  }
}

/**
 * 获取当前数据库文件路径
 *
 * @returns 已初始化时返回路径字符串，否则返回 null
 */
export function getDbPath(): string | null {
  return currentDbPath;
}

/**
 * 执行 WAL checkpoint 并安全关闭连接
 * 用于路径迁移前确保所有数据已写入主数据库文件
 */
export function checkpointAndClose(): void {
  if (!db) {
    logger.info('[SQLite] No active connection to checkpoint');
    return;
  }
  try {
    logger.info('[SQLite] Performing WAL checkpoint before close...');
    db.pragma('wal_checkpoint(TRUNCATE)');
    logger.info('[SQLite] WAL checkpoint completed');
  } catch (err) {
    logger.error('[SQLite] WAL checkpoint failed, proceeding with close', err);
  } finally {
    try {
      db.close();
      logger.info('[SQLite] Database connection closed after checkpoint');
    } catch (closeErr) {
      logger.error('[SQLite] Error closing database after checkpoint', closeErr);
    } finally {
      db = null;
      currentDbPath = null;
    }
  }
}

/**
 * 重新初始化数据库连接到新路径
 * 先关闭现有连接，再以新路径创建新连接
 */
export function reinitialize(newDbPath: string): Database.Database {
  logger.info(`[SQLite] Reinitializing database at: ${newDbPath}`);
  close();
  return initialize(newDbPath);
}
