import { apiClient } from '@/lib/http/apiClient';
import { getDeviceId, getUnsyncedLogsBatch, markLogsSynced } from '../storage/operationLog';
import type { SyncConflict } from '@/types/models';
import { getLastSyncVersion, setLastSyncVersion } from './syncCursors';

/**
 * oplog 同步通道（传统 operationLog 推拉路径）
 *
 * @ai-context: 与 crdtSyncChannel 二选一由 feature flag 决定（getSyncMode）。
 * push 冲突不在本地自动解决，而是构造 SyncConflict 交由 UI 层（ConflictDialog）
 * 人工裁决后调用 syncEngine.resolve 提交。
 * @ai-context: payload 在 IndexedDB 中存为 JSON 字符串，上行前必须 parse 回
 * 对象，否则请求体二次编码导致服务端解析失败。
 */

/** 安全 JSON 解析：失败时返回原字符串 */
export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Push: 将本地未同步的操作日志推送到服务端
 */
export async function oplogPush(
  basePath: string,
): Promise<{ pushed: number; conflicts: SyncConflict[]; errors: string[] }> {
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
    }>(`${basePath}/push`, {
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
 * Pull: 从服务端拉取最新更新并应用到本地
 */
export async function oplogPull(
  basePath: string,
): Promise<{ pulled: number; errors: string[] }> {
  const deviceId = getDeviceId();
  const errors: string[] = [];

  try {
    const lastVersion = getLastSyncVersion();

    const response = await apiClient.get<{
      operations: Array<{
        entityType: string;
        entityId: string;
        operation: string;
        data: unknown;
        version: number;
      }>;
      latestVersion: number;
    }>(`${basePath}/pull?deviceId=${encodeURIComponent(deviceId)}&sinceVersion=${lastVersion}`);

    if (response.operations.length > 0) {
      await applyRemoteOperations(response.operations);
      setLastSyncVersion(response.latestVersion);
    }

    return { pulled: response.operations.length, errors };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Pull failed: ${message}`);
    return { pulled: 0, errors };
  }
}

/** 将远端操作应用到本地 Dexie（create/update 用 put 幂等覆盖） */
async function applyRemoteOperations(
  operations: Array<{ entityType: string; entityId: string; operation: string; data: unknown }>,
): Promise<void> {
  const { db } = await import('../storage/database');

  for (const op of operations) {
    const tableName = getEntityTableName(op.entityType);
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

/** entityType（服务端操作记录中的键）→ Dexie 表名映射 */
function getEntityTableName(entityType: string): string | null {
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
