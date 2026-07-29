import { apiClient } from '@/lib/http/apiClient';
import { getDeviceId } from '../storage/operationLog';
import { offlineQueue } from './OfflineQueue';
import { networkManager } from './NetworkManager';
import type { SyncConflict } from '@/types/models';
import { crdtEngine, getSyncMode } from './crdtEngine';
import { oplogPush, oplogPull, safeJsonParse } from './oplogSyncChannel';
import { crdtPush, crdtPull } from './crdtSyncChannel';

/**
 * 同步引擎（编排层）
 *
 * @ai-context: 2026-07 拆分——oplog 推拉在 oplogSyncChannel、CRDT 推拉在
 * crdtSyncChannel、游标在 syncCursors（含 keban_* 旧键一次性迁移）。
 * 本类仅做流程编排/事件广播/离线队列重放，公共 API（sync/push/pull/
 * resolve/status/subscribe/pause/resume）与拆分前完全一致。
 * @ai-context: pause() 复用 syncInProgress 标志实现锁定（存储路径切换等
 * 关键操作期间禁止同步），resume() 解除。这是刻意的简化设计。
 */
export class SyncEngine {
  private syncInProgress = false;
  private networkRecoveryCleanup: (() => void) | null = null;
  private listeners: Set<(event: SyncEvent) => void> = new Set();

  // Sync API base path (apiClient prepends VITE_API_BASE_URL automatically)
  private syncBasePath = '/api/v1/sync';

  /** CRDT 同步 API 路径 */
  private crdtBasePath = '/api/v1/sync/crdt';

  /**
   * 注册网络恢复时的自动同步监听
   * 不再使用定时器，仅在网络恢复时触发一次同步
   */
  registerNetworkRecoverySync(): void {
    // 先清理旧的监听器
    this.unregisterNetworkRecoverySync();
    const cleanup = networkManager.subscribe((state) => {
      if (state.status === 'online') {
        this.sync();
      }
    });
    this.networkRecoveryCleanup = cleanup;
  }

  /**
   * 注销网络恢复监听器
   */
  unregisterNetworkRecoverySync(): void {
    if (this.networkRecoveryCleanup) {
      this.networkRecoveryCleanup();
      this.networkRecoveryCleanup = null;
    }
  }

  /**
   * 暂停同步引擎
   * 阻止新的同步请求（用于路径切换等关键操作前）
   */
  pause(): void {
    this.syncInProgress = true;
  }

  /**
   * 恢复同步引擎
   * 解除同步锁定（用于路径切换完成后）
   */
  resume(): void {
    this.syncInProgress = false;
  }

