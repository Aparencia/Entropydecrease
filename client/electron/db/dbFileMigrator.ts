/**
 * 数据库文件迁移模块
 *
 * 负责将 SQLite 数据库文件（含 WAL/SHM）从一个目录复制到另一个目录，
 * 包含完整性校验和备份功能。
 *
 * 注意：WAL checkpoint 应在调用本模块之前由 sqliteService.checkpointAndClose() 完成。
 *
 * @ai-context: SQLite 数据库文件迁移（keban.db/-wal/-shm 三文件为存量用户数据标识，永久豁免品牌改名）：复制后校验、旧库改 .bak。
 */

import { copyFile, mkdir, stat, access, rm } from 'fs/promises';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { logger } from '../logger.js';

// ================================================================
// 类型定义
// ================================================================

export interface MigrationResult {
  success: boolean;
  sourcePath: string;
  targetPath: string;
  error?: string;
  filesCopied?: string[];
}

// ================================================================
// 常量
// ================================================================

const DB_FILES = ['keban.db', 'keban.db-wal', 'keban.db-shm'];

// ================================================================
// 内部工具函数
// ================================================================

/**
 * 计算文件的 SHA-256 哈希
 */
function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查目标磁盘可用空间是否足够
 */
async function checkDiskSpace(targetDir: string, requiredBytes: number): Promise<boolean> {
  try {
    // 使用 fs.statfs（Node.js 18.15+）检查磁盘空间
    const { statfs } = await import('fs/promises');
    const stats = await statfs(targetDir);
    const availableBytes = stats.bavail * stats.bsize;
    return availableBytes >= requiredBytes * 1.1; // 留 10% 余量
  } catch (err) {
    const errInfo = err instanceof Error ? err.message : String(err);
    logger.warn(`[DBMigrator] Failed to check disk space, proceeding anyway: ${errInfo}`);
    return true; // 无法检查时不阻塞
  }
}

/**
 * 清理失败的迁移（删除目标目录中的数据库文件副本）
 */
async function cleanupFailedMigration(targetDir: string): Promise<void> {
  for (const fileName of DB_FILES) {
    const filePath = path.join(targetDir, fileName);
    try {
      if (await fileExists(filePath)) {
        await rm(filePath);
        logger.info(`[DBMigrator] Cleaned up failed copy: ${fileName}`);
      }
    } catch (err) {
      logger.error(`[DBMigrator] Failed to cleanup ${fileName}`, err);
    }
  }
}

// ================================================================
// 公共 API
// ================================================================

/**
 * 迁移数据库文件从源目录到目标目录
 *
 * 复制 keban.db / keban.db-wal / keban.db-shm，并在每个文件复制后
 * 进行 SHA-256 完整性校验。校验失败时自动清理已复制文件。
 */
export async function migrateDatabaseFiles(
  sourceDir: string,
  targetDir: string,
): Promise<MigrationResult> {
  const sourceDb = path.join(sourceDir, 'keban.db');

  // 1. 检查源数据库存在
  if (!(await fileExists(sourceDb))) {
    return {
      success: false,
      sourcePath: sourceDir,
      targetPath: targetDir,
      error: '源数据库文件不存在: ' + sourceDb,
    };
  }

  try {
    // 2. 确保目标目录存在
    await mkdir(targetDir, { recursive: true });

    // 3. 检查磁盘空间
    const sourceStats = await stat(sourceDb);
    let totalSize = sourceStats.size;

    // 计算所有存在的文件大小
    for (const fileName of DB_FILES) {
      const filePath = path.join(sourceDir, fileName);
      if (await fileExists(filePath)) {
        const fileStat = await stat(filePath);
        totalSize += fileStat.size;
      }
    }

    const hasSpace = await checkDiskSpace(targetDir, totalSize);
    if (!hasSpace) {
      return {
        success: false,
        sourcePath: sourceDir,
        targetPath: targetDir,
        error: '目标磁盘空间不足，请确保至少有 ' + Math.ceil(totalSize * 1.1 / 1024 / 1024) + ' MB 可用空间',
      };
    }

    // 4. 复制所有数据库文件
    const copiedFiles: string[] = [];

    for (const fileName of DB_FILES) {
      const sourcePath = path.join(sourceDir, fileName);
      const targetPath = path.join(targetDir, fileName);

      if (await fileExists(sourcePath)) {
        logger.info(`[DBMigrator] Copying ${fileName}...`);
        await copyFile(sourcePath, targetPath);
        copiedFiles.push(fileName);

        // 5. 校验完整性（SHA-256）
        const sourceHash = await computeFileHash(sourcePath);
        const targetHash = await computeFileHash(targetPath);

        if (sourceHash !== targetHash) {
          // 校验失败，清理已复制文件
          logger.error(`[DBMigrator] Hash mismatch for ${fileName}`);
          await cleanupFailedMigration(targetDir);
          return {
            success: false,
            sourcePath: sourceDir,
            targetPath: targetDir,
            error: `文件完整性校验失败: ${fileName}`,
          };
        }

        logger.info(`[DBMigrator] ${fileName} copied and verified`);
      }
    }

    logger.info(`[DBMigrator] Migration completed: ${copiedFiles.length} files copied`);
    return {
      success: true,
      sourcePath: sourceDir,
      targetPath: targetDir,
      filesCopied: copiedFiles,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[DBMigrator] Migration failed', err);
    await cleanupFailedMigration(targetDir);
    return {
      success: false,
      sourcePath: sourceDir,
      targetPath: targetDir,
      error: '迁移失败: ' + errorMsg,
    };
  }
}

/**
 * 验证数据库文件完整性
 *
 * 使用 SQLite PRAGMA integrity_check 检测数据库是否完好。
 */
export function verifyDatabaseIntegrity(dbPath: string): boolean {
  let tempDb: Database.Database | null = null;
  try {
    tempDb = new Database(dbPath, { readonly: true });
    const result = tempDb.pragma('integrity_check', { simple: true });
    const ok = result === 'ok';
    logger.info(`[DBMigrator] Integrity check: ${result}`);
    return ok;
  } catch (err) {
    logger.error('[DBMigrator] Integrity check failed', err);
    return false;
  } finally {
    if (tempDb) {
      try { tempDb.close(); } catch { /* ignore */ }
    }
  }
}

/**
 * 为旧路径数据库创建备份
 * 将 keban.db / keban.db-wal / keban.db-shm 各复制为 .bak（同目录）
 */
export async function createBackup(dbDir: string): Promise<void> {
  for (const fileName of DB_FILES) {
    const sourcePath = path.join(dbDir, fileName);
    const backupPath = path.join(dbDir, fileName + '.bak');
    if (await fileExists(sourcePath)) {
      await copyFile(sourcePath, backupPath);
      logger.info(`[DBMigrator] Backup created: ${fileName}.bak`);
    }
  }
}
