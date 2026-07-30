import { db } from './database';
import { encryptBackup, decryptBackup, type EncryptedBackup } from '@/lib/crypto/backupCrypto';
import type { AppSettings } from '@/types/models';
import { exportAllData, importData, readFileAsText, type ExportData } from './fullExport';

/**
 * 备份服务模块（加密备份 + 自动备份轮转）
 *
 * @ai-context: format 标识 'keban-encrypted-backup' 已写入全体用户的历史
 * 备份文件，restoreFromBackup 依赖它识别格式——绝对不可改名（品牌统一
 * 任务明确豁免此字符串）。
 * @ai-context: 自动备份存储在 appSettings 表（auto_backup_0..2 三槽循环
 * 覆盖），不占用独立表；listAutoBackups 的 sizeBytes 是字符长度近似值。
 */

/** 加密备份文件结构 */
export interface EncryptedBackupFile {
  format: 'keban-encrypted-backup';
  version: string;
  createdAt: string;
  encrypted: boolean;
  payload: EncryptedBackup | ExportData;
}

/**
 * 创建加密备份
 *
 * 复用现有 exportAllData 全量导出，再通过 backupCrypto 加密。
 * 若不传 password，则创建未加密的明文备份（向后兼容）。
 *
 * @param password 可选密码（提供时启用 AES-256-GCM 加密）
 * @returns 序列化后的备份 JSON 字符串
 */
export async function createEncryptedBackup(password?: string): Promise<string> {
  const jsonStr = await exportAllData();
  const parsed = JSON.parse(jsonStr) as ExportData;

  const file: EncryptedBackupFile = {
    format: 'keban-encrypted-backup',
    version: '2.0',
    createdAt: new Date().toISOString(),
    encrypted: !!password,
    payload: password
      ? await encryptBackup(jsonStr, password)
      : parsed,
  };

  return JSON.stringify(file);
}

/**
 * 从备份文件恢复数据
 *
 * 自动检测备份文件是否加密：
 * - 加密备份：需提供密码解密后导入
 * - 明文备份：直接导入
 *
 * @param file 备份文件（File 对象或 JSON 字符串）
 * @param password 解密密码（加密备份时必填）
 */
export async function restoreFromBackup(
  file: File | string,
  password?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const text = typeof file === 'string' ? file : await readFileAsText(file);
    const parsed = JSON.parse(text);

    // 检测是否为 v0.9.0 加密备份格式
    if (parsed?.format === 'keban-encrypted-backup') {
      if (parsed.encrypted) {
        if (!password) {
          return { success: false, message: '该备份已加密，请输入密码' };
        }
        const encryptedPayload = parsed.payload as EncryptedBackup;
        const decrypted = await decryptBackup(encryptedPayload, password);
        return importData(decrypted);
      } else {
        // 未加密的 keban-encrypted-backup 格式
        const payload = parsed.payload as ExportData;
        return importData(JSON.stringify(payload));
      }
    }

    // 兼容旧版明文备份格式（直接 ExportData 结构）
    return importData(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误';
    return { success: false, message: `恢复失败：${msg}` };
  }
}

// ---------------------------------------------------------------------------
// 自动备份
// ---------------------------------------------------------------------------

/** 自动备份最大保留份数 */
const MAX_AUTO_BACKUPS = 3;
/** 自动备份 appSettings key 前缀 */
const AUTO_BACKUP_KEY_PREFIX = 'auto_backup_';
/** 自动备份索引 key */
const AUTO_BACKUP_INDEX_KEY = 'auto_backup_index';

/**
 * 创建一次自动备份
 *
 * 备份内容存储在 IndexedDB appSettings 表中，最多保留 MAX_AUTO_BACKUPS 份。
 * 当超出数量时，自动删除最旧的备份。
 */
export async function createAutoBackup(): Promise<void> {
  const jsonStr = await exportAllData();

  // 读取当前索引（循环计数器 0..MAX_AUTO_BACKUPS-1）
  const indexSetting = await db.appSettings.where('key').equals(AUTO_BACKUP_INDEX_KEY).first();
  const currentIndex = indexSetting ? Number(indexSetting.value) || 0 : 0;

  const backupKey = `${AUTO_BACKUP_KEY_PREFIX}${currentIndex}`;
  const now = new Date();

  // 写入备份数据
  await db.appSettings.put({
    id: crypto.randomUUID(),
    key: backupKey,
    value: jsonStr,
    updatedAt: now,
  } as AppSettings);

  // 更新索引（循环递增）
  const nextIndex = (currentIndex + 1) % MAX_AUTO_BACKUPS;
  await db.appSettings.put({
    id: crypto.randomUUID(),
    key: AUTO_BACKUP_INDEX_KEY,
    value: String(nextIndex),
    updatedAt: now,
  } as AppSettings);
}

/**
 * 获取所有自动备份的元信息（不含完整数据，仅时间和大小）
 */
export async function listAutoBackups(): Promise<Array<{ index: number; updatedAt: Date; sizeBytes: number }>> {
  const results: Array<{ index: number; updatedAt: Date; sizeBytes: number }> = [];

  for (let i = 0; i < MAX_AUTO_BACKUPS; i++) {
    const key = `${AUTO_BACKUP_KEY_PREFIX}${i}`;
    const entry = await db.appSettings.where('key').equals(key).first();
    if (entry) {
      results.push({
        index: i,
        updatedAt: entry.updatedAt ?? new Date(),
        sizeBytes: (entry.value ?? '').length,
      });
    }
  }

  // 按更新时间降序
  return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * 从自动备份中恢复指定索引的数据
 */
export async function restoreFromAutoBackup(index: number): Promise<{ success: boolean; message: string }> {
  const key = `${AUTO_BACKUP_KEY_PREFIX}${index}`;
  const entry = await db.appSettings.where('key').equals(key).first();

  if (!entry?.value) {
    return { success: false, message: `未找到索引为 ${index} 的自动备份` };
  }

  return importData(entry.value);
}
