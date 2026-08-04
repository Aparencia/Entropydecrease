/**
 * 操作日志 — 同步链路的本地增量记录
 *
 * @ai-context: 警告——localStorage 键 keban_device_id 是设备同步身份，
 * 改名会使设备被服务端视为新设备，引发全量重传与冲突误判，品牌统一
 * 任务明确豁免此键名。
 * @ai-context: 版本号在事务内递增保证原子性（Bug #20 修复），
 * synced 索引以 0/1 数值查询系 Dexie 布尔索引限制。
 */

import { db } from './database';
import { generateId } from '../utils/uuid';
import type { OperationLog } from '@/types/models';

// 获取或生成设备 ID（持久化到 localStorage）
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('keban_device_id');
  if (!deviceId) {
    deviceId = generateId();
    localStorage.setItem('keban_device_id', deviceId);
  }
  return deviceId;
}

// 获取下一个版本号（基于本地最大版本号 +1）
export async function getNextVersion(): Promise<number> {
  const logs = await db.operationLog.orderBy('version').reverse().limit(1).toArray();
  return logs.length > 0 ? (logs[0].version || 0) + 1 : 1;
}

// Bug #18: payload 参数改为泛型，JSON.stringify 包裹 try-catch
// Bug #20: 使用 Dexie 事务包裹 getNextVersion + add 操作确保版本号原子性
export async function logOperation<T extends Record<string, unknown>>(
  entityType: string,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  payload?: T,
  patch?: string
): Promise<void> {
  const deviceId = getDeviceId();

  let serializedPayload: string | undefined;
  if (payload) {
    try {
      serializedPayload = JSON.stringify(payload);
    } catch (e) {
      console.error('[OperationLog] Failed to serialize payload:', e);
      serializedPayload = undefined;
    }
  }

  // Bug #20: 使用事务确保 getNextVersion + add 原子性
  await db.transaction('rw', db.operationLog, async () => {
    const version = await getNextVersion();
    await db.operationLog.add({
      id: generateId(),
      entityType,
      entityId,
      operation,
      payload: serializedPayload,
      patch,
      createdAt: new Date(),
      // SYNC2-H4: 写入数值 0/1（与查询 equals(0)/equals(1) 保持一致）——
      // IndexedDB 键相等判定要求同类型，boolean 与 number 不相等会
      // 导致 getUnsyncedLogs 永远返回空、oplog push 静默失效
      synced: 0,
      version,
      deviceId,
    });
  });
}

// 获取未同步的日志（按版本号排序）
export async function getUnsyncedLogs(): Promise<OperationLog[]> {
  return db.operationLog.where('synced').equals(0).sortBy('version');
}

// 批量获取未同步日志（分页）
export async function getUnsyncedLogsBatch(batchSize: number = 50): Promise<OperationLog[]> {
  const logs = await db.operationLog
    .where('synced')
    .equals(0)
    .sortBy('version');
  return logs.slice(0, batchSize);
}

// 标记日志为已同步（SYNC2-H4: 写入数值 1 与查询一致）
export async function markLogsSynced(ids: string[]): Promise<void> {
  await db.operationLog.bulkUpdate(ids.map(id => ({
    key: id,
    changes: { synced: 1 }
  })));
}

/**
 * SYNC2-H1: 将指定实体的全部未同步日志标记为已同步。
 * 冲突 resolve 成功后调用——resolve 已代表该实体最终状态，
 * 若不清除本地日志，下次 push 时旧版本日志仍会冲突（服务端
 * 版本已推进），形成永久循环冲突。
 */
export async function markEntityLogsSynced(entityType: string, entityId: string): Promise<void> {
  const logs = await db.operationLog
    .where('entityType').equals(entityType)
    // GW-3: 用 `!== 1` 而非 `=== 0`——旧数据 synced 可能为 boolean false
    //（历史版本写入）或 undefined，严格相等会漏标，形成永久孤数据；
    // 且这些旧日志若未来迁移为 0 会重新参与 push 触发冲突循环
    .filter(l => l.entityId === entityId && l.synced !== 1)
    .toArray();
  if (logs.length === 0) return;
  await db.operationLog.bulkUpdate(logs.map(l => ({
    key: l.id,
    changes: { synced: 1 },
  })));
}

// 清理已同步的旧日志（保留最近 N 条）
export async function cleanupSyncedLogs(keepCount: number = 100): Promise<number> {
  const syncedLogs = await db.operationLog
    .where('synced')
    .equals(1)
    .sortBy('version');

  if (syncedLogs.length <= keepCount) return 0;

  const toDelete = syncedLogs.slice(0, syncedLogs.length - keepCount);
  const idsToDelete = toDelete.map(log => log.id);
  await db.operationLog.bulkDelete(idsToDelete);
  return idsToDelete.length;
}
