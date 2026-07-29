import type { IRepository } from './interfaces';

/**
 * IPC 存储适配器 - 实现 IRepository<T> 接口
 *
 * 渲染进程通过 window.electronAPI.db.* 调用主进程 SQLite，
 * 所有操作走 IPC invoke/handle 通道。
 * 仅在 Electron 环境下使用。
 *
 * @ai-context: 主进程侧已做 SQLite 层加解密，本适配器不做敏感字段处理
 * （与 StorageAdapter 的解密路径不同源）。find 的 predicate 无法跨 IPC
 * 序列化，故全量拉取后本地过滤——大表慎用。
 */
export class IpcStorageAdapter<T extends { id: string }> implements IRepository<T> {
  private tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /** 获取 IPC db bridge，不可用时抛出明确错误 */
  private get db() {
    if (!window.electronAPI?.db) {
      throw new Error('[IpcStorageAdapter] Electron IPC db bridge not available');
    }
    return window.electronAPI.db;
  }

  async getAll(): Promise<T[]> {
    return await this.db.query<T[]>(this.tableName, 'getAll');
  }

  async getById(id: string): Promise<T | undefined> {
    return await this.db.query<T | undefined>(this.tableName, 'getById', [id]);
  }

  async create(item: Omit<T, 'id'> & { id: string }): Promise<string> {
    return await this.db.insert(this.tableName, item);
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    await this.db.update(this.tableName, id, changes);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.tableName, id);
  }

  /**
   * find 方法无法将 predicate 闭包序列化到主进程，
   * 因此先通过 IPC 获取全部数据，再在渲染进程中执行过滤。
   */
  async find(predicate: (item: T) => boolean): Promise<T[]> {
    const all = await this.getAll();
    return all.filter(predicate);
  }

  async bulkCreate(items: (Omit<T, 'id'> & { id: string })[]): Promise<string[]> {
    if (items.length === 0) return [];
    const ops = items.map(item => ({ type: 'create', table: this.tableName, item }));
    await this.db.batch(ops);
    return items.map(item => item.id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const ops = ids.map(id => ({ type: 'delete', table: this.tableName, id }));
    await this.db.batch(ops);
  }

  async count(): Promise<number> {
    return await this.db.query<number>(this.tableName, 'count');
  }

  async clear(): Promise<void> {
    await this.db.query(this.tableName, 'clear');
  }
}
