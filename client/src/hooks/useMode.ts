/**
 * @ai-context: 应用模式（本地/云端）切换 Hook，包含 ModeManager；模式影响同步与 AI 路由全链路。
 */
import { useState, useEffect } from 'react';
import { modeManager, type AppMode, type ModeConfig } from '../lib/mode/ModeManager';

/**
 * 轻量版：仅订阅模式状态，不依赖 Auth/Toast 上下文
 * 适用于 Navbar 等只需展示模式的位置
 */
export function useModeState() {
  const [mode, setMode] = useState<AppMode>(modeManager.getMode());
  const [config, setConfig] = useState<ModeConfig>(modeManager.getConfig());

  useEffect(() => {
    const unsubscribe = modeManager.subscribe((newMode, newConfig) => {
      setMode(newMode);
      setConfig(newConfig);
    });
    return unsubscribe;
  }, []);

  return { mode, config };
}
