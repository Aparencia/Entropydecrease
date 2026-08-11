import { apiClient } from '@/lib/http/apiClient';
import { getDeviceId, getUnsyncedLogsBatch, markLogsSynced } from '../storage/operationLog';
import type { SyncConflict } from '@/types/models';
import { getLastSyncVersion, setLastSyncVersion } from './syncCursors';
import type { OperationLog } from '@/types/sync';

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
        // SYNC2-H2: 冲突对象必须携带真实本地数据——原实现 localData 硬编码 '{}'
        // 导致用户选择"保留本地"时提交空对象覆盖服务端实体（数据清空）
        const { localDataStr, localVersion } = await resolveLocalConflictData(logs, conflict.entityType, conflict.entityId);
        conflicts.push({
          id: crypto.randomUUID(),
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          localData: localDataStr,
          remoteData: JSON.stringify(conflict.serverData),
          localVersion,
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
      // SYNC2-L1: 游标只推进到最后成功应用的版本——原实现直接用
      // response.latestVersion 一次性跳过全部，若中间某条 apply 失败
      //（表缺失/数据异常），该操作被永久跳过（sinceVersion 已越过它）
      const { applied, lastVersion: appliedVersion } = await applyRemoteOperations(response.operations);
      if (appliedVersion > lastVersion) {
        setLastSyncVersion(appliedVersion);
      }
      return { pulled: applied, errors };
    }

    return { pulled: 0, errors };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Pull failed: ${message}`);
    return { pulled: 0, errors };
  }
}

/**
 * 将远端操作应用到本地 Dexie（create/update 用 put 幂等覆盖）
 * 逐条 try/catch：单条失败即停止，返回已成功应用的计数与最后成功版本。
 * 未知 entityType 的操作跳过但不阻断游标推进（与应用成功等价，
 * 否则 sinceVersion 不推进会反复拉取同一批数据）。
 */
async function applyRemoteOperations(
  operations: Array<{ entityType: string; entityId: string; operation: string; data: unknown; version: number }>,
): Promise<{ applied: number; lastVersion: number }> {
  const { db } = await import('../storage/database');
  let applied = 0;
  let lastVersion = -1;

  for (const op of operations) {
    const tableName = getEntityTableName(op.entityType);
    if (!tableName) {
      // 未知类型：跳过但继续推进游标，避免永久重复拉取
      lastVersion = Math.max(lastVersion, op.version);
      continue;
    }

    try {
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
      applied += 1;
      lastVersion = Math.max(lastVersion, op.version);
    } catch (err) {
      // 单条失败：停止应用，游标停在失败前的最后成功版本，
      // 下轮拉取重试该操作（避免数据永久丢失）
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console -- 远端操作应用失败需记录以便排查
      console.warn(`[oplogSyncChannel] 远端操作应用失败 [${op.entityType}:${op.entityId}] v${op.version}: ${message}`);
      break;
    }
  }

  return { applied, lastVersion };
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

/**
 * SYNC2-H2: 解析冲突实体的本地数据与版本。
 * 优先取该实体最后一条携带 payload 的日志（本地最终写入状态）；
 * 无 payload（纯 delete 日志）时回退读取业务表当前数据。
 * localVersion 取该实体最后一条日志的版本（原实现取第一条=最小版本）。
 */
async function resolveLocalConflictData(
  logs: OperationLog[],
  entityType: string,
  entityId: string,
): Promise<{ localDataStr: string; localVersion: number }> {
  const entityLogs = logs.filter(l => l.entityId === entityId && l.entityType === entityType);
  const lastLog = entityLogs[entityLogs.length - 1];
  const lastPayloadLog = [...entityLogs].reverse().find(l => l.payload);

  if (lastPayloadLog?.payload) {
    return {
      localDataStr: lastPayloadLog.payload,
      localVersion: lastLog?.version ?? lastPayloadLog.version,
    };
  }

  // 纯 delete 或 payload 缺失：尝试从业务表读取当前数据
  if (lastLog) {
    const { db } = await import('../storage/database');
    const tableName = getEntityTableName(entityType);
    if (tableName) {
      try {
        const row = await db.table(tableName).get(entityId);
        if (row) {
          return { localDataStr: JSON.stringify(row), localVersion: lastLog.version };
        }
      } catch {
        // 表不存在/读取失败时回退空对象（保持原有行为）
      }
    }
  }
  return { localDataStr: '{}', localVersion: lastLog?.version ?? 0 };
}
