/**
 * 同步上下文与 useSync Hook（自 SyncContext.tsx 拆出）
 *
 * @ai-context: 同步状态 Context 的上下文对象与消费 Hook——从组件文件移出
 * （react-refresh：组件文件只导出组件），SyncProvider 组件保留在 SyncContext.tsx。
 */
import { createContext, useContext } from 'react';
import type { SyncResult } from './SyncEngine';

export interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  lastResult: SyncResult | null;
  pendingCount: number;
  conflictCount: number;
}

export interface SyncContextValue extends SyncState {
  sync: () => Promise<SyncResult>;
  isOnline: boolean;
}

export const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
