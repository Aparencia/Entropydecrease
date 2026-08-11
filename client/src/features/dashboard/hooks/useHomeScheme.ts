/**
 * useHomeScheme — 首页双方案（深海/穹顶）选择 Hook
 *
 * 双方案视觉语言：深色（深海世界）= 毛玻璃发光系；浅色（穹顶世界）= 平面阴影系。
 * 默认跟随主题（data-theme），设置中可独立覆盖（homeScheme: 'auto' | 'deep-sea' | 'aurora-dome'）。
 *
 * 纯计算逻辑（resolveHomeScheme）独立导出供单测；hook 层负责 appSettingsStore 的异步加载与持久化。
 *
 * @ai-context: 首页方案选择——双主题表面语言分支的单一决策源。
 */
import { useCallback, useEffect, useState } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';
import { appSettingsStore } from '@/lib/storage';

export type HomeScheme = 'deep-sea' | 'aurora-dome';
export type HomeSchemeSetting = 'auto' | HomeScheme;

const SETTING_KEY = 'homeScheme';
const SETTING_ID_PREFIX = 'homeScheme';

/** 纯函数：设置 + 当前主题 → 生效方案（auto 时映射 data-theme） */
export function resolveHomeScheme(setting: HomeSchemeSetting, theme: 'light' | 'dark'): HomeScheme {
  if (setting === 'auto') return theme === 'dark' ? 'deep-sea' : 'aurora-dome';
  return setting;
}

interface HomeSchemeValue {
  scheme: HomeScheme;
  setting: HomeSchemeSetting;
  setScheme: (v: HomeSchemeSetting) => Promise<void>;
}

export function useHomeScheme(): HomeSchemeValue {
  const theme = useThemeStore((s) => s.theme);
  const [setting, setSetting] = useState<HomeSchemeSetting>('auto');

  // 启动加载持久化设置（静默失败回退 auto）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await appSettingsStore.getAll();
        const row = rows.find((r) => r.key === SETTING_KEY);
        if (!cancelled && row) {
          const v = JSON.parse(row.value) as HomeSchemeSetting;
          if (v === 'auto' || v === 'deep-sea' || v === 'aurora-dome') setSetting(v);
        }
      } catch {
        // 静默：默认 auto
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** 幂等 upsert（保留既有行结构，模式与 startupRitual 一致） */
  const setScheme = useCallback(async (v: HomeSchemeSetting) => {
    setSetting(v);
    try {
      const rows = await appSettingsStore.getAll();
      const row = rows.find((r) => r.key === SETTING_KEY);
      const value = JSON.stringify(v);
      if (row) {
        await appSettingsStore.update(row.id, { value, updatedAt: new Date() });
      } else {
        await appSettingsStore.create({
          id: `${SETTING_ID_PREFIX}-${Date.now()}`,
          key: SETTING_KEY,
          value,
          updatedAt: new Date(),
        });
      }
    } catch {
      // 静默：持久化失败不影响本次生效
    }
  }, []);

  return { scheme: resolveHomeScheme(setting, theme), setting, setScheme };
}
