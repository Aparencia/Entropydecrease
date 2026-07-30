/**
 * 存储路径与备份 IPC handlers（storage:* / backup:* / dialog / fs）
 *
 * @ai-context: 从 main.ts 拆出。storage:change-path 是七步事务式迁移
 * （验证→备份→checkpoint→迁移→完整性校验→重连→持久化），任一步失败
 * 回滚旧路径；isChangingPath 互斥锁防并发切换。'keban.db' 文件名为
 * 存量用户数据标识，永久豁免品牌改名。
 * @ai-context: fs:read-file 仅允许 userData/temp 目录（路径穿越防护）；
 * 备份文件名前缀 entropy-decrease-backup（新品牌）。
 */
import { app, dialog } from 'electron';
import * as path from 'path';
import { writeFile, readFile } from 'fs/promises';
import { safeHandle } from './ipcUtils.js';
import { logger } from './logger.js';
import { getConnection, checkpointAndClose, reinitialize, getDbPath } from './db/sqliteService.js';
import { initializeSchema } from './db/schema.js';
import { saveCustomStoragePath, resolveDbPath } from './db/storageConfig.js';
import { migrateDatabaseFiles, verifyDatabaseIntegrity, createBackup } from './db/dbFileMigrator.js';

/** SQLite 主库文件名 — 存量用户数据标识，绝对不可改名 */
const DB_FILE_NAME = 'keban.db';

/** v1.1.0: 存储路径切换互斥锁 */
let isChangingPath = false;

/** 回滚到指定目录的数据库（迁移失败/校验失败共用） */
function rollbackToPath(dir: string, stage: string): void {
  try {
    reinitialize(path.join(dir, DB_FILE_NAME));
    initializeSchema(getConnection());
    logger.info(`[Storage] Rolled back to previous path (${stage})`);
  } catch (rollbackErr) {
    logger.error(`[Storage] Rollback after ${stage} also failed!`, rollbackErr);
  }
}

/**
 * 注册存储/备份/文件对话框相关 IPC handlers（app ready 后调用一次）
 */
export function registerStorageIpcHandlers(): void {
  safeHandle('get-default-storage-path', async () => {
    return app.getPath('userData');
  });

  // 文件读取 IPC handler（仅允许读取应用数据目录或临时目录下的文件）
  safeHandle('fs:read-file', async (_event, filePath: string) => {
    const appDataPath = app.getPath('userData');
    const tempPath = app.getPath('temp');
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(appDataPath) && !resolvedPath.startsWith(tempPath)) {
      throw new Error('不允许读取该路径的文件');
    }

    const buffer = await readFile(resolvedPath);
    return buffer.buffer; // 返回 ArrayBuffer
  });

  safeHandle('dialog:selectDirectory', async (_event, options?: { title?: string; defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title || '选择数据存储目录',
      defaultPath: options?.defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null };
    }

    return { canceled: false, path: result.filePaths[0] };
  });

  // v1.1.0: 获取当前实际使用的存储路径
  safeHandle('storage:get-active-path', async () => {
    return getDbPath() ?? await resolveDbPath();
  });

  // v1.1.0: 存储路径切换（含数据迁移）
  safeHandle('storage:change-path', async (_event, args: { newPath: string }) => {
    if (isChangingPath) {
      return { success: false, error: '正在处理路径切换，请稍后重试' };
    }

    isChangingPath = true;
    const previousPath = path.dirname(getDbPath() ?? await resolveDbPath());

    try {
      const { newPath } = args;

      // 1. 验证路径不同
      const normalizedNew = path.resolve(newPath);
      const normalizedOld = path.resolve(previousPath);
      if (normalizedNew === normalizedOld) {
        return { success: false, error: '新路径与当前路径相同' };
      }

      logger.info(`[Storage] Switching storage path: ${normalizedOld} → ${normalizedNew}`);

      // 2. 为旧数据库创建备份
      await createBackup(normalizedOld);

      // 3. WAL checkpoint 并关闭旧连接
      checkpointAndClose();

      // 4. 迁移数据库文件
      const migrationResult = await migrateDatabaseFiles(normalizedOld, normalizedNew);
      if (!migrationResult.success) {
        logger.error('[Storage] Migration failed:', migrationResult.error);
        rollbackToPath(normalizedOld, 'migration failure');
        return { success: false, error: migrationResult.error };
      }

      // 5. 验证新数据库完整性
      const newDbPath = path.join(normalizedNew, DB_FILE_NAME);
      if (!verifyDatabaseIntegrity(newDbPath)) {
        logger.error('[Storage] Integrity check failed for new database');
        rollbackToPath(normalizedOld, 'integrity check failure');
        return { success: false, error: '新数据库完整性校验失败，已回滚到原路径' };
      }

      // 6. 重新连接到新路径
      reinitialize(newDbPath);
      initializeSchema(getConnection());

      // 7. 持久化新路径配置
      await saveCustomStoragePath(normalizedNew);

      logger.info(`[Storage] Path switch completed: ${normalizedNew}`);
      return {
        success: true,
        previousPath: normalizedOld,
        newPath: normalizedNew,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('[Storage] Path switch failed', err);
      rollbackToPath(previousPath, 'unexpected error');
      return { success: false, error: '路径切换失败: ' + errorMsg };
    } finally {
      isChangingPath = false;
    }
  });

  // ================================================================
  // v0.9.0: 备份相关 IPC handlers
  // ================================================================

  /**
   * 显示保存对话框并将备份数据写入文件
   */
  safeHandle('backup:save', async (_event, data: string, defaultName?: string) => {
    const filename = defaultName || `entropy-decrease-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const result = await dialog.showSaveDialog({
      title: '保存备份文件',
      defaultPath: filename,
      filters: [
        { name: '熵减备份文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true, path: null };
    }

    try {
      await writeFile(result.filePath, data, 'utf-8');
      return { success: true, canceled: false, path: result.filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '写入失败';
      return { success: false, canceled: false, path: null, error: msg };
    }
  });

  /**
   * 显示打开对话框，选择备份文件并读取内容
   */
  safeHandle('backup:open', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择备份文件',
      filters: [
        { name: '熵减备份文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true, content: null };
    }

    try {
      const content = await readFile(result.filePaths[0], 'utf-8');
      return { success: true, canceled: false, content, path: result.filePaths[0] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '读取失败';
      return { success: false, canceled: false, content: null, error: msg };
    }
  });
}
