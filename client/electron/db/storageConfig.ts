/**
 * 存储路径配置管理
 *
 * 将自定义存储路径持久化到 userData/storage-config.json，
 * 确保主进程启动时能读取用户的路径偏好。
 * 配置文件始终存放在 app.getPath('userData')，即使用户选择了自定义数据路径。
 *
 * @ai-context: 自定义存储路径配置持久化；resolveDbPath 回退 userData/keban.db（豁免标识）。
 */

import { app } from 'electron';
import * as path from 'path';
import { readFile, writeFile, access } from 'fs/promises';
import { logger } from '../logger.js';

// ================================================================
// 类型定义
// ================================================================

interface StorageConfig {
  customStoragePath: string | null;
}

// ================================================================
// 常量
// ================================================================

const CONFIG_FILENAME = 'storage-config.json';

// ================================================================
// 公共 API
// ================================================================

/** 返回配置文件完整路径 */
export function getConfigFilePath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME);
}

/** 读取自定义存储路径，无配置时返回 null */
export async function getCustomStoragePath(): Promise<string | null> {
  try {
    const configPath = getConfigFilePath();
    try {
      await access(configPath);
    } catch {
      return null;
    }
    const raw = await readFile(configPath, 'utf-8');
    const config: StorageConfig = JSON.parse(raw);
    return config.customStoragePath ?? null;
  } catch (err) {
    logger.error('[StorageConfig] Failed to read config', err);
    return null;
  }
}

/** 持久化自定义存储路径 */
export async function saveCustomStoragePath(dirPath: string): Promise<void> {
  const configPath = getConfigFilePath();
  const config: StorageConfig = { customStoragePath: dirPath };
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  logger.info(`[StorageConfig] Saved custom storage path: ${dirPath}`);
}

/** 清除自定义路径配置（恢复默认） */
export async function clearCustomStoragePath(): Promise<void> {
  const configPath = getConfigFilePath();
  const config: StorageConfig = { customStoragePath: null };
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  logger.info('[StorageConfig] Cleared custom storage path, using default');
}

/**
 * 解析最终数据库文件路径
 * 优先使用自定义路径，否则回退到 userData/keban.db
 */
export async function resolveDbPath(): Promise<string> {
  const customPath = await getCustomStoragePath();
  if (customPath) {
    return path.join(customPath, 'keban.db');
  }
  return path.join(app.getPath('userData'), 'keban.db');
}
