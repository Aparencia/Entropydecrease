/**
 * @ai-context: notes 功能模块 Hook：useCaptureConfig。
 */
import { useState, useCallback } from 'react';
import type { CaptureMode, CaptureSidebarConfig, CapturePath } from '@/lib/capture';

// ================================================================
// useCaptureConfig — 采集配置状态管理
// ================================================================

const DEFAULT_CONFIG: CaptureSidebarConfig = {
  screenshotInterval: 5000,
  language: 'zh',
  autoInsert: false,
  mode: 'mixed',
};

export function useCaptureConfig() {
  const [config, setConfig] = useState<CaptureSidebarConfig>(DEFAULT_CONFIG);
  const [mode, setMode] = useState<CaptureMode>('mixed');
  const [capturePath, setCapturePath] = useState<CapturePath>('fine');

  // 配置变更（局部更新）
  const handleConfigChange = useCallback((patch: Partial<CaptureSidebarConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  // 模式切换（同步更新 mode 和 config.mode）
  const handleModeChange = useCallback((newMode: CaptureMode) => {
    setMode(newMode);
    setConfig((prev) => ({ ...prev, mode: newMode }));
  }, []);

  return {
    config,
    mode,
    capturePath,
    setCapturePath,
    handleConfigChange,
    handleModeChange,
  };
}
