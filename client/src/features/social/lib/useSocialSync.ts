/**
 * 社交功能同步状态 Hook
 * Social features sync-status hook
 *
 * @ai-context: 社交功能仅在 syncEnabled 模式下可见可用（modeManager 判定，
 * 与 SyncContext 注册网络恢复同步的条件一致）。订阅 modeManager 与
 * networkManager 保持响应式；local 模式或离线时返回 false，UI 展示
 * "离线模式"而非错误。
 * @ai-context: Social features require sync-enabled mode (same condition as
 * SyncContext). Subscribes to modeManager + networkManager; local mode or
 * offline yields false → UI shows an offline state instead of errors.
 */
import { useEffect, useState } from 'react';
import { modeManager } from '@/lib/mode/ModeManager';
import { networkManager } from '@/lib/sync/NetworkManager';

export interface SocialSyncState {
  /** sync 是否启用（local 模式为 false） */
  syncEnabled: boolean;
  /** 网络是否在线（弱网视为可用，静默降级由 API 层处理） */
  online: boolean;
}

export function useSocialSync(): SocialSyncState {
  const [syncEnabled, setSyncEnabled] = useState(modeManager.isSyncEnabled());
  const [online, setOnline] = useState(() => networkManager.getState().status !== 'offline');

  useEffect(() => {
    const unsubMode = modeManager.subscribe((_mode, config) => {
      setSyncEnabled(config.syncEnabled);
    });
    const unsubNet = networkManager.subscribe((state) => {
      setOnline(state.status !== 'offline');
    });
    return () => {
      unsubMode();
      unsubNet();
    };
  }, []);

  return { syncEnabled, online };
}
