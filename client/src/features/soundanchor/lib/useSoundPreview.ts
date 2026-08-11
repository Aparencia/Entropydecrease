/**
 * 声音锚点 — 试听 hook
 *
 * @ai-context: 3.11 声音锚点。单 Audio 实例循环播放试听，切换声音时停止
 * 上一个，卸载时清理；同一时间只试听一个声音。
 */
import { useEffect, useRef, useState } from 'react';

export function useSoundPreview() {
  const [playingName, setPlayingName] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 卸载时停止并释放
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  /** 试听/停止指定声音；传 null 仅停止 */
  const toggle = (fileName: string | null, url: string | null) => {
    // 先停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingName(null);
    if (!fileName || !url) return;

    // 同一个声音再次点击 = 停止
    if (playingName === fileName) return;

    try {
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.6;
      audio.play().catch(() => { /* 播放失败静默降级 */ });
      audioRef.current = audio;
      setPlayingName(fileName);
    } catch {
      /* 静默降级 */
    }
  };

  const stop = () => toggle(null, null);

  return { playingName, toggle, stop };
}
