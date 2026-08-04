/**
 * 网络状态管理器
 *
 * @ai-context: 同步引擎的网络恢复触发源（subscribe 回调 status==='online'
 * 时触发一次同步，无定时器轮询）。修改状态判定逻辑会直接影响自动同步时机。
 */
/**
 * 网络状态管理器
 * 监听浏览器 online/offline 事件 + 心跳检测判断网络质量
 */

import { isDesktop } from '../utils/platform';

export type NetworkStatus = 'online' | 'offline' | 'weak';

export interface NetworkState {
  status: NetworkStatus;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
  latency: number | null; // ms, null when offline
}

type NetworkListener = (state: NetworkState) => void;

export class NetworkManager {
  private state: NetworkState;
  private listeners: Set<NetworkListener> = new Set();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatUrl: string;
  private heartbeatIntervalMs: number;
  private weakThresholdMs: number;
  private lastLatencyNotify = 0;
  private readonly LATENCY_NOTIFY_THROTTLE = 1000; // 延迟变化通知节流 1s
  private refCount = 0; // 引用计数，用于管理 start/stop 生命周期

  constructor(options?: {
    heartbeatUrl?: string;
    heartbeatIntervalMs?: number;
    weakThresholdMs?: number;
  }) {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    this.heartbeatUrl = options?.heartbeatUrl || (apiBase ? `${apiBase}/api/health` : '');
    // 桌面环境（Electron）下心跳 URL 必须是绝对 URL，避免协议拦截
    if (isDesktop() && this.heartbeatUrl && !this.heartbeatUrl.startsWith('http')) {
      this.heartbeatUrl = apiBase ? `${apiBase}/api/health` : '';
    }
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs || 30000; // 30秒
    this.weakThresholdMs = options?.weakThresholdMs || 5000; // 5秒超时视为弱网

    this.state = {
      status: navigator.onLine ? 'online' : 'offline',
      lastOnlineAt: navigator.onLine ? new Date() : null,
      lastOfflineAt: navigator.onLine ? null : new Date(),
      latency: null,
    };

    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
  }

  /**
   * 启动网络状态监听（引用计数，首次调用时启动）
   */
  start(): void {
    this.refCount++;
    if (this.refCount > 1) return; // 已有活跃实例
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // 启动心跳检测
    this.startHeartbeat();
  }

  /**
   * 停止网络状态监听（引用计数，末次调用时停止）
   */
  stop(): void {
    this.refCount--;
    if (this.refCount > 0) return; // 仍有活跃实例
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.stopHeartbeat();
  }

  /**
   * 获取当前网络状态
   */
  getState(): NetworkState {
    return { ...this.state };
  }

  /**
   * 订阅网络状态变化
   */
  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleOnline(): void {
    this.updateState({
      status: 'online',
      lastOnlineAt: new Date(),
    });
    // 恢复心跳
    this.startHeartbeat();
  }

  private handleOffline(): void {
    this.updateState({
      status: 'offline',
      lastOfflineAt: new Date(),
      latency: null,
    });
    this.stopHeartbeat();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => this.ping(), this.heartbeatIntervalMs);
    // 立即执行一次
    this.ping();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async ping(): Promise<void> {
    // 心跳 URL 未配置时跳过检测
    if (!this.heartbeatUrl) {
      return;
    }

    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.weakThresholdMs);

      await fetch(this.heartbeatUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache',
      });

      clearTimeout(timeout);
      const latency = Math.round(performance.now() - start);

      // 根据延迟判断网络质量
      const isWeak = latency > this.weakThresholdMs / 2;
      this.updateState({
        status: isWeak ? 'weak' : 'online',
        latency,
        lastOnlineAt: new Date(),
      });
    } catch {
      // 请求失败但浏览器显示在线 → 弱网或服务器不可用
      if (navigator.onLine) {
        this.updateState({
          status: 'weak',
          latency: null,
        });
      }
    }
  }

  private updateState(partial: Partial<NetworkState>): void {
    const prev = this.state;
    this.state = { ...this.state, ...partial };

    // 状态变化立即通知；延迟变化节流到 1s 避免高频通知
    if (prev.status !== this.state.status) {
      this.lastLatencyNotify = Date.now();
      this.listeners.forEach((listener) => listener(this.getState()));
    } else if (prev.latency !== this.state.latency) {
      const now = Date.now();
      if (now - this.lastLatencyNotify >= this.LATENCY_NOTIFY_THROTTLE) {
        this.lastLatencyNotify = now;
        this.listeners.forEach((listener) => listener(this.getState()));
      }
    }
  }
}

// 单例导出
export const networkManager = new NetworkManager({
  heartbeatUrl: import.meta.env.VITE_API_HEALTH_URL || (import.meta.env.VITE_API_BASE_URL ? `${import.meta.env.VITE_API_BASE_URL}/api/health` : ''),
  heartbeatIntervalMs: 30000,
  weakThresholdMs: 5000,
});
