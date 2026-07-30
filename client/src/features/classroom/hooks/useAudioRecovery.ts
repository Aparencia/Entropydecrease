/**
 * 课堂音频自动恢复 hook（静音诊断 / 设备变更重启）
 *
 * @ai-context: 从 useClassroomAudio 拆出的独立恢复层。两条恢复路径：
 * ①输出设备不匹配诊断——系统环回只录默认输出设备，视频声音若输出到其他
 * 设备（HDMI/蓝牙）会表现为"音频块正常但持续静音"，检出后提示用户核对；
 * ②设备变更重启——默认输出设备切换后环回仍绑定旧设备，devicechange 时
 * 自动 stop→start 重新绑定。
 * @ai-context: 仅依赖 refs 的稳定回调，重启经 restartingRef 互斥防并发。
 */
import { useEffect, useRef, useCallback } from 'react';
import type { CaptureMode, SessionStatus } from '@/lib/capture';
import {
  computeChunkRms, SilenceTracker,
  getDefaultOutputDeviceLabel, subscribeDeviceChange,
} from '@/lib/audio/outputDeviceMonitor';

/** 与 useSessionControl 启动参数保持一致的音频采集配置 */
const AUDIO_START_OPTIONS = { chunkDurationMs: 5000, sampleRate: 16000, channels: 1 };
/** 重启前等待渲染端管道清理完成的时间 */
const RESTART_CLEANUP_DELAY_MS = 500;

interface UseAudioRecoveryOptions {
  status: SessionStatus;
  mode: CaptureMode;
  /** 会话选中窗口的源 ID，重启时沿用同一源 */
  audioSourceId?: string | null;
  onNotify: (type: 'warning' | 'error', message: string) => void;
}

export function useAudioRecovery({ status, mode, audioSourceId, onNotify }: UseAudioRecoveryOptions) {
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;
  const effectiveSourceRef = useRef<string | undefined>(audioSourceId ?? undefined);
  const silenceTrackerRef = useRef(new SilenceTracker());
  const restartingRef = useRef(false);

  const audioEnabled = status === 'capturing' && (mode === 'audio' || mode === 'mixed');

  // 会话开始时重置恢复状态（audioSourceId 取会话启动瞬间的快照）
  useEffect(() => {
    if (status !== 'capturing') return;
    effectiveSourceRef.current = audioSourceId ?? undefined;
    silenceTrackerRef.current.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅会话开始时快照 audioSourceId
  }, [status]);

  /** stop→start 重启音频捕获（互斥），成功返回 true */
  const restartCapture = useCallback(async (sourceId?: string): Promise<boolean> => {
    if (!window.electronAPI || restartingRef.current) return false;
    restartingRef.current = true;
    try {
      await window.electronAPI.invoke('audio_capture_stop');
      await new Promise((r) => setTimeout(r, RESTART_CLEANUP_DELAY_MS));
      const result = await window.electronAPI.invoke('audio_capture_start', {
        ...AUDIO_START_OPTIONS, sourceId,
      }) as { success: boolean; error?: string };
      if (result.success) silenceTrackerRef.current.reset();
      else console.warn('[useAudioRecovery] 音频捕获重启失败:', result.error);
      return result.success;
    } catch (err) {
      console.error('[useAudioRecovery] 音频捕获重启异常:', err);
      return false;
    } finally {
      restartingRef.current = false;
    }
  }, []);

  // 静音诊断：音频块正常但持续无声 → 提示核对系统默认输出设备
  useEffect(() => {
    if (!audioEnabled || !window.electronAPI) return;
    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as { audioBuffer: ArrayBuffer };
      if (!silenceTrackerRef.current.push(computeChunkRms(chunk.audioBuffer))) return;
      void getDefaultOutputDeviceLabel().then((label) => {
        notifyRef.current('warning',
          `持续收到静音音频：请确认视频声音正在播放，且输出到系统默认设备${label ? `「${label}」` : ''}（系统音频捕获只能录到默认输出设备的声音）`);
      });
    });
    return off;
  }, [audioEnabled]);

  // 设备变更自动重启：重新绑定新的默认输出设备
  useEffect(() => {
    if (!audioEnabled || !window.electronAPI) return;
    const unsubscribe = subscribeDeviceChange(() => {
      console.info('[useAudioRecovery] 检测到音频设备变更，自动重启音频捕获');
      void restartCapture(effectiveSourceRef.current).then((ok) => {
        if (ok) notifyRef.current('warning', '检测到音频输出设备变更，已自动重新绑定音频捕获');
        else notifyRef.current('error', '音频设备变更后重启捕获失败，请停止后重新开始采集');
      });
    });
    return unsubscribe;
  }, [audioEnabled, restartCapture]);
}
