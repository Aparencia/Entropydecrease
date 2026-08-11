/**
 * 响应式读取 localStorage 布尔开关
 *
 * @ai-context: 用于功能开关（如 ed-focus-guardian / ed-digital-wellbeing）——
 * 初始值从 localStorage 惰性读取，并订阅 window storage 事件，
 * 使设置页的开关变更无需重启即可生效（跨标签页同步）。
 */
import { useState, useEffect } from 'react';

export function useLocalStorageFlag(key: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // e.key === null 表示 localStorage.clear()
      if (e.key === null || e.key === key) {
        try { setEnabled(localStorage.getItem(key) === 'true'); } catch { setEnabled(false); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return enabled;
}
