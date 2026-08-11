/**
 * CRDT 变更持久化（crdt_changes 表的纯 db 操作）
 *
 * @ai-context: 从 crdtEngine 拆出的无状态 db 操作（不触碰内存文档），
 * 供 writeWithLog（入队）与 crdtSyncChannel（出队/确认）使用。
 * db 动态 import 与 crdtEngine 同理——打破 database.ts 循环依赖。
 */
import type { CRDTChangeset, CRDTChangeRecord } from './crdtTypes';

/**
 * 将 changeset 存入 crdt_changes 表等待上传
 */
export async function enqueueCRDTChange(changeset: CRDTChangeset): Promise<void> {
  const { db } = await import('@/lib/storage/database');
  await db.crdtChanges.add({
    tableName: changeset.tableName,
    entityId: changeset.entityId,
    changeset: changeset.changeset,
    operation: changeset.operation,
    createdAt: changeset.createdAt,
  });
}

/**
 * 获取待上传的 changesets（按 seq 排序）
 * SYNC2-L3: 支持按表过滤——原实现仅支持全局 limit，多表启用 CRDT 时
 * crdtSyncChannel 每表取前 50 条再 filter，靠后表（数据量大）的变更
 * 可能被全局前 50 条挤掉，形成推送饥饿。
 */
export async function getPendingCRDTChanges(
  limit: number = 50,
  tableName?: string,
): Promise<CRDTChangeRecord[]> {
  const { db } = await import('@/lib/storage/database');
  if (tableName) {
    return db.crdtChanges
      .orderBy('seq')
      .filter(c => c.tableName === tableName)
      .limit(limit)
      .toArray();
  }
  return db.crdtChanges
    .orderBy('seq')
    .limit(limit)
    .toArray();
}

/**
 * 标记 changesets 为已上传（按 seq 删除）
 */
export async function markCRDTChangesUploaded(seqs: number[]): Promise<void> {
  const { db } = await import('@/lib/storage/database');
  await db.crdtChanges.bulkDelete(seqs);
}
