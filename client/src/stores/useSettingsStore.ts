/**
 * @ai-context: 全局设置 Zustand store（persist 持久化）——aiConfig.gatewayUrl 为 AI 网关地址唯一权威来源，persist key 不可改否则用户设置丢失。
 */
import { create } from 'zustand';
import { getAIConfig, saveAIConfig as persistAIConfig, updateAIGatewayUrl } from '@/lib/ai/config';
import type { AIConfig } from '@/lib/ai/config';
import { saveUserKeys as persistUserKeys, getUserKeys, clearUserKeys as persistClearUserKeys } from '@/lib/ai/apiKeyManager';
import type { AIProviderKeys } from '@/lib/ai/apiKeyManager';
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_SETTINGS_KEY,
  type SoundSettings,
} from '@/lib/audio/audioConfig';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

/**
 * 从 localStorage 加载音效设置
 * @returns 音效设置
 */
function loadSoundSettings(): SoundSettings {
  try {
    const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<SoundSettings>;
      return {
        masterMute: parsed.masterMute ?? DEFAULT_SOUND_SETTINGS.masterMute,
        categories: { ...DEFAULT_SOUND_SETTINGS.categories, ...parsed.categories },
      };
    }
  } catch { /* 静默降级 */ }
  return { ...DEFAULT_SOUND_SETTINGS };
}

/**
 * 持久化音效设置到 localStorage
 * @param settings - 音效设置
 */
function persistSoundSettings(settings: SoundSettings): void {
  try { localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

interface SettingsState {
  /** AI 服务配置 */
  aiConfig: AIConfig;
  /** 是否显示 AI 主 API Key */
  showApiKey: boolean;
  /** 用户自配置 API Keys */
  userKeys: AIProviderKeys;
  /** 各 provider Key 可见性 */
  showUserKey: Record<string, boolean>;
  /** 音效设置（分类控制） */
  soundSettings: SoundSettings;

  /** 更新 AI 配置（内存态） */
  setAIConfig: (config: AIConfig) => void;
  /** 切换 AI 主 API Key 可见性 */
  toggleShowApiKey: () => void;
  /** 更新用户 Key（内存态） */
  setUserKeys: (keys: AIProviderKeys | ((prev: AIProviderKeys) => AIProviderKeys)) => void;
  /** 切换指定 provider Key 可见性 */
  toggleUserKeyVisibility: (provider: string) => void;
  /**
   * 更新音效设置（合并更新 + 同步到 SoundPlayer + 持久化）
   * @param partial - 部分音效设置
   */
  updateSoundSettings: (partial: Partial<SoundSettings>) => void;

  /** 保存 AI 配置到 localStorage */
  saveAIConfigAction: () => void;
  /** 保存用户 Keys 到 localStorage */
  saveUserKeysAction: () => void;
  /** 清除用户 Keys */
  clearUserKeysAction: () => void;
}

/** 初始化时加载音效设置并同步到 SoundPlayer */
const initialSoundSettings = loadSoundSettings();
soundPlayer.updateSettings(initialSoundSettings);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  aiConfig: getAIConfig(),
  showApiKey: false,
  userKeys: getUserKeys(),
  showUserKey: {},
  soundSettings: initialSoundSettings,

  setAIConfig: (config) => set({ aiConfig: config }),

  toggleShowApiKey: () => set((state) => ({ showApiKey: !state.showApiKey })),

  setUserKeys: (keys) => {
    if (typeof keys === 'function') {
      set((state) => ({ userKeys: keys(state.userKeys) }));
    } else {
      set({ userKeys: keys });
    }
  },

  toggleUserKeyVisibility: (provider) =>
    set((state) => ({
      showUserKey: { ...state.showUserKey, [provider]: !state.showUserKey[provider] },
    })),

  updateSoundSettings: (partial) => {
    const current = get().soundSettings;
    const next: SoundSettings = {
      masterMute: partial.masterMute ?? current.masterMute,
      categories: partial.categories
        ? { ...current.categories, ...partial.categories }
        : current.categories,
    };
    set({ soundSettings: next });
    soundPlayer.updateSettings(next);
    persistSoundSettings(next);
  },

  saveAIConfigAction: () => {
    const { aiConfig } = get();
    persistAIConfig(aiConfig);
    updateAIGatewayUrl(aiConfig.gatewayUrl);
    // 同步网关地址到 Electron 主进程（主进程无法访问 localStorage）
    if (window.electronAPI) {
      window.electronAPI.invoke('ai:set-gateway-url', aiConfig.gatewayUrl).catch(() => {});
    }
  },

  saveUserKeysAction: () => {
    const { userKeys } = get();
    persistUserKeys(userKeys);
  },

  clearUserKeysAction: () => {
    persistClearUserKeys();
    set({ userKeys: {} });
  },
}));
