/**
 * hotwordStore 单元测试
 *
 * @ai-context: mock db.hotwords 表方法，覆盖 CRUD（add 自动生成 id /
 * update 空更新不落库 / remove）+ 按课程过滤查询（全局 + 课程词条）与
 * 启用/类型过滤（listActiveReplaces / listActiveBoosts）。
 * @ai-context: EN: unit tests for the hotword Dexie store with mocked
 * table methods — CRUD, course-scoped filtering (global + course entries)
 * and enabled/kind filters for active replaces and boosts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn<(record: unknown) => Promise<void>>(),
  update: vi.fn<(id: string, updates: unknown) => Promise<number>>(),
  del: vi.fn<(id: string) => Promise<void>>(),
  toArray: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock('@/lib/storage/database', () => ({
  db: {
    hotwords: {
      add: mocks.add,
      update: mocks.update,
      delete: mocks.del,
      toArray: mocks.toArray,
    },
  },
}));

import { hotwordStore, type HotwordEntry } from './hotwordStore';

/** 构造测试词条 */
function makeEntry(overrides: Partial<HotwordEntry>): HotwordEntry {
  return {
    id: 'hw-1',
    term: '机气',
    target: '机器',
    kind: 'replace',
    courseId: undefined,
    enabled: true,
    createdAt: 0,
    ...overrides,
  };
}

describe('hotwordStore CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.add.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(1);
    mocks.del.mockResolvedValue(undefined);
  });

  it('add 自动生成 id 与 createdAt 并落库', async () => {
    const record = await hotwordStore.add({ term: '机气', target: '机器', kind: 'replace', enabled: true });
    expect(record.id).toEqual(expect.any(String));
    expect(record.id.length).toBeGreaterThan(0);
    expect(record.createdAt).toEqual(expect.any(Number));
    expect(mocks.add).toHaveBeenCalledWith(record);
  });

  it('update 透传部分字段（空更新不落库）', async () => {
    await hotwordStore.update('hw-1', { enabled: false });
    expect(mocks.update).toHaveBeenCalledWith('hw-1', { enabled: false });
    await hotwordStore.update('hw-1', {});
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('remove 按 id 删除', async () => {
    await hotwordStore.remove('hw-1');
    expect(mocks.del).toHaveBeenCalledWith('hw-1');
  });

  it('listAll 返回全量词条', async () => {
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];
    mocks.toArray.mockResolvedValue(entries);
    await expect(hotwordStore.listAll()).resolves.toEqual(entries);
  });
});

describe('hotwordStore 按课程过滤', () => {
  const globalEntry = makeEntry({ id: 'g', term: '全局词' });
  const mathEntry = makeEntry({ id: 'm', term: '傅里叶', courseId: '高等数学' });
  const csEntry = makeEntry({ id: 'c', term: '梯度', courseId: '机器学习' });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toArray.mockResolvedValue([globalEntry, mathEntry, csEntry]);
  });

  it('listForCourse 返回全局 + 指定课程词条，排除其他课程', async () => {
    const result = await hotwordStore.listForCourse('高等数学');
    expect(result.map((e) => e.id)).toEqual(['g', 'm']);
  });

  it('无课程参数时仅返回全局词条', async () => {
    const result = await hotwordStore.listForCourse();
    expect(result.map((e) => e.id)).toEqual(['g']);
  });

  it('listActiveReplaces 过滤停用词条与非 replace 类型', async () => {
    mocks.toArray.mockResolvedValue([
      makeEntry({ id: 'on', term: '机气', kind: 'replace', enabled: true }),
      makeEntry({ id: 'off', term: '停用词', kind: 'replace', enabled: false }),
      makeEntry({ id: 'boost', term: '热词', kind: 'boost', enabled: true }),
      makeEntry({ id: 'empty', term: '', kind: 'replace', enabled: true }),
    ]);
    const result = await hotwordStore.listActiveReplaces();
    expect(result.map((e) => e.id)).toEqual(['on']);
  });

  it('listActiveBoosts 返回启用的 boost 词条 term 列表', async () => {
    mocks.toArray.mockResolvedValue([
      makeEntry({ id: 'b1', term: '反向传播', kind: 'boost', enabled: true }),
      makeEntry({ id: 'b2', term: '停用热词', kind: 'boost', enabled: false }),
      makeEntry({ id: 'r1', term: '机气', kind: 'replace', enabled: true }),
    ]);
    await expect(hotwordStore.listActiveBoosts()).resolves.toEqual(['反向传播']);
  });

  it('listActiveReplaces 按课程过滤生效（课程专属 + 全局）', async () => {
    mocks.toArray.mockResolvedValue([
      makeEntry({ id: 'g', term: '嗯嗯', kind: 'replace', enabled: true }),
      makeEntry({ id: 'm', term: '机气', kind: 'replace', enabled: true, courseId: '高等数学' }),
      makeEntry({ id: 'c', term: '剃度', kind: 'replace', enabled: true, courseId: '机器学习' }),
    ]);
    const result = await hotwordStore.listActiveReplaces('高等数学');
    expect(result.map((e) => e.id)).toEqual(['g', 'm']);
  });
});
