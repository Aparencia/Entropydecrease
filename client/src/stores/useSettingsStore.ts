/**
 * @ai-context: 全局设置 Zustand store（persist 持久化）——aiConfig.gatewayUrl 为 AI 网关地址唯一权威来源，persist key 不可改否则用户设置丢失。
 */
import { create } from 'zustand';
import { getAIConfig, saveAIConfig as persistAIConfig, updateAIGatewayUrl } from '@/lib/ai/config';
import type { AIConfig } from '@/lib/ai/config';
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
  /** 音效设置（分类控制） */
  soundSettings: SoundSettings;
  /** CL-L11: 主进程网关地址同步失败信息（null 表示同步成功或未执行） */
  gatewaySyncError: string | null;

  /** 更新 AI 配置（内存态） */
  setAIConfig: (config: AIConfig) => void;
  /**
   * 更新音效设置（合并更新 + 同步到 SoundPlayer + 持久化）
   * @param partial - 部分音效设置
   */
  updateSoundSettings: (partial: Partial<SoundSettings>) => void;

  /** 保存 AI 配置到 localStorage（网关地址同步失败时抛错供 UI 提示） */
  saveAIConfigAction: () => Promise<void>;
}

/** 初始化时加载音效设置并同步到 SoundPlayer */
const initialSoundSettings = loadSoundSettings();
soundPlayer.updateSettings(initialSoundSettings);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  aiConfig: getAIConfig(),
  soundSettings: initialSoundSettings,
  gatewaySyncError: null,

  setAIConfig: (config) => set({ aiConfig: config }),

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

  saveAIConfigAction: async () => {
    const { aiConfig } = get();
    persistAIConfig(aiConfig);
    updateAIGatewayUrl(aiConfig.gatewayUrl);
    // 同步网关地址到 Electron 主进程（主进程无法访问 localStorage）
    if (window.electronAPI) {
      try {
        await window.electronAPI.invoke('ai:set-gateway-url', aiConfig.gatewayUrl);
        set({ gatewaySyncError: null });
      } catch (err) {
        // CL-L11: 主进程校验失败（URL 格式/域名/HTTPS/端口/路径）必须让用户感知，
        // 否则 UI 显示"已保存"但实际仍用旧网关地址——AI 功能静默异常且难以定位
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Settings] 网关地址同步失败:', message);
        set({ gatewaySyncError: message });
        throw new Error(`网关地址保存失败：${message}`);
      }
    }
  },
}));
