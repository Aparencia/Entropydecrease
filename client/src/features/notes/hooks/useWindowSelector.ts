/**
 * @ai-context: notes 功能模块 Hook：useWindowSelector。
 */
import { useState, useCallback, useEffect } from 'react';
import type { WindowInfo } from '@/lib/capture';

// ================================================================
// useWindowSelector — 窗口选择状态管理
// ================================================================

export function useWindowSelector() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);

  // 获取窗口列表
  const refreshWindows = useCallback(async () => {
    if (!window.electronAPI) return;
    setWindowsLoading(true);
    try {
      const result = await window.electronAPI.invoke('screen_list_windows');
      setWindows(result as WindowInfo[]);
    } catch {
      // eslint-disable-next-line no-console -- 窗口列表获取失败
      console.error('[useWindowSelector] Failed to list windows');
    } finally {
      setWindowsLoading(false);
    }
  }, []);

  // 挂载时自动加载窗口列表
  useEffect(() => {
    refreshWindows();
  }, [refreshWindows]);

  return {
    windows,
    windowsLoading,
    selectedWindow,
    setSelectedWindow,
    refreshWindows,
  };
}
