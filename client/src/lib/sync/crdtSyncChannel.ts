import { apiClient } from '@/lib/http/apiClient';
import { getDeviceId } from '../storage/operationLog';
import { crdtEngine } from './crdtEngine';
import { CRDT_ENABLED_TABLES, type CRDTChangeRecord } from './crdtTypes';
import { getCRDTLastSeq, setCRDTLastSeq } from './syncCursors';
import { getPendingCRDTChanges, markCRDTChangesUploaded } from './crdtPersistence';

/**
 * CRDT 同步通道（Automerge changeset 推拉路径）
 *
 * @ai-context: 与 oplogSyncChannel 二选一由 feature flag 决定。CRDT 路径
 * 无人工冲突：远程 changeset 经 Automerge 自动合并后直接落库。
 * @ai-context: pull 后必须 persistDoc 持久化快照，否则重启后本地文档
 * 落后于已确认的 lastSeq 游标，导致远程变更永久丢失。
 */

/**
 * CRDT Push: 将本地 crdt_changes 表中的待上传 changesets 推送到服务端
 */
export async function crdtPush(
  basePath: string,
): Promise<{ pushed: number; errors: string[] }> {
  const errors: string[] = [];
  let pushed = 0;

  try {
    // 收集所有启用 CRDT 的表的待上传变更
    const allPending: CRDTChangeRecord[] = [];
    for (const tableName of CRDT_ENABLED_TABLES) {
      const pending = await getPendingCRDTChanges(50);
      allPending.push(...pending.filter(p => p.tableName === tableName));
    }

    if (allPending.length === 0) return { pushed: 0, errors };

    const deviceId = getDeviceId();
    const response = await apiClient.post<{
      accepted: number[];
      errors: string[];
    }>(`${basePath}/changes`, {
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
      await markCRDTChangesUploaded(response.accepted);
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
export async function crdtPull(
  basePath: string,
): Promise<{ pulled: number; errors: string[] }> {
  const errors: string[] = [];
  let pulled = 0;

  try {
    const lastSeq = getCRDTLastSeq();
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
    }>(`${basePath}/changes?since=${lastSeq}&deviceId=${encodeURIComponent(deviceId)}`);

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
        await applyCRDTMergedData(tableName, affected);

        // 持久化 CRDT 文档快照
        await crdtEngine.persistDoc(tableName);

        pulled += affected.size;
      }

      // 更新最后同步的 CRDT 序列号
      if (response.latestSeq > lastSeq) {
        setCRDTLastSeq(response.latestSeq);
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
async function applyCRDTMergedData(
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
