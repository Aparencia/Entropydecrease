/**
 * classroomNoteStore 单元测试
 * 覆盖：delete 时 keyframe_cleanup 的 sessionId 共用保护
 * （同一采集会话可能产生多条笔记，仅当无其他引用时才清理图片目录）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const count = vi.fn<() => Promise<number>>();
  const filter = vi.fn((_predicate: (n: { id: string }) => boolean) => ({ count }));
  const first = vi.fn();
  const equals = vi.fn(() => ({ filter, first }));
  const where = vi.fn(() => ({ equals }));
  return {
    count,
    filter,
    equals,
    where,
    get: vi.fn(),
    del: vi.fn(),
  };
});

vi.mock('@/lib/storage/database', () => ({
  db: {
    classroomNotes: {
      get: mocks.get,
      delete: mocks.del,
      where: mocks.where,
    },
  },
}));
vi.mock('@/lib/search/dexieSearchIndexer', () => ({
  dexieSearchIndexer: { upsert: vi.fn(), remove: vi.fn() },
}));

import { classroomNoteStore } from './classroomNoteStore';

function setElectronAPI(api: unknown): void {
  (window as { electronAPI?: unknown }).electronAPI = api;
}

describe('classroomNoteStore.delete', () => {
  const originalElectronAPI = (window as { electronAPI?: unknown }).electronAPI;
  const invoke = vi.fn().mockResolvedValue(undefined);

  const note = {
    id: 'note-1',
    sessionId: 'session-a',
    title: '课堂笔记',
    content: '## 知识点',
    keyframesAnalyzed: 3,
    modelUsed: 'glm-4.6v-flash',
    sourceType: 'smart' as const,
    duration: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setElectronAPI({ invoke });
    mocks.get.mockResolvedValue(note);
    mocks.del.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setElectronAPI(originalElectronAPI);
  });

  it('should cleanup keyframe dir when no other note references the sessionId', async () => {
    // Arrange: 无其他笔记共用 sessionId
    mocks.count.mockResolvedValue(0);

    // Act
    await classroomNoteStore.delete('note-1');

    // Assert
    expect(mocks.where).toHaveBeenCalledWith('sessionId');
    expect(mocks.equals).toHaveBeenCalledWith('session-a');
    expect(invoke).toHaveBeenCalledWith('keyframe_cleanup', { sessionId: 'session-a' });
  });

  it('should NOT cleanup when another note still references the same sessionId', async () => {
    // Arrange: 全量分析 + 片段合并共用 sessionId，另一条笔记仍存在
    mocks.count.mockResolvedValue(1);

    // Act
    await classroomNoteStore.delete('note-1');

    // Assert: 记录被删但不清理共享图片目录
    expect(mocks.del).toHaveBeenCalledWith('note-1');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('should exclude the deleted note itself when counting references', async () => {
    // Arrange
    mocks.count.mockResolvedValue(0);

    // Act
    await classroomNoteStore.delete('note-1');

    // Assert: filter 谓词排除当前被删 id
    const predicate = mocks.filter.mock.calls[0][0] as (n: { id: string }) => boolean;
    expect(predicate({ id: 'note-1' })).toBe(false);
    expect(predicate({ id: 'note-2' })).toBe(true);
  });

  it('should skip cleanup gracefully when electronAPI is absent (non-Electron env)', async () => {
    // Arrange
    setElectronAPI(undefined);

    // Act & Assert: 不抛错、不查询引用计数
    await expect(classroomNoteStore.delete('note-1')).resolves.toBeUndefined();
    expect(mocks.where).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
