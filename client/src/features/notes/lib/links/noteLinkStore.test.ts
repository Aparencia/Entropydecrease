/**
 * noteLinkStore 单测：链接索引存储（mock db，内存态 noteLinks 表）
 * Unit tests for note link index store (mocked db with in-memory table)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LinkRow { id: string; fromId: string; toId: string; createdAt: Date }

const mocks = vi.hoisted(() => {
  const state: { rows: LinkRow[] } = { rows: [] };
  const table = {
    where: (field: 'fromId' | 'toId') => ({
      equals: (value: string) => ({
        delete: async () => {
          const before = state.rows.length;
          state.rows = state.rows.filter((r) => r[field] !== value);
          return before - state.rows.length;
        },
        toArray: async () => state.rows.filter((r) => r[field] === value),
      }),
    }),
    bulkPut: async (rows: LinkRow[]) => {
      for (const row of rows) {
        state.rows = state.rows.filter((r) => r.id !== row.id);
        state.rows.push(row);
      }
      return rows.length;
    },
    toArray: async () => [...state.rows],
  };
  const transaction = async (_mode: unknown, _table: unknown, fn: () => Promise<void>) => { await fn(); };
  return { state, table, transaction };
});

vi.mock('@/lib/storage/database', () => ({
  db: { noteLinks: mocks.table, transaction: mocks.transaction },
}));

import { recomputeLinks, getBacklinks, removeLinks, getAllLinks } from './noteLinkStore';

/** 构造含若干 wikiLink 的 TipTap JSON */
function contentWithLinks(...ids: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: ids.map((id) => ({ type: 'wikiLink', attrs: { id, label: 'x' } })) }],
  });
}

describe('noteLinkStore', () => {
  beforeEach(() => { mocks.state.rows = []; });

  it('recomputeLinks 写入出链', async () => {
    await recomputeLinks('A', contentWithLinks('B', 'C'));
    const ids = mocks.state.rows.map((r) => r.id).sort();
    expect(ids).toEqual(['A->B', 'A->C']);
  });

  it('recomputeLinks 排除自链', async () => {
    await recomputeLinks('A', contentWithLinks('A', 'B'));
    expect(mocks.state.rows.map((r) => r.id)).toEqual(['A->B']);
  });

  it('recomputeLinks 幂等（重复调用不重复）', async () => {
    await recomputeLinks('A', contentWithLinks('B'));
    await recomputeLinks('A', contentWithLinks('B'));
    expect(mocks.state.rows).toHaveLength(1);
  });

  it('recomputeLinks 内容变更后清除旧出链', async () => {
    await recomputeLinks('A', contentWithLinks('B', 'C'));
    await recomputeLinks('A', contentWithLinks('D'));
    expect(mocks.state.rows.map((r) => r.id)).toEqual(['A->D']);
  });

  it('getBacklinks 反向查询', async () => {
    await recomputeLinks('A', contentWithLinks('B'));
    await recomputeLinks('C', contentWithLinks('B'));
    const back = await getBacklinks('B');
    expect(back.map((r) => r.fromId).sort()).toEqual(['A', 'C']);
  });

  it('removeLinks 清理相关链接', async () => {
    await recomputeLinks('A', contentWithLinks('B'));
    await recomputeLinks('B', contentWithLinks('C'));
    await removeLinks('B');
    // B 的出链（B->C）与指向 B 的入链（A->B）均被清理
    expect(mocks.state.rows).toHaveLength(0);
  });

  it('getAllLinks 返回全量', async () => {
    await recomputeLinks('A', contentWithLinks('B'));
    await recomputeLinks('C', contentWithLinks('D'));
    expect(await getAllLinks()).toHaveLength(2);
  });
});
