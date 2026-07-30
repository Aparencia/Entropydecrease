/**
 * @ai-context: 网络在线状态订阅 Hook（online/offline 事件），离线降级的统一信号源。
 */
import { useState, useEffect } from 'react';
import { networkManager, type NetworkState } from '../lib/sync/NetworkManager';

/**
 * React hook：获取网络状态
 *
 * @example
 * ```tsx
 * const { status, latency, isOnline } = useNetworkStatus();
 * ```
 */
export function useNetworkStatus() {
  const [state, setState] = useState<NetworkState>(() => networkManager.getState());

  useEffect(() => {
    // 确保网络管理器已启动
    networkManager.start();

    const unsubscribe = networkManager.subscribe((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isOnline = state.status === 'online' || state.status === 'weak';
  const isWeak = state.status === 'weak';
  const isOffline = state.status === 'offline';

  return {
    status: state.status,
    latency: state.latency,
    isOnline,
    isWeak,
    isOffline,
    lastOnlineAt: state.lastOnlineAt,
    lastOfflineAt: state.lastOfflineAt,
  };
}