  /**
   * 执行完整同步流程：push → pull → replay offline queue
   * 根据 feature flag 选择 oplog 或 CRDT 路径
   */
  async sync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return { pushed: 0, pulled: 0, conflicts: [], errors: ['Sync already in progress'] };
    }

    const networkState = networkManager.getState();
    if (networkState.status === 'offline') {
      return { pushed: 0, pulled: 0, conflicts: [], errors: ['Device is offline'] };
    }

    this.syncInProgress = true;
    this.emit({ type: 'sync-start' });

    const result: SyncResult = {
      pushed: 0,
      pulled: 0,
      conflicts: [],
      errors: [],
    };

    try {
      const mode = getSyncMode();

      if (mode === 'crdt') {
        // ─── CRDT 同步路径 ──────────────────────────────────────────
        if (!crdtEngine.isInitialized()) {
          await crdtEngine.init();
        }

        const crdtPushResult = await crdtPush(this.crdtBasePath);
        result.pushed = crdtPushResult.pushed;
        result.errors.push(...crdtPushResult.errors);

        const crdtPullResult = await crdtPull(this.crdtBasePath);
        result.pulled = crdtPullResult.pulled;
        result.errors.push(...crdtPullResult.errors);
      } else {
        // ─── 传统 operationLog 同步路径 ────────────────────────────
        const pushResult = await oplogPush(this.syncBasePath);
        result.pushed = pushResult.pushed;
        result.conflicts.push(...pushResult.conflicts);
        result.errors.push(...pushResult.errors);

        const pullResult = await oplogPull(this.syncBasePath);
        result.pulled = pullResult.pulled;
        result.errors.push(...pullResult.errors);
      }

      // Replay offline queue（两条路径共享）
      await this.replayOfflineQueue();

      this.emit({ type: 'sync-complete', result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      result.errors.push(message);
      this.emit({ type: 'sync-error', error: message });
    } finally {
      this.syncInProgress = false;
    }

    return result;
  }

  /**
   * Push: 将本地未同步的操作日志推送到服务端（oplog 路径）
   */
  async push(): Promise<{ pushed: number; conflicts: SyncConflict[]; errors: string[] }> {
    return oplogPush(this.syncBasePath);
  }

  /**
   * Pull: 从服务端拉取最新更新（oplog 路径）
   */
  async pull(): Promise<{ pulled: number; errors: string[] }> {
    return oplogPull(this.syncBasePath);
  }

  /**
   * 重放离线队列
   * 仅处理已到达退避时间的就绪项，失败时计算指数退避
   */
  private async replayOfflineQueue(): Promise<void> {
    if (await offlineQueue.isEmpty()) return;
    if (offlineQueue.isProcessing()) return;

    offlineQueue.setProcessing(true);
    try {
      const items = await offlineQueue.getReadyItems();
      const successIds: string[] = [];
      const failedIds: string[] = [];
      const skippedCount = (await offlineQueue.getPendingItems()).length - items.length;

      for (const item of items) {
        try {
          await apiClient.post(`${this.syncBasePath}/push`, {
            deviceId: item.deviceId,
            operations: [{
              id: item.id,
              entityType: item.entityType,
              entityId: item.entityId,
              operation: item.operation,
              version: item.version,
              // payload is stored as JSON string; parse back to object
              payload: item.payload ? safeJsonParse(item.payload) : undefined,
              createdAt: item.createdAt.toISOString(),
            }],
          });
          successIds.push(item.id);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console -- 同步重放失败需记录以便排查
          console.error(`[SyncEngine] 队列项重放失败 [${item.entityType}:${item.entityId}] (retryCount=${item.retryCount}): ${errMsg}`);
          await offlineQueue.scheduleRetry(item.id);
          failedIds.push(item.id);
        }
      }

      if (successIds.length > 0) {
        await offlineQueue.removeItems(successIds);
      }
      await offlineQueue.cleanupExpired(5);

      // 汇总日志
      if (successIds.length > 0 || failedIds.length > 0) {
        console.error(`[SyncEngine] 离线队列重放完成：成功=${successIds.length}，失败=${failedIds.length}，跳过(未到退避时间)=${skippedCount}`);
      }
    } finally {
      offlineQueue.setProcessing(false);
    }
  }

  /**
   * Resolve: 提交冲突解决结果到服务端
   */
  async resolve(conflict: SyncConflict, strategy: 'local' | 'remote' | 'manual', mergedData?: unknown): Promise<{ resolved: boolean; errors: string[] }> {
    const deviceId = getDeviceId();
    const errors: string[] = [];

    try {
      // Determine the payload to send:
      // - 'local': use the local data as the resolved version
      // - 'remote': no data needed, server wins
      // - 'manual': use the caller-supplied mergedData
      let data: unknown;
      if (strategy === 'local') {
        data = safeJsonParse(conflict.localData);
      } else if (strategy === 'manual') {
        data = mergedData;
      }
      // 'remote' sends no data

      const response = await apiClient.post<{
        resolved: boolean;
        strategy: string;
      }>(`${this.syncBasePath}/resolve`, {
        deviceId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        strategy,
        data,
        version: strategy === 'remote' ? conflict.remoteVersion : Math.max(conflict.localVersion, conflict.remoteVersion) + 1,
      });

      return { resolved: response.resolved, errors };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Resolve failed: ${message}`);
      return { resolved: false, errors };
    }
  }

  /**
   * Status: 获取服务端同步状态摘要
   */
  async status(): Promise<{
    totalOperations: number;
    trackedEntities: number;
    latestSeqNo: number;
    redisConnected: boolean;
  } | null> {
    try {
      return await apiClient.get<{
        totalOperations: number;
        trackedEntities: number;
        latestSeqNo: number;
        redisConnected: boolean;
      }>(`${this.syncBasePath}/status`);
    } catch {
      return null;
    }
  }

  subscribe(listener: (event: SyncEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: SyncEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
}

// Types
export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export type SyncEvent =
  | { type: 'sync-start' }
  | { type: 'sync-complete'; result: SyncResult }
  | { type: 'sync-error'; error: string };

// Singleton
export const syncEngine = new SyncEngine();
