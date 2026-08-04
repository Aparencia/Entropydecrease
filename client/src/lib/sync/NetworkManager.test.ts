import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkManager } from './NetworkManager';
import type { NetworkState } from './NetworkManager';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default: navigator.onLine = true
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('NetworkManager', () => {
  // ── Initial state ────────────────────────────────────────────
  describe('initial state', () => {
    it('should start as "online" when navigator.onLine is true', () => {
      const nm = new NetworkManager({ heartbeatUrl: '/health' });
      const state = nm.getState();
      expect(state.status).toBe('online');
      expect(state.lastOnlineAt).toBeInstanceOf(Date);
      expect(state.lastOfflineAt).toBeNull();
    });

    it('should start as "offline" when navigator.onLine is false', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const nm = new NetworkManager({ heartbeatUrl: '/health' });
      const state = nm.getState();
      expect(state.status).toBe('offline');
      expect(state.lastOnlineAt).toBeNull();
      expect(state.lastOfflineAt).toBeInstanceOf(Date);
    });
  });

  // ── online/offline events ────────────────────────────────────
  describe('online/offline events', () => {
    it('should switch to offline when browser fires offline event', () => {
      const nm = new NetworkManager({ heartbeatUrl: '/health' });
      nm.start();

      window.dispatchEvent(new Event('offline'));
      const state = nm.getState();
      expect(state.status).toBe('offline');
      expect(state.latency).toBeNull();

      nm.stop();
    });

    it('online 事件不直接断言 online，须经心跳实测后才转为 online（防 online 抖动触发同步洪泛）', async () => {
      mockFetch.mockRejectedValueOnce(new Error('server down'));
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const nm = new NetworkManager({ heartbeatUrl: '/health' });
      nm.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(nm.getState().status).toBe('offline');

      // 模拟网卡恢复：心跳转为可达
      mockFetch.mockResolvedValue({ ok: true });
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));

      // online 事件本身不改变状态（仅记录 lastOnlineAt 并触发心跳验证）
      expect(nm.getState().status).toBe('offline');

      // 心跳验证完成后才转为 online
      await vi.advanceTimersByTimeAsync(0);
      const state = nm.getState();
      expect(state.status).toBe('online');
      expect(state.lastOnlineAt).toBeInstanceOf(Date);

      nm.stop();
    });
  });

  // ── heartbeat / ping ─────────────────────────────────────────
  describe('heartbeat', () => {
    it('should ping immediately on start and update latency', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const nm = new NetworkManager({
        heartbeatUrl: '/health',
        heartbeatIntervalMs: 30000,
        weakThresholdMs: 5000,
      });
      nm.start();

      // Allow the async ping to complete
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledWith('/health', expect.objectContaining({
        method: 'GET',
        cache: 'no-cache',
      }));

      nm.stop();
    });

    it('should set status to "weak" when ping takes too long', async () => {
      // Make fetch take longer than weakThresholdMs / 2
      mockFetch.mockImplementation(() => new Promise(resolve =>
        setTimeout(() => resolve({ ok: true }), 3000)
      ));

      const nm = new NetworkManager({
        heartbeatUrl: '/health',
        heartbeatIntervalMs: 60000,
        weakThresholdMs: 5000,
      });
      nm.start();

      // Advance enough for the ping to resolve (>3000ms which is > 5000/2 = 2500ms)
      await vi.advanceTimersByTimeAsync(3100);

      const state = nm.getState();
      // Latency > weakThresholdMs / 2 means weak
      expect(state.status).toBe('weak');

      nm.stop();
    });

    it('should keep status "online" when ping is fast', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const nm = new NetworkManager({
        heartbeatUrl: '/health',
        heartbeatIntervalMs: 60000,
        weakThresholdMs: 5000,
      });
      nm.start();

      await vi.advanceTimersByTimeAsync(0);

      const state = nm.getState();
      expect(state.status).toBe('online');

      nm.stop();
    });

    it('should set status to "weak" when ping fails but browser is online', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const nm = new NetworkManager({
        heartbeatUrl: '/health',
        heartbeatIntervalMs: 60000,
        weakThresholdMs: 5000,
      });
      nm.start();

      await vi.advanceTimersByTimeAsync(0);

      const state = nm.getState();
      expect(state.status).toBe('weak');
      expect(state.latency).toBeNull();

      nm.stop();
    });

    it('should run heartbeat at configured interval', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const nm = new NetworkManager({
        heartbeatUrl: '/health',
        heartbeatIntervalMs: 10000,
        weakThresholdMs: 5000,
      });
      nm.start();

      // Initial ping
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // After interval
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      nm.stop();
    });
  });

  // ── subscribe ────────────────────────────────────────────────
  describe('subscribe()', () => {
    it('should notify listener on status change', () => {
      const states: NetworkState[] = [];
      const nm = new NetworkManager({ heartbeatUrl: '/health' });
      nm.subscribe((state) => states.push(state));
      nm.start();

      window.dispatchEvent(new Event('offline'));
      expect(states).toHaveLength(1);
      expect(states[0].status).toBe('offline');

      nm.stop();
    });

    it('should not notify when status does not change', () => {
      const states: NetworkState[] = [];
      const nm = new NetworkManager({ heartbeatUrl: '/health' });
      nm.subscribe((state) => states.push(state));
      nm.start();

      // Trigger offline twice
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));
      expect(states).toHaveLength(1);

      nm.stop();
    });

    it('should unsubscribe correctly', () => {
      const states: NetworkState[] = [];
      const nm = new NetworkManager({ heartbeatUrl: '/health' });
      const unsub = nm.subscribe((state) => states.push(state));
      nm.start();

      window.dispatchEvent(new Event('offline'));
      unsub();
      // Re-online to trigger another change
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));

      expect(states).toHaveLength(1); // only the offline event

      nm.stop();
    });
  });

  // ── stop ─────────────────────────────────────────────────────
  describe('stop()', () => {
    it('should clear heartbeat interval on stop', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const nm = new NetworkManager({
        heartbeatUrl: '/health',
        heartbeatIntervalMs: 5000,
        weakThresholdMs: 5000,
      });
      nm.start();
      await vi.advanceTimersByTimeAsync(0);
      nm.stop();

      const countBefore = mockFetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch.mock.calls.length).toBe(countBefore);
    });
  });
});
