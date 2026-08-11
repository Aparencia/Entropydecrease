import type { IRepository } from '@/lib/storage/interfaces';
import { logOperation } from '@/lib/storage/operationLog';
import { generateId } from '@/lib/utils/uuid';
import { offlineQueue } from '@/lib/sync/OfflineQueue';
import { cryptoManager } from '@/lib/crypto';
import { crdtEngine, shouldUseCRDT } from '@/lib/sync/crdtEngine';
import { enqueueCRDTChange } from '@/lib/sync/crdtPersistence';
import { SENSITIVE_FIELDS } from './sensitiveFields';

/**
 * 带操作日志的统一写操作
 * 每次写操作自动记录日志到 operationLog，支持后续同步
 * 写入前对敏感字段进行 AES-GCM 加密（CryptoManager 未初始化时优雅降级）
 *
 * @ai-context: 敏感字段加密映射唯一来源为 ./sensitiveFields.ts（与解密侧共享），禁止本地重新定义。
 * @ai-context: CRDT 路径失败不阻塞主写入（降级仅告警）。
 */


/**
 * 对数据中的敏感字段进行加密
 * 若 CryptoManager 未就绪，直接返回原数据（优雅降级）
 */
async function encryptSensitiveFields<T>(
  entityType: string,
  data: T
): Promise<T> {
  if (!cryptoManager.isReady()) return data;

  const fields = SENSITIVE_FIELDS[entityType];
  if (!fields || fields.length === 0) return data;

  const result = { ...data } as Record<string, unknown>;
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      result[field] = await cryptoManager.encryptField(value);
    }
  }
  return result as T;
}

export async function createWithLog<T extends { id: string }>(
  repo: IRepository<T>,
  entityType: string,
  data: Omit<T, 'id'>
): Promise<string> {
  const id = generateId();
  const item = { ...data, id } as T;

  // 写入前加密敏感字段
  const encryptedItem = await encryptSensitiveFields(entityType, item);

  await repo.create(encryptedItem);
  await logOperation(entityType, id, 'create', encryptedItem);

  // CRDT 路径：生成 changeset 并存入待上传队列
  await applyCRDTChange(entityType, id, encryptedItem as unknown as Record<string, unknown>, 'create');

  return id;
}

export async function updateWithLog<T extends { id: string }>(
  repo: IRepository<T>,
  entityType: string,
  id: string,
  changes: Partial<T>
): Promise<void> {
  // 更新前加密变更中的敏感字段
  const encryptedChanges = await encryptSensitiveFields(entityType, changes);

  await repo.update(id, encryptedChanges);

  // 生成 JSON Patch（简化版）
  const patch = JSON.stringify(encryptedChanges);
  await logOperation(entityType, id, 'update', encryptedChanges, patch);

  // CRDT 路径
  await applyCRDTChange(entityType, id, encryptedChanges as unknown as Record<string, unknown>, 'update');
}

export async function deleteWithLog<T extends { id: string }>(
  repo: IRepository<T>,
  entityType: string,
  id: string
): Promise<void> {
  // 先获取数据用于日志
  const existing = await repo.getById(id);

  await repo.delete(id);
  await logOperation(entityType, id, 'delete', existing);

  // CRDT 路径：删除操作
  await applyCRDTChange(entityType, id, null, 'delete');
}

/**
 * 带离线队列的统一写操作
 * 在网络不可用时自动将操作加入离线队列
 */
export async function createWithQueue<T extends { id: string }>(
  repo: IRepository<T>,
  entityType: string,
  data: Omit<T, 'id'>,
  isOnline: boolean
): Promise<string> {
  const id = await createWithLog(repo, entityType, data);

  if (!isOnline) {
    const item = { ...data, id } as T;
    await offlineQueue.enqueue(entityType, id, 'create', item);
  }

  return id;
}

export async function updateWithQueue<T extends { id: string }>(
  repo: IRepository<T>,
  entityType: string,
  id: string,
  changes: Partial<T>,
  isOnline: boolean
): Promise<void> {
  await updateWithLog(repo, entityType, id, changes);

  if (!isOnline) {
    await offlineQueue.enqueue(entityType, id, 'update', changes);
  }
}

export async function deleteWithQueue<T extends { id: string }>(
  repo: IRepository<T>,
  entityType: string,
  id: string,
  isOnline: boolean
): Promise<void> {
  await deleteWithLog(repo, entityType, id);

  if (!isOnline) {
    await offlineQueue.enqueue(entityType, id, 'delete');
  }
}

/**
 * CRDT 变更辅助：当 entityType 对应的表启用 CRDT 时，
 * 生成 Automerge changeset → 存入 crdt_changes → 持久化文档快照
 *
 * AES-GCM 加密在调用此函数之前已完成（加密后的内容作为 CRDT 变更输入）
 */
async function applyCRDTChange(
  entityType: string,
  entityId: string,
  data: Record<string, unknown> | null,
  operation: 'create' | 'update' | 'delete',
): Promise<void> {
  const tableName = entityTypeToTableName(entityType);
  if (!shouldUseCRDT(tableName)) return;

  try {
    // 确保 CRDT 引擎已初始化（懒初始化）
    if (!crdtEngine.isInitialized()) {
      await crdtEngine.init();
    }

    const changeset = crdtEngine.applyLocalChange(tableName, entityId, data, operation);
    if (!changeset) return;

    // 存入待上传队列 + 持久化文档快照
    await enqueueCRDTChange(changeset);
    await crdtEngine.persistDoc(tableName);
  } catch (err) {
    // SYNC2-L5: CRDT 路径失败不阻塞主写入，但必须重置该表内存文档——
    // applyLocalChange 已前滚内存 doc，若 enqueue/persistDoc 失败，
    // 内存与队列/快照基线漂移，下次变更会生成非法 changeset
    //（MissingDependencyError），该表 CRDT 路径从此永久失效
    // GW-3: resetTable 本身可能失败（IndexedDB 异常），嵌套保护避免
    //"降级路径"反而阻塞主写入（resetTable 失败时内存状态未重建，
    // 下次 init 会从快照重建，风险低于阻塞业务写入）
    try {
      await crdtEngine.resetTable(tableName);
    } catch (resetErr) {
      console.warn('[writeWithLog] CRDT resetTable also failed (non-blocking):', resetErr);
    }
    console.warn('[writeWithLog] CRDT change failed, table reset (non-blocking):', err);
  }
}

/** entityType（操作日志中的键）→ Dexie 表名映射 */
function entityTypeToTableName(entityType: string): string {
  const map: Record<string, string> = {
    'note': 'notes',
    'folder': 'noteFolders',
    'deck': 'flashcardDecks',
    'card': 'flashcards',
    'flashcardReview': 'flashcardReviews',
    'pomodoroSession': 'pomodoroSessions',
    'pomodoroSettings': 'pomodoroSettings',
    'feynmanNote': 'feynmanNotes',
    'feynmanSummary': 'feynmanSummaries',
    'feynmanWeakPoint': 'feynmanWeakPoints',
    'settings': 'appSettings',
  };
  return map[entityType] || entityType;
}
