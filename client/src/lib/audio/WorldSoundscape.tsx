/**
 * WorldSoundscape — 世界声景（宪法 P2 · 声景体系第一步）
 * WorldSoundscape — ambient world audio per theme (opt-in)
 *
 * @ai-context: 双世界的环境底噪：深海=雨声（隔绝感），穹顶=麦浪风声（通透感），
 * 音量克制（0.12）淡入淡出；默认关闭，外观设置可开启（觉察原则：可关闭）。
 * 页面隐藏时暂停，避免后台空放。
 *
 * @ai-context: Theme-bound ambient loop (rain for deep-sea, wind for aurora),
 * low volume with fades, opt-in, paused when the window is hidden.
 */
import { useEffect, useState } from 'react';
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';
import { useAudioPlayer } from '@/lib/audio/useAudioPlayer';
import {
  getWorldSoundscapeEnabled,
  WORLD_SOUNDSCAPE_CHANGE_EVENT,
} from './worldSoundscapeConfig';

/** 主题 → 环境音源映射 */
const THEME_SOUND: Record<'deep-sea' | 'aurora-dome', string> = {
  'deep-sea': '/audio/rain.mp3',
  'aurora-dome': '/audio/wind-wheat.mp3',
};

export function WorldSoundscape() {
  const theme = useSceneTheme();
  const [enabled, setEnabled] = useState(getWorldSoundscapeEnabled);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');

  // 设置页开关变更广播
  useEffect(() => {
    const onChange = (e: Event) => setEnabled((e as CustomEvent<boolean>).detail === true);
    window.addEventListener(WORLD_SOUNDSCAPE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(WORLD_SOUNDSCAPE_CHANGE_EVENT, onChange);
  }, []);

  // 后台静音
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const src = THEME_SOUND[theme];
  const { play, pause, isPlaying } = useAudioPlayer({
    src, volume: 0.12, loop: true, fadeInMs: 1800, fadeOutMs: 1200,
  });

  const shouldPlay = enabled && visible;
  useEffect(() => {
    if (shouldPlay && !isPlaying) play();
    else if (!shouldPlay && isPlaying) pause();
  }, [shouldPlay, isPlaying, play, pause]);

  return null;
}
