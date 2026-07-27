import { apiClient } from '@/lib/http/apiClient';
import { getDeviceId, getUnsyncedLogsBatch, markLogsSynced } from '../storage/operationLog';
import { offlineQueue } from './OfflineQueue';
import { networkManager } from './NetworkManager';
import type { SyncConflict } from '../../types/models';
import { crdtEngine, getSyncMode, CRDT_ENABLED_TABLES } from './crdtEngine';
import type { CRDTChangeRecord } from './crdtEngine';

/**
 * 同步引擎
 * 负责客户端与服务端之间的数据同步
 * 支持 push（推送本地变更）、pull（拉取远端变更）、conflict 处理
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
        // Step 1: 确保 CRDT 引擎已初始化
        if (!crdtEngine.isInitialized()) {
          await crdtEngine.init();
        }

        // Step 2: CRDT Push — 上传本地 changesets
        const crdtPushResult = await this.crdtPush();
        result.pushed = crdtPushResult.pushed;
        result.errors.push(...crdtPushResult.errors);

        // Step 3: CRDT Pull — 拉取远程 changesets 并自动合并
        const crdtPullResult = await this.crdtPull();
        result.pulled = crdtPullResult.pulled;
        result.errors.push(...crdtPullResult.errors);
      } else {
        // ─── 传统 operationLog 同步路径 ────────────────────────────
        // Step 1: Push local changes
        const pushResult = await this.push();
        result.pushed = pushResult.pushed;
        result.conflicts.push(...pushResult.conflicts);
        result.errors.push(...pushResult.errors);

        // Step 2: Pull remote changes
        const pullResult = await this.pull();
        result.pulled = pullResult.pulled;
        result.errors.push(...pullResult.errors);
      }

      // Step 4: Replay offline queue（两条路径共享）
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
   * Push: 将本地未同步的操作日志推送到服务端
   */
  async push(): Promise<{ pushed: number; conflicts: SyncConflict[]; errors: string[] }> {
    const logs = await getUnsyncedLogsBatch(50);
    if (logs.length === 0) return { pushed: 0, conflicts: [], errors: [] };

    const deviceId = getDeviceId();
    const conflicts: SyncConflict[] = [];
    const errors: string[] = [];
    let pushed = 0;

    try {
      const response = await apiClient.post<{
        accepted: string[];
        conflicts: Array<{
          entityType: string;
          entityId: string;
          serverVersion: number;
          serverData: unknown;
        }>;
        errors: string[];
      }>(`${this.syncBasePath}/push`, {
        deviceId,
        operations: logs.map(log => ({
          id: log.id,
          entityType: log.entityType,
          entityId: log.entityId,
          operation: log.operation,
          version: log.version,
          patch: log.patch,
          // payload is stored as JSON string in IndexedDB; parse back to object
          // to avoid double-encoding when the request body is JSON-serialized
          payload: log.payload ? safeJsonParse(log.payload) : undefined,
          createdAt: log.createdAt.toISOString(),
        })),
      });

      // Mark accepted logs as synced
      if (response.accepted.length > 0) {
        await markLogsSynced(response.accepted);
        pushed = response.accepted.length;
      }

      // Handle conflicts
      if (response.conflicts.length > 0) {
        for (const conflict of response.conflicts) {
          conflicts.push({
            id: crypto.randomUUID(),
            entityType: conflict.entityType,
            entityId: conflict.entityId,
            localData: '{}',
            remoteData: JSON.stringify(conflict.serverData),
            localVersion: logs.find(l => l.entityId === conflict.entityId)?.version || 0,
            remoteVersion: conflict.serverVersion,
            status: 'pending',
            createdAt: new Date(),
          });
        }
      }

      errors.push(...(response.errors || []));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Push failed: ${message}`);
    }

    return { pushed, conflicts, errors };
  }

  /**
   * Pull: 从服务端拉取最新更新
   */
  async pull(): Promise<{ pulled: number; errors: string[] }> {
    const deviceId = getDeviceId();
    const errors: string[] = [];

    try {
      const lastVersion = this.getLastSyncVersion();

      const response = await apiClient.get<{
        operations: Array<{
          entityType: string;
          entityId: string;
          operation: string;
          data: unknown;
          version: number;
        }>;
        latestVersion: number;
      }>(`${this.syncBasePath}/pull?deviceId=${encodeURIComponent(deviceId)}&sinceVersion=${lastVersion}`);

      if (response.operations.length > 0) {
        await this.applyRemoteOperations(response.operations);
        this.setLastSyncVersion(response.latestVersion);
      }

      return { pulled: response.operations.length, errors };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Pull failed: ${message}`);
      return { pulled: 0, errors };
    }
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

  // === Helper methods ===

  private getLastSyncVersion(): number {
    const stored = localStorage.getItem('keban_last_sync_version');
    return stored ? parseInt(stored, 10) : 0;
  }

  private setLastSyncVersion(version: number): void {
    localStorage.setItem('keban_last_sync_version', version.toString());
  }

  // ─── CRDT 同步方法 ───────────────────────────────────────────────────────

  /**
   * CRDT Push: 将本地 crdt_changes 表中的待上传 changesets 推送到服务端
   */
  private async crdtPush(): Promise<{ pushed: number; errors: string[] }> {
    const errors: string[] = [];
    let pushed = 0;

    try {
      // 收集所有启用 CRDT 的表的待上传变更
      const allPending: CRDTChangeRecord[] = [];
      for (const tableName of CRDT_ENABLED_TABLES) {
        const pending = await crdtEngine.getPendingChanges(50);
        allPending.push(...pending.filter(p => p.tableName === tableName));
      }

      if (allPending.length === 0) return { pushed: 0, errors };

      const deviceId = getDeviceId();
      const response = await apiClient.post<{
        accepted: number[];
        errors: string[];
      }>(`${this.crdtBasePath}/changes`, {
        deviceId,
        changes: allPending.map(c => ({
          seq: c.seq,
          tableName: c.tableName,
          entityId: c.entityId,
          changeset: c.changeset,
          operation: c.operation,
          createdAt: c.createdAt,
        })),
      });

      // 标记已上传的变更
      if (response.accepted && response.accepted.length > 0) {
        await crdtEngine.markChangesUploaded(response.accepted);
        pushed = response.accepted.length;
      }

      errors.push(...(response.errors || []));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`CRDT push failed: ${message}`);
    }

    return { pushed, errors };
  }

  /**
   * CRDT Pull: 从服务端拉取远程 changesets 并通过 Automerge 自动合并
   */
  private async crdtPull(): Promise<{ pulled: number; errors: string[] }> {
    const errors: string[] = [];
    let pulled = 0;

    try {
      const lastSeq = this.getCRDTLastSeq();
      const deviceId = getDeviceId();

      const response = await apiClient.get<{
        changes: Array<{
          seq: number;
          tableName: string;
          entityId: string;
          changeset: string;
          operation: string;
          deviceId: string;
          createdAt: string;
        }>;
        latestSeq: number;
      }>(`${this.crdtBasePath}/changes?since=${lastSeq}&deviceId=${encodeURIComponent(deviceId)}`);

      if (response.changes && response.changes.length > 0) {
        // 按表分组应用远程变更
        const byTable = new Map<string, Array<{ entityId: string; changeset: string }>>();
        for (const change of response.changes) {
          if (!byTable.has(change.tableName)) {
            byTable.set(change.tableName, []);
          }
          byTable.get(change.tableName)!.push({
            entityId: change.entityId,
            changeset: change.changeset,
          });
        }

        // 对每张表批量应用远程变更（Automerge 自动合并，无冲突）
        for (const [tableName, changesets] of byTable) {
          const affected = crdtEngine.applyRemoteChanges(tableName, changesets);

          // 将合并后的数据写入 Dexie
          await this.applyCRDTMergedData(tableName, affected);

          // 持久化 CRDT 文档快照
          await crdtEngine.persistDoc(tableName);

          pulled += affected.size;
        }

        // 更新最后同步的 CRDT 序列号
        if (response.latestSeq > lastSeq) {
          this.setCRDTLastSeq(response.latestSeq);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`CRDT pull failed: ${message}`);
    }

    return { pulled, errors };
  }

  /**
   * 将 CRDT 合并后的数据写入 Dexie
   */
  private async applyCRDTMergedData(
    tableName: string,
    affected: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    if (affected.size === 0) return;

    const { db } = await import('../storage/database');
    const table = db.table(tableName);

    for (const [entityId, data] of affected) {
      if ((data as Record<string, unknown>).__deleted) {
        await table.delete(entityId);
      } else {
        // 合并后的数据包含实体全部字段，使用 put 覆盖
        await table.put({ ...data, id: entityId });
      }
    }
  }

  private getCRDTLastSeq(): number {
    const stored = localStorage.getItem('keban_crdt_last_seq');
    return stored ? parseInt(stored, 10) : 0;
  }

  private setCRDTLastSeq(seq: number): void {
    localStorage.setItem('keban_crdt_last_seq', seq.toString());
  }

  private async applyRemoteOperations(
    operations: Array<{ entityType: string; entityId: string; operation: string; data: unknown }>
  ): Promise<void> {
    const { db } = await import('../storage/database');

    for (const op of operations) {
      const tableName = this.getEntityTableName(op.entityType);
      if (!tableName) continue;

      const table = db.table(tableName);
      switch (op.operation) {
        case 'create':
        case 'update':
          await table.put(op.data);
          break;
        case 'delete':
          await table.delete(op.entityId);
          break;
      }
    }
  }

  private getEntityTableName(entityType: string): string | null {
    const typeMap: Record<string, string> = {
      'note': 'notes',
      'folder': 'noteFolders',
      'deck': 'flashcardDecks',
      'card': 'flashcards',
      'flashcardReview': 'flashcardReviews',
      'studySession': 'pomodoroSessions',
      'pomodoroSession': 'pomodoroSessions',
      'pomodoroSettings': 'pomodoroSettings',
      'feynmanNote': 'feynmanNotes',
      'feynmanSummary': 'feynmanSummaries',
      'feynmanWeakPoint': 'feynmanWeakPoints',
      'settings': 'appSettings',
    };
    return typeMap[entityType] || null;
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

// Utility: safely parse a JSON string; return the original string on failure
function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Singleton
export const syncEngine = new SyncEngine();
