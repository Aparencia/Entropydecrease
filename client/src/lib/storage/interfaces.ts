/**
 * 存储仓库泛型契约
 *
 * @ai-context: IRepository 是双端存储（Dexie/IPC-SQLite）的统一契约，
 * 修改签名需同步 StorageAdapter 与 IpcStorageAdapter 两个实现。
 */
// 存储仓库泛型接口
import type { SyncConflict } from '@/types/models';

export interface IRepository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(item: Omit<T, 'id'> & { id: string }): Promise<string>;
  update(id: string, changes: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
  find(predicate: (item: T) => boolean): Promise<T[]>;
  bulkCreate(items: (Omit<T, 'id'> & { id: string })[]): Promise<string[]>;
  bulkDelete(ids: string[]): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

// 同步结果
export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: SyncConflict[];
  errors: string[];
  lastSyncAt: Date;
}
