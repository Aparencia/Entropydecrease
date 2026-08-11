/**
 * @ai-context: 白噪音/BGM 独立音频系统 Hook（与音效 SoundPlayer 分离），管理播放循环与音量。
 */
import { useRef, useState, useCallback, useEffect } from 'react';

interface AudioPlayerOptions {
  src: string;
  volume: number;       // 0-1
  loop: boolean;
  fadeInMs?: number;    // 淡入时长（毫秒）
  fadeOutMs?: number;   // 淡出时长（毫秒）
}

export function useAudioPlayer(options: AudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 初始化 Audio 元素
  useEffect(() => {
    const audio = new Audio(options.src);
    audio.loop = options.loop;
    audio.volume = 0; // 初始音量为0，用于淡入
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, [options.src, options.loop]);

  const clearFade = () => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  };

  const fadeIn = useCallback((targetVolume: number, durationMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearFade();
    audio.volume = 0;
    const steps = 20;
    const stepTime = durationMs / steps;
    const stepVolume = targetVolume / steps;
    let current = 0;
    fadeIntervalRef.current = setInterval(() => {
      current += stepVolume;
      if (current >= targetVolume) {
        audio.volume = targetVolume;
        clearFade();
      } else {
        audio.volume = current;
      }
    }, stepTime);
  }, []);

  const fadeOut = useCallback((durationMs: number, onComplete?: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearFade();
    const steps = 20;
    const stepTime = durationMs / steps;
    const stepVolume = audio.volume / steps;
    fadeIntervalRef.current = setInterval(() => {
      const next = audio.volume - stepVolume;
      if (next <= 0) {
        audio.volume = 0;
        clearFade();
        audio.pause();
        onComplete?.();
      } else {
        audio.volume = next;
      }
    }, stepTime);
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // FRONT2-M6: 无条件清理进行中的 fadeOut interval——原实现仅 fadeInMs
    // 分支会 clearFade，无淡入配置时淡出中途重新 play，interval 继续运行
    //（音量递减到 0 并 pause），新播放被无声打断
    clearFade();
    audio.play().then(() => {
      setIsPlaying(true);
      if (options.fadeInMs && options.fadeInMs > 0) {
        fadeIn(options.volume, options.fadeInMs);
      } else {
        audio.volume = options.volume;
      }
    }).catch(() => {});
  }, [options.volume, options.fadeInMs, fadeIn]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;
    if (options.fadeOutMs && options.fadeOutMs > 0) {
      fadeOut(options.fadeOutMs, () => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [isPlaying, options.fadeOutMs, fadeOut]);

  const setVolume = useCallback((vol: number) => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, vol));
  }, []);

  return { play, pause, setVolume, isPlaying };
}
