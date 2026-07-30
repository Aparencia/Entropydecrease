/**
 * 同步模式 Feature Flag（熵减同步链路开关）
 *
 * @ai-context: localStorage 键 'sync_mode' 控制 oplog/crdt 双路径切换，
 * 切换后需重启同步引擎生效。从 crdtEngine.ts 拆出（2026-07 二次瘦身），
 * 旧导入路径 '@/lib/sync/crdtEngine' 经 re-export 依然有效。
 */
import { CRDT_ENABLED_TABLES, SYNC_MODE_FLAG } from './crdtTypes';

/** 获取当前同步模式 */
export function getSyncMode(): 'crdt' | 'oplog' {
  const mode = localStorage.getItem(SYNC_MODE_FLAG);
  return mode === 'crdt' ? 'crdt' : 'oplog';
}

/** 设置同步模式（需要重启同步引擎生效） */
export function setSyncMode(mode: 'crdt' | 'oplog'): void {
  localStorage.setItem(SYNC_MODE_FLAG, mode);
}

/** 检查指定表当前是否应使用 CRDT 路径 */
export function shouldUseCRDT(tableName: string): boolean {
  if (getSyncMode() !== 'crdt') return false;
  return CRDT_ENABLED_TABLES.includes(tableName);
}
