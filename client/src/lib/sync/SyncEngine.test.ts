import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (vi.mock is hoisted)
const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
}));
vi.mock('../http/apiClient', () => ({
  apiClient: { post: mockPost, get: mockGet },
}));

const { mockGetUnsyncedLogsBatch, mockMarkLogsSynced, mockGetDeviceId } = vi.hoisted(() => ({
  mockGetUnsyncedLogsBatch: vi.fn(),
  mockMarkLogsSynced: vi.fn(),
  mockGetDeviceId: vi.fn().mockReturnValue('device-1'),
}));
vi.mock('../storage/operationLog', () => ({
  getDeviceId: mockGetDeviceId,
  getUnsyncedLogsBatch: mockGetUnsyncedLogsBatch,
  markLogsSynced: mockMarkLogsSynced,
}));

const { mockOfflineQueue } = vi.hoisted(() => ({
  mockOfflineQueue: {
    isEmpty: vi.fn().mockResolvedValue(true),
    isProcessing: vi.fn().mockReturnValue(false),
    setProcessing: vi.fn(),
    getPendingItems: vi.fn().mockResolvedValue([]),
    getReadyItems: vi.fn().mockResolvedValue([]),
    removeItems: vi.fn(),
    incrementRetry: vi.fn(),
    scheduleRetry: vi.fn(),
    cleanupExpired: vi.fn(),
  },
}));
vi.mock('./OfflineQueue', () => ({ offlineQueue: mockOfflineQueue }));

