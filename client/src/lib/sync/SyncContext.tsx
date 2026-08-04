/**
 * 同步状态 Context：向 UI 暴露同步进度、结果与手动触发入口
 *
 * @ai-context: 云同步为可选增强，未登录或离线时保持空闲态而非报错（本地优先）。
 * 订阅 syncEngine 事件流更新状态；networkManager 恢复联网时触发补偿同步。
 * @ai-context: 副作用集中于 effect 内的订阅/退订，Provider 外无全局写入。
 */
import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { syncEngine, type SyncResult, type SyncEvent } from './SyncEngine';
import { useAuth } from '../auth/AuthContext';
import { networkManager } from './NetworkManager';
import { modeManager } from '../mode/ModeManager';

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  lastResult: SyncResult | null;
  pendingCount: number;
  conflictCount: number;
}

interface SyncContextValue extends SyncState {
  sync: () => Promise<SyncResult>;
  isOnline: boolean;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<SyncState>({
    isSyncing: false,
    lastSyncAt: null,
    lastResult: null,
    pendingCount: 0,
    conflictCount: 0,
  });
  const [isOnline, setIsOnline] = useState(() => networkManager.getState().status !== 'offline');

  useEffect(() => {
    const unsubNetwork = networkManager.subscribe((netState) => {
      setIsOnline(netState.status !== 'offline');
    });
    return unsubNetwork;
  }, []);

  // 订阅同步引擎事件
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = syncEngine.subscribe((event: SyncEvent) => {
      switch (event.type) {
        case 'sync-start':
          setState(prev => ({ ...prev, isSyncing: true }));
          break;
        case 'sync-complete':
          setState(prev => ({
            ...prev,
            isSyncing: false,
            lastSyncAt: new Date(),
            lastResult: event.result,
            conflictCount: event.result.conflicts.length,
          }));
          break;
        case 'sync-error':
          setState(prev => ({ ...prev, isSyncing: false }));
          break;
      }
    });

    return unsubscribe;
  }, [isAuthenticated]);

  // 模式感知：注册网络恢复时的同步监听（不再使用定时同步）
  useEffect(() => {
    if (!isAuthenticated) return;

    const modeConfig = modeManager.getConfig();
    if (modeConfig.syncEnabled) {
      syncEngine.registerNetworkRecoverySync();
    }

    const unsubscribe = modeManager.subscribe((_mode, config) => {
      if (config.syncEnabled) {
        syncEngine.registerNetworkRecoverySync();
      } else {
        syncEngine.unregisterNetworkRecoverySync();
      }
    });

    return () => {
      unsubscribe();
      syncEngine.unregisterNetworkRecoverySync();
    };
  }, [isAuthenticated]);

  const sync = useCallback(async () => {
    return syncEngine.sync();
  }, []);

  return (
    <SyncContext.Provider value={{ ...state, sync, isOnline }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
