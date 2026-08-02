/**
 * 助手音频控制 Hook
 *
 * @ai-context: 管理提示音效播放 + TTS 生命周期；
 * 监听 store 偏好变化同步 ttsController 音量；
 * TTS 播放状态驱动水母 speaking 动画。
 */
import { useEffect, useCallback } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';
import { ttsController } from '../lib/ttsController';

const SOUND_PATHS = {
  bubble: '/sounds/assistant-bubble.mp3',
  speakStart: '/sounds/assistant-speak-start.mp3',
  ack: '/sounds/assistant-ack.mp3',
} as const;

export type SoundName = keyof typeof SOUND_PATHS;

export function useAssistantAudio() {
  const audioPrefs = useAssistantStore(s => s.preferences.audio);
  const setCreatureState = useAssistantStore(s => s.setCreatureState);

  // 同步音量到 TTS 控制器
  useEffect(() => {
    ttsController.setVolume(audioPrefs.volume);
  }, [audioPrefs.volume]);

  // TTS 状态 → 水母动画联动
  useEffect(() => {
    ttsController.setOnStateChange((speaking) => {
      setCreatureState(speaking ? 'speaking' : 'idle');
    });
    return () => ttsController.setOnStateChange(null);
  }, [setCreatureState]);

  /** 播放短提示音效（受偏好开关控制） */
  const playSound = useCallback((name: SoundName) => {
    if (!audioPrefs.enabled || !audioPrefs.soundEffects) return;
    const audio = new Audio(SOUND_PATHS[name]);
    audio.volume = audioPrefs.volume;
    audio.play().catch(() => { /* 静默——音效播放失败不应阻塞交互 */ });
  }, [audioPrefs.enabled, audioPrefs.soundEffects, audioPrefs.volume]);

  /** TTS 朗读文本（受偏好开关控制） */
  const speak = useCallback((text: string) => {
    if (!audioPrefs.enabled || !audioPrefs.ttsEnabled) return;
    ttsController.speak(text);
  }, [audioPrefs.enabled, audioPrefs.ttsEnabled]);

  /** 停止当前朗读 */
  const stopSpeaking = useCallback(() => {
    ttsController.stop();
  }, []);

  return { playSound, speak, stopSpeaking };
}
