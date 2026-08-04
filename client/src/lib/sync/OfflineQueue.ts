/**
 * 离线操作队列
 *
 * @ai-context: 指数退避重试队列（nextRetryAt 水位），getReadyItems 仅返回
 * 已到退避时间的项；cleanupExpired(5) 丢弃重试超限项——丢弃即放弃该操作
 * 的云端同步（本地数据不受影响），这是产品接受的取舍。
 */
import { db } from '@/lib/storage/database';
import { generateId } from '@/lib/utils/uuid';
import type { OfflineQueueItem } from '@/types/models';
import { getDeviceId } from '@/lib/storage/operationLog';

/**
 * 计算指数退避延迟（毫秒）
 * base=1s，max=60s，附加随机抖动避免雷群效应
 */
export function calculateBackoff(retryCount: number): number {
  const baseDelay = 1000; // 1 秒
  const maxDelay = 60000; // 60 秒
  const exponential = baseDelay * Math.pow(2, retryCount);
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, maxDelay);
}

/**
 * 离线操作队列管理器
 * 在网络不可用时缓存写操作，网络恢复后按序重放
 */
export class OfflineQueue {
  private processing = false;

  /**
   * 将操作加入离线队列
   */
  async enqueue(
    entityType: string,
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    payload?: unknown
  ): Promise<string> {
    const id = generateId();
    const deviceId = getDeviceId();

    // 在 Dexie 事务内完成"读 max version + 1 + 写入"，避免版本号竞态
    // SYNC2-L4: 取最大值必须按 version（单调自增主键）而非 createdAt——
    // Date 毫秒精度下同一毫秒的并发写入会取到错误基线，产生重复版本号
    await db.transaction('rw', db.offlineQueue, async () => {
      const items = await db.offlineQueue.orderBy('version').reverse().limit(1).toArray();
      const version = items.length > 0 ? (items[0].version || 0) + 1 : 1;

      await db.offlineQueue.add({
        id,
        entityType,
        entityId,
        operation,
        payload: payload ? JSON.stringify(payload) : undefined,
        version,
        deviceId,
        createdAt: new Date(),
        retryCount: 0,
      });
    });

    return id;
  }

  /**
   * 获取所有待处理队列项
   */
  async getPendingItems(): Promise<OfflineQueueItem[]> {
    return db.offlineQueue.orderBy('version').toArray();
  }

  /**
   * 获取队列大小
   */
  async size(): Promise<number> {
    return db.offlineQueue.count();
  }

  /**
   * 移除已处理的队列项
   */
  async removeItem(id: string): Promise<void> {
    await db.offlineQueue.delete(id);
  }

  /**
   * 批量移除已处理的队列项
   */
  async removeItems(ids: string[]): Promise<void> {
    await db.offlineQueue.bulkDelete(ids);
  }

  /**
   * 增加重试计数（保留向后兼容）
   */
  async incrementRetry(id: string): Promise<void> {
    const item = await db.offlineQueue.get(id);
    if (item) {
      await db.offlineQueue.update(id, { retryCount: item.retryCount + 1 });
    }
  }

  /**
   * 调度重试：计算指数退避并设置 nextRetryAt，同时递增 retryCount
   */
  async scheduleRetry(id: string): Promise<void> {
    const item = await db.offlineQueue.get(id);
    if (item) {
      const backoff = calculateBackoff(item.retryCount);
      await db.offlineQueue.update(id, {
        retryCount: item.retryCount + 1,
        nextRetryAt: Date.now() + backoff,
      });
    }
  }

  /**
   * 获取当前可重试的队列项
   * 条件：retryCount < maxRetries 且 (nextRetryAt 未设置 或 nextRetryAt <= Date.now())
   */
  async getReadyItems(maxRetries: number = 5): Promise<OfflineQueueItem[]> {
    const now = Date.now();
    const items = await db.offlineQueue.orderBy('version').toArray();
    return items.filter(
      item =>
        item.retryCount < maxRetries &&
        (item.nextRetryAt == null || item.nextRetryAt <= now)
    );
  }

  /**
   * 清理超过最大重试次数的项
   */
  async cleanupExpired(maxRetries: number = 5): Promise<number> {
    const items = await db.offlineQueue.toArray();
    const expired = items.filter(item => item.retryCount >= maxRetries);
    if (expired.length > 0) {
      await db.offlineQueue.bulkDelete(expired.map(item => item.id));
    }
    return expired.length;
  }

  /**
   * 清空整个队列
   */
  async clear(): Promise<void> {
    await db.offlineQueue.clear();
  }

  /**
   * 检查队列是否为空
   */
  async isEmpty(): Promise<boolean> {
    return (await db.offlineQueue.count()) === 0;
  }

  /**
   * 是否正在处理中
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * 设置处理状态
   */
  setProcessing(value: boolean): void {
    this.processing = value;
  }
}

// 单例导出
export const offlineQueue = new OfflineQueue();
