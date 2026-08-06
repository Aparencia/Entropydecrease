/**
 * 白噪音 / BGM 偏好全局 store
 *
 * @ai-context: 音频播放器已提升为全局层（PomodoroAudioLayer），页面组件
 * （深潜主页/设置页）不再持有播放器实例，只读写本 store 的偏好字段。
 * persist 复用 kb_audio_preferences key，与旧版 loadAudioPreferences/
 * saveAudioPreferences 数据格式完全兼容。
 *
 * @ai-context: Global audio preference store — pages read/write prefs here,
 * the global audio layer subscribes and drives the actual players.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AUDIO_PREFS_KEY, defaultAudioPreferences } from './audioConfig';

interface AudioPrefsState {
  whiteNoiseEnabled: boolean;
  whiteNoiseTrackId: string;
  whiteNoiseVolume: number;
  bgmEnabled: boolean;
  bgmTrackId: string;
  bgmVolume: number;
  /** 切换白噪音开关 */
  toggleWhiteNoise: () => void;
  /** 设置白噪音音量（0-1，钳制） */
  setWhiteNoiseVolume: (vol: number) => void;
  /** 切换白噪音音轨 */
  setWhiteNoiseTrack: (trackId: string) => void;
  /** 切换 BGM 开关 */
  toggleBgm: () => void;
  /** 设置 BGM 音量（0-1，钳制） */
  setBgmVolume: (vol: number) => void;
  /** 切换 BGM 音轨 */
  setBgmTrack: (trackId: string) => void;
}

export const useAudioPrefsStore = create<AudioPrefsState>()(
  persist(
    (set) => ({
      ...defaultAudioPreferences,
      toggleWhiteNoise: () => set((s) => ({ whiteNoiseEnabled: !s.whiteNoiseEnabled })),
      setWhiteNoiseVolume: (vol) => set({ whiteNoiseVolume: Math.max(0, Math.min(1, vol)) }),
      setWhiteNoiseTrack: (trackId) => set({ whiteNoiseTrackId: trackId }),
      toggleBgm: () => set((s) => ({ bgmEnabled: !s.bgmEnabled })),
      setBgmVolume: (vol) => set({ bgmVolume: Math.max(0, Math.min(1, vol)) }),
      setBgmTrack: (trackId) => set({ bgmTrackId: trackId }),
    }),
    { name: AUDIO_PREFS_KEY },
  ),
);
