/**
 * 番茄钟全局音频层
 *
 * @ai-context: 白噪音 / BGM 播放器从 PomodoroPage 提升到全局（App 级挂载）——
 * 历史缺陷：播放器随页面卸载，用户切到其他模块时计时继续（全局调度器驱动）
 * 但背景音骤停。本层订阅 pomodoro store + 音频偏好 store，任何页面下播放
 * 状态与计时/阶段保持一致；页面层只读写偏好，不再持有播放器。
 *
 * @ai-context: Global audio layer — white noise / BGM players now outlive the
 * pomodoro page so audio keeps playing after navigation. Pages only touch prefs.
 */
import { useEffect, useMemo } from 'react';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useAudioPrefsStore } from '@/lib/audio/audioPrefsStore';
import { useAudioPlayer } from '@/lib/audio/useAudioPlayer';
import { audioTracks, getTracksForPhase } from '@/lib/audio/audioConfig';

const FADE_IN_MS = 1000;
const FADE_OUT_MS = 1500;

export function PomodoroAudioLayer() {
  const audioPrefs = useAudioPrefsStore();
  // 独立 selector：内联对象 selector 返回不稳定 snapshot，
  // 触发 useSyncExternalStore "getSnapshot should be cached" 无限循环（App 整树崩溃）
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const phase = usePomodoroStore((s) => s.phase);
  const autoSwitchAudioPhase = usePomodoroStore((s) => s.settings.autoSwitchAudioPhase ?? false);

  const whiteNoiseTrack = useMemo(
    () => audioTracks.find((t) => t.id === audioPrefs.whiteNoiseTrackId) ?? audioTracks[0],
    [audioPrefs.whiteNoiseTrackId],
  );
  const whiteNoisePlayer = useAudioPlayer({
    src: whiteNoiseTrack.src, volume: audioPrefs.whiteNoiseVolume,
    loop: true, fadeInMs: FADE_IN_MS, fadeOutMs: FADE_OUT_MS,
  });

  const bgmTrack = useMemo(
    () => audioTracks.find((t) => t.id === audioPrefs.bgmTrackId) ?? audioTracks[audioTracks.length - 1],
    [audioPrefs.bgmTrackId],
  );
  const bgmPlayer = useAudioPlayer({
    src: bgmTrack.src, volume: audioPrefs.bgmVolume,
    loop: true, fadeInMs: FADE_IN_MS, fadeOutMs: FADE_OUT_MS,
  });

  // 白噪音：仅工作阶段播放（与计时状态解耦于页面生命周期）
  useEffect(() => {
    if (isRunning && phase === 'work' && audioPrefs.whiteNoiseEnabled) {
      whiteNoisePlayer.play();
    } else {
      whiteNoisePlayer.pause();
    }
  }, [isRunning, phase, audioPrefs.whiteNoiseEnabled]); // eslint-disable-line

  // BGM：仅工作阶段播放
  useEffect(() => {
    if (isRunning && phase === 'work' && audioPrefs.bgmEnabled) {
      bgmPlayer.play();
    } else {
      bgmPlayer.pause();
    }
  }, [isRunning, phase, audioPrefs.bgmEnabled]); // eslint-disable-line

  // 音量变化实时同步（滑杆在页面层，播放器在本层）
  useEffect(() => {
    whiteNoisePlayer.setVolume(audioPrefs.whiteNoiseVolume);
  }, [audioPrefs.whiteNoiseVolume, whiteNoisePlayer]);

  useEffect(() => {
    bgmPlayer.setVolume(audioPrefs.bgmVolume);
  }, [audioPrefs.bgmVolume, bgmPlayer]);

  // 阶段音轨自动切换（体验增强开关，默认关闭）：休息/专注自动换音轨
  useEffect(() => {
    if (!autoSwitchAudioPhase || !audioPrefs.whiteNoiseEnabled) return;
    const wantPhase = phase === 'work' ? 'focus' : 'break';
    if (whiteNoiseTrack.phase !== 'both' && whiteNoiseTrack.phase !== wantPhase) {
      const candidates = getTracksForPhase(wantPhase).filter((t) => t.category === 'white_noise');
      if (candidates.length > 0 && candidates[0].id !== whiteNoiseTrack.id) {
        useAudioPrefsStore.getState().setWhiteNoiseTrack(candidates[0].id);
      }
    }
    // 仅阶段切换时评估，避免音轨/偏好变化引起循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return null;
}