const { mockNetworkGetState, mockNetworkSubscribe } = vi.hoisted(() => ({
  mockNetworkGetState: vi.fn().mockReturnValue({ status: 'online' }),
  mockNetworkSubscribe: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('./NetworkManager', () => ({
  networkManager: {
    getState: mockNetworkGetState,
    subscribe: mockNetworkSubscribe,
  },
}));

vi.mock('../storage/database', () => ({
  db: { table: vi.fn().mockReturnValue({ put: vi.fn(), delete: vi.fn() }) },
}));

import { SyncEngine } from './SyncEngine';
import type { SyncEvent } from './SyncEngine';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUnsyncedLogsBatch.mockResolvedValue([]);
  mockNetworkGetState.mockReturnValue({ status: 'online' });
  mockOfflineQueue.isEmpty.mockResolvedValue(true);
  localStorage.clear();
});

describe('SyncEngine', () => {
  // ── push() ────────────────────────────────────────────────
  describe('push()', () => {
    it('should return pushed=0 when there are no unsynced logs', async () => {
      const engine = new SyncEngine();
      const result = await engine.push();
      expect(result.pushed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should call API and mark logs synced on success', async () => {
      const logs = [
        { id: 'log-1', entityType: 'note', entityId: 'n1', operation: 'create', version: 1, patch: null, payload: '{}', createdAt: new Date() },
        { id: 'log-2', entityType: 'note', entityId: 'n2', operation: 'update', version: 2, patch: null, payload: '{}', createdAt: new Date() },
      ];
      mockGetUnsyncedLogsBatch.mockResolvedValueOnce(logs);
      mockPost.mockResolvedValueOnce({ accepted: ['log-1', 'log-2'], conflicts: [], errors: [] });

      const engine = new SyncEngine();
      const result = await engine.push();

      expect(result.pushed).toBe(2);
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockMarkLogsSynced).toHaveBeenCalledWith(['log-1', 'log-2']);
    });

    it('should handle conflicts from server', async () => {
      const logs = [
        { id: 'log-1', entityType: 'note', entityId: 'n1', operation: 'update', version: 2, patch: null, payload: '{}', createdAt: new Date() },
      ];
      mockGetUnsyncedLogsBatch.mockResolvedValueOnce(logs);
      mockPost.mockResolvedValueOnce({
        accepted: [],
        conflicts: [{ entityType: 'note', entityId: 'n1', serverVersion: 5, serverData: { title: 'remote' } }],
        errors: [],
      });

      // Mock crypto.randomUUID
      const origRandomUUID = crypto.randomUUID;
      Object.defineProperty(crypto, 'randomUUID', { value: () => 'uuid-1', configurable: true });

      const engine = new SyncEngine();
      const result = await engine.push();

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].entityId).toBe('n1');
      expect(result.conflicts[0].remoteVersion).toBe(5);

      Object.defineProperty(crypto, 'randomUUID', { value: origRandomUUID, configurable: true });
    });

    it('should capture errors from push API call', async () => {
      const logs = [
        { id: 'log-1', entityType: 'note', entityId: 'n1', operation: 'create', version: 1, patch: null, payload: '{}', createdAt: new Date() },
      ];
      mockGetUnsyncedLogsBatch.mockResolvedValueOnce(logs);
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      const engine = new SyncEngine();
      const result = await engine.push();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Push failed');
    });
  });

  // ── pull() ────────────────────────────────────────────────
  describe('pull()', () => {
    it('should fetch remote operations and update last sync version', async () => {
      mockGet.mockResolvedValueOnce({
        operations: [
          { entityType: 'note', entityId: 'n1', operation: 'create', data: { id: 'n1', title: 'hi' }, version: 10 },
        ],
        latestVersion: 10,
      });

      const engine = new SyncEngine();
      const result = await engine.pull();

      expect(result.pulled).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(localStorage.getItem('ed_last_sync_version')).toBe('10');
    });

    it('should return pulled=0 on API error', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server down'));
      const engine = new SyncEngine();
      const result = await engine.pull();
      expect(result.pulled).toBe(0);
      expect(result.errors[0]).toContain('Pull failed');
    });
  });

  // ── sync() ────────────────────────────────────────────────
  describe('sync()', () => {
    it('should run push → pull → replayOfflineQueue', async () => {
      mockGetUnsyncedLogsBatch.mockResolvedValueOnce([]);
      mockGet.mockResolvedValueOnce({ operations: [], latestVersion: 0 });

      const engine = new SyncEngine();
      const result = await engine.sync();

      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should prevent concurrent syncs (syncInProgress)', async () => {
      // Start first sync but don't await
      mockGetUnsyncedLogsBatch.mockResolvedValue([]);
      mockGet.mockResolvedValue({ operations: [], latestVersion: 0 });

      const engine = new SyncEngine();
      const sync1 = engine.sync();
      const sync2 = engine.sync();

      const [r1, r2] = await Promise.all([sync1, sync2]);
      // One should succeed, the other should report "already in progress"
      const hasInProgress = [r1, r2].some(r => r.errors.some(e => e.includes('already in progress')));
      expect(hasInProgress).toBe(true);
    });

    it('should skip sync when offline', async () => {
      mockNetworkGetState.mockReturnValue({ status: 'offline' });
      const engine = new SyncEngine();
      const result = await engine.sync();
      expect(result.errors).toContain('Device is offline');
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  // ── events ────────────────────────────────────────────────
  describe('subscribe()', () => {
    it('should emit sync-start and sync-complete events', async () => {
      const events: SyncEvent[] = [];
      const engine = new SyncEngine();
      engine.subscribe((e) => events.push(e));

      mockGetUnsyncedLogsBatch.mockResolvedValueOnce([]);
      mockGet.mockResolvedValueOnce({ operations: [], latestVersion: 0 });

      await engine.sync();

      expect(events.some(e => e.type === 'sync-start')).toBe(true);
      expect(events.some(e => e.type === 'sync-complete')).toBe(true);
    });

    it('should emit sync-error on exception', async () => {
      const events: SyncEvent[] = [];
      const engine = new SyncEngine();
      engine.subscribe((e) => events.push(e));

      // Make push throw
      mockGetUnsyncedLogsBatch.mockRejectedValueOnce(new Error('DB error'));
      mockGet.mockResolvedValueOnce({ operations: [], latestVersion: 0 });

      await engine.sync();

      expect(events.some(e => e.type === 'sync-start')).toBe(true);
    });

    it('should unsubscribe when returned function is called', async () => {
      const events: SyncEvent[] = [];
      const engine = new SyncEngine();
      const unsub = engine.subscribe((e) => events.push(e));
      unsub();

      mockGetUnsyncedLogsBatch.mockResolvedValueOnce([]);
      mockGet.mockResolvedValueOnce({ operations: [], latestVersion: 0 });
      await engine.sync();

      expect(events).toHaveLength(0);
    });
  });

  // ── 自动同步洪泛防护（网络恢复触发） ───────────────────
  describe('registerNetworkRecoverySync() 洪泛防护', () => {
    it('仅在"转为 online"跳变沿触发同步，持续 online 的重复通知不重复触发', async () => {
      mockGet.mockResolvedValue({ operations: [], latestVersion: 0 });
      const engine = new SyncEngine();
      engine.registerNetworkRecoverySync();
      const listener = mockNetworkSubscribe.mock.calls.at(-1)?.[0];
      expect(listener).toBeDefined();

      // 持续 online（无跳变）→ 不触发
      listener({ status: 'online' });
      await new Promise((r) => setTimeout(r, 0));
      expect(mockGet).not.toHaveBeenCalled();

      // weak → online 跳变沿 → 触发一次
      listener({ status: 'weak' });
      listener({ status: 'online' });
      await new Promise((r) => setTimeout(r, 0));
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('同步连续失败后指数退避：短窗口内的后续跳变不再发请求', async () => {
      mockGet.mockRejectedValue(new Error('ERR_CONNECTION_TIMED_OUT'));
      const engine = new SyncEngine();
      engine.registerNetworkRecoverySync();
      const listener = mockNetworkSubscribe.mock.calls.at(-1)?.[0];
      expect(listener).toBeDefined();

      // 第一次跳变：触发并失败（计入退避）
      listener({ status: 'weak' });
      listener({ status: 'online' });
      await new Promise((r) => setTimeout(r, 0));

      // 第二次跳变：仍在退避窗口（≥20s）内 → 不再发请求
      listener({ status: 'weak' });
      listener({ status: 'online' });
      await new Promise((r) => setTimeout(r, 0));

      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });
});
