/**
 * 同步游标持久化（localStorage 边界层）
 *
 * @ai-context: 品牌重构键迁移——旧键 keban_last_sync_version /
 * keban_crdt_last_seq 更名为 ed_*。readCursor 内置一次性迁移：优先读新键，
 * 新键缺失时回读旧键并复制到新键、删除旧键。该兼容逻辑至少保留至 2027-01
 * （给全量用户一个升级窗口），届时方可移除旧键分支。
 * @ai-context: 游标丢失的后果是全量重拉（幂等、不丢数据），因此解析失败
 * 一律降级为 0 而非抛错。
 */

/** oplog 同步游标（服务端版本号水位） */
const LAST_SYNC_VERSION_KEY = 'ed_last_sync_version';
const LEGACY_LAST_SYNC_VERSION_KEY = 'keban_last_sync_version';

/** CRDT 同步游标（服务端 changeset 序列号水位） */
const CRDT_LAST_SEQ_KEY = 'ed_crdt_last_seq';
const LEGACY_CRDT_LAST_SEQ_KEY = 'keban_crdt_last_seq';

/** 读取游标：优先新键；缺失时迁移旧键（复制→删除） */
function readCursor(key: string, legacyKey: string): number {
  const stored = localStorage.getItem(key);
  if (stored !== null) {
    const parsed = parseInt(stored, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  // 一次性旧键迁移
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
    const parsed = parseInt(legacy, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

/** 获取 oplog 路径的最后同步版本号 */
export function getLastSyncVersion(): number {
  return readCursor(LAST_SYNC_VERSION_KEY, LEGACY_LAST_SYNC_VERSION_KEY);
}

/** 写入 oplog 路径的最后同步版本号 */
export function setLastSyncVersion(version: number): void {
  localStorage.setItem(LAST_SYNC_VERSION_KEY, version.toString());
}

/** 获取 CRDT 路径的最后同步序列号 */
export function getCRDTLastSeq(): number {
  return readCursor(CRDT_LAST_SEQ_KEY, LEGACY_CRDT_LAST_SEQ_KEY);
}

/** 写入 CRDT 路径的最后同步序列号 */
export function setCRDTLastSeq(seq: number): void {
  localStorage.setItem(CRDT_LAST_SEQ_KEY, seq.toString());
}
