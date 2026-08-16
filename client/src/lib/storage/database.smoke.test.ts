// @vitest-environment jsdom
/**
 * PWA Dexie 存储冒烟测试（T0.3 前置验证）
 *
 * @ai-context: 用 fake-indexeddb 在 jsdom 中真实初始化 IndexedDB，验证
 * 'keban' 库 25 版本 schema 可 open、核心表（notes/pomodoroSessions/
 * classroomNotes/offlineQueue/crdtDocs）可写读、createAllStores() PWA 分支
 * 返回 Dexie 存储。现有单测均 vi.mock 掉 db，schema 升级链从未真实验证——
 * 本冒烟是 PWA 移动端存储地基的最低保障。
 * @ai-context EN: real IndexedDB smoke test via fake-indexeddb in jsdom —
 * verifies the 25-version 'keban' schema opens, core tables read/write, and
 * createAllStores() resolves to Dexie-backed stores under the PWA branch.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './database';
import { createAllStores, getRuntimeEnvironment } from './storageFactory';
import type { Note } from '@/types/models';

describe('Dexie PWA 存储冒烟（T0.3）', () => {
  beforeAll(async () => {
    await db.open();
  });

  it('schema open 成功且库名/版本正确', () => {
    expect(db.name).toBe('keban');
    expect(db.verno).toBe(25);
    expect(db.notes).toBeDefined();
    expect(db.pomodoroSessions).toBeDefined();
    expect(db.classroomNotes).toBeDefined();
    expect(db.offlineQueue).toBeDefined();
    expect(db.crdtDocs).toBeDefined();
  });

  it('PWA 运行时判定（jsdom 无 electronAPI）', () => {
    expect(getRuntimeEnvironment()).toBe('pwa');
  });

  it('notes 表真实读写', async () => {
    const id = 'smoke-note-1';
    await db.notes.put({
      id,
      title: '冒烟',
      createdAt: 1,
      updatedAt: 1,
      tags: [],
      pinned: false,
    } as unknown as Note);
    const got = await db.notes.get(id);
    expect(got?.title).toBe('冒烟');
    await db.notes.delete(id);
    expect(await db.notes.get(id)).toBeUndefined();
  });

  it('createAllStores PWA 分支返回可用存储', async () => {
    const stores = createAllStores();
    expect(await stores.notes.count()).toBe(0);
    expect(await stores.pomodoroSessions.count()).toBe(0);
    expect(await stores.offlineQueue.count()).toBe(0);
  });
});
