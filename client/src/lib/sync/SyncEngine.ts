import { apiClient } from '@/lib/http/apiClient';
import { getDeviceId, markEntityLogsSynced } from '../storage/operationLog';
import { offlineQueue } from './OfflineQueue';
import { networkManager, type NetworkStatus } from './NetworkManager';
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
  private paused = false;
  private networkRecoveryCleanup: (() => void) | null = null;
  private listeners: Set<(event: SyncEvent) => void> = new Set();

  /** 自动同步（网络恢复触发）最小间隔 */
  private static readonly AUTO_SYNC_MIN_GAP_MS = 10_000;
  /** 自动同步连续失败后的退避上限（5 分钟） */
  private static readonly AUTO_SYNC_MAX_BACKOFF_MS = 5 * 60_000;
  private lastAutoSyncAt = 0;
  private autoSyncFailures = 0;

  // Sync API base path (apiClient prepends VITE_API_BASE_URL automatically)
  private syncBasePath = '/api/v1/sync';

  /** CRDT 同步 API 路径 */
  private crdtBasePath = '/api/v1/sync/crdt';

  /**
   * 注册网络恢复时的自动同步监听
   * 不使用定时器；仅在"转为 online"的跳变沿触发，并带失败退避。
   * 历史缺陷：对任何 status==='online' 的通知都触发 sync（含延迟抖动的
   * 节流通知，最快每秒一次）；服务器不可达时变成超时请求洪泛
   *（内测控制台大量 ERR_CONNECTION_TIMED_OUT 的根因）。
   */
  registerNetworkRecoverySync(): void {
    // 先清理旧的监听器
    this.unregisterNetworkRecoverySync();
    let prevStatus: NetworkStatus = networkManager.getState().status;
    const cleanup = networkManager.subscribe((state) => {
      const becameOnline = state.status === 'online' && prevStatus !== 'online';
      prevStatus = state.status;
      if (becameOnline) void this.autoSync();
    });
    this.networkRecoveryCleanup = cleanup;
  }

  /**
   * 带退避的自动同步：连续失败（服务器不可达）时指数拉大触发间隔
   * （10s → 20s → 40s → …，封顶 5min），成功后重置；手动 sync() 不受此限制。
   */
  private async autoSync(): Promise<void> {
    const now = Date.now();
    const gapMs = this.autoSyncFailures === 0
      ? SyncEngine.AUTO_SYNC_MIN_GAP_MS
      : Math.min(
          SyncEngine.AUTO_SYNC_MAX_BACKOFF_MS,
          SyncEngine.AUTO_SYNC_MIN_GAP_MS * 2 ** this.autoSyncFailures,
        );
    if (now - this.lastAutoSyncAt < gapMs) return;
    this.lastAutoSyncAt = now;
    const result = await this.sync();
    if (result.errors.length > 0) {
      this.autoSyncFailures += 1;
    } else {
      this.autoSyncFailures = 0;
    }
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
   * SYNC2-H3: 不再置 syncInProgress=true——该标志是"sync 执行中"的锁，
   * 由 sync() 的 finally 负责释放；pause 直接置位会导致无 sync 运行时
   * 锁永不清除，resume() 轮询等待永久挂起（同步引擎瘫痪）。
   * paused 标志本身已足以阻止新 sync 启动。
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * 恢复同步引擎
   * 解除同步锁定，如有进行中的 sync 等待其完成再触发补偿 sync
   */
  async resume(): Promise<void> {
    this.paused = false;
    // 如有进行中的 sync，等待其完成（SYNC2-H3: 15s 超时保护，
    // 防止 sync 异常挂起导致 resume 永久等待）
    if (this.syncInProgress) {
      await new Promise<void>((resolve) => {
        const startedAt = Date.now();
        const check = () => {
          if (!this.syncInProgress) {
            resolve();
          } else if (Date.now() - startedAt > 15000) {
            // 超时兜底：强制清锁继续（sync 的 finally 可能因异常路径未执行）
            logger.warn('[SyncEngine] resume: waiting for in-flight sync timed out, forcing unlock');
            this.syncInProgress = false;
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }
    this.syncInProgress = false;
    // 触发补偿同步
    this.sync();
  }

  /**
   * 执行完整同步流程：push → pull → replay offline queue
   * 根据 feature flag 选择 oplog 或 CRDT 路径
   */
  async sync(): Promise<SyncResult> {
    if (this.paused || this.syncInProgress) {
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
      // 仅当非 pause 时才清锁（pause 期间保持锁定）
      if (!this.paused) {
        this.syncInProgress = false;
      }
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

      if (response.resolved) {
        // SYNC2-H1: resolve 成功后该实体的本地日志全部标记已同步——
        // resolve 已代表该实体最终状态；若不清理，旧版本日志下次 push
        // 仍会冲突（服务端版本已推进），形成永久循环冲突
        await markEntityLogsSynced(conflict.entityType, conflict.entityId);
      }

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
