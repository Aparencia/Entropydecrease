/**
 * 留存机制全局设置 Store
 * Retention mechanism global settings store
 *
 * @ai-context: 管理所有留存功能的开关状态，持久化到 appSettings 表。
 * 4.5 节自主感保护：用户可随时关闭任何养成反馈，无惩罚。
 * @ai-context: Manages toggles for all retention features, persisted to
 * appSettings table. Users can disable any nurture feedback at any time.
 */
import { create } from 'zustand';
import { appSettingsStore } from '@/lib/storage';
import {
  DEFAULT_RETENTION_SETTINGS,
  type RetentionSettings,
} from '../types';

const SETTINGS_KEY = 'retention_settings';

interface RetentionSettingsState extends RetentionSettings {
  /** 是否已从 DB 加载 / Whether loaded from DB */
  loaded: boolean;
  /** 初始化：从 appSettings 读取 / Initialize: load from appSettings */
  initialize: () => Promise<void>;
  /** 更新单项设置 / Update a single setting */
  updateSetting: <K extends keyof RetentionSettings>(
    key: K,
    value: RetentionSettings[K],
  ) => Promise<void>;
  /** 重置为默认 / Reset to defaults */
  resetToDefaults: () => Promise<void>;
}

export const useRetentionSettings = create<RetentionSettingsState>((set, get) => ({
  ...DEFAULT_RETENTION_SETTINGS,
  loaded: false,

  initialize: async () => {
    try {
      const record = await appSettingsStore.getById(SETTINGS_KEY);
      if (record) {
        const parsed = JSON.parse(record.value) as Partial<RetentionSettings>;
        set({ ...DEFAULT_RETENTION_SETTINGS, ...parsed, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  updateSetting: async (key, value) => {
    set({ [key]: value } as Partial<RetentionSettingsState>);
    await persist(get());
  },

  resetToDefaults: async () => {
    set({ ...DEFAULT_RETENTION_SETTINGS });
    await persist(get());
  },
}));

/** 持久化到 appSettings 表 / Persist to appSettings table */
async function persist(state: RetentionSettingsState) {
  const { loaded, initialize, updateSetting, resetToDefaults, ...settings } = state;
  void loaded; void initialize; void updateSetting; void resetToDefaults;
  const value = JSON.stringify(settings);
  try {
    const existing = await appSettingsStore.getById(SETTINGS_KEY);
    if (existing) {
      await appSettingsStore.update(SETTINGS_KEY, { value, updatedAt: new Date() });
    } else {
      await appSettingsStore.create({
        id: SETTINGS_KEY,
        key: SETTINGS_KEY,
        value,
        updatedAt: new Date(),
      });
    }
  } catch { /* 静默失败，不阻塞 UI */ }
}
