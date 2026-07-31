/**
 * 课堂音频自动恢复 hook（静音诊断 / 设备变更重启）
 *
 * @ai-context: 从 useClassroomAudio 拆出的独立恢复层。两条恢复路径：
 * ①静音诊断——音频块正常但持续静音，成因随音频源不同（见下）；
 * ②设备变更重启——仅端点环回需要（它绑定系统默认输出设备），进程环回
 * 与输出设备无关，切设备时不必重启。
 * @ai-context: 诊断文案必须按 sourceKind 分支（ADR-001）——对进程环回说
 * "请检查默认输出设备"是误导，它根本不受输出设备与系统音量影响，此时
 * 真实成因是目标窗口没在发声或声音来自别的应用。
 * @ai-context: 仅依赖 refs 的稳定回调，重启经 restartingRef 互斥防并发。
 */
import { useEffect, useRef, useCallback } from 'react';
import type { CaptureMode, SessionStatus } from '@/lib/capture';
import type { AudioSourceKind } from '@/lib/capture/audioSourceStrategy';
import { getAudioSourcePreference } from '@/lib/capture/audioSourcePreference';
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
  /** 本次会话实际生效的音频源（由 audio_capture_start 回传） */
  sourceKind?: AudioSourceKind | null;
  onNotify: (type: 'warning' | 'error', message: string) => void;
}

export function useAudioRecovery({
  status, mode, audioSourceId, sourceKind, onNotify,
}: UseAudioRecoveryOptions) {
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;
  const effectiveSourceRef = useRef<string | undefined>(audioSourceId ?? undefined);
  const silenceTrackerRef = useRef(new SilenceTracker());
  const restartingRef = useRef(false);
  // 生效源用 ref 桥接：静音诊断的监听器依赖数组不含它，避免重订阅丢失计数
  const sourceKindRef = useRef<AudioSourceKind | null>(sourceKind ?? null);
  sourceKindRef.current = sourceKind ?? null;

  const audioEnabled = status === 'capturing' && (mode === 'audio' || mode === 'mixed');
  const isProcessSource = sourceKind === 'process_loopback';

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
        ...AUDIO_START_OPTIONS, sourceId, preference: getAudioSourcePreference(),
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

  // 静音诊断：音频块正常但持续无声 → 按生效源给出对应成因
  useEffect(() => {
    if (!audioEnabled || !window.electronAPI) return;
    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as { audioBuffer: ArrayBuffer };
      if (!silenceTrackerRef.current.push(computeChunkRms(chunk.audioBuffer))) return;

      if (sourceKindRef.current === 'process_loopback') {
        // 进程环回不受系统音量/输出设备影响，成因只能是目标窗口没在发声
        notifyRef.current('warning',
          '持续收到静音音频：当前只采集目标窗口的声音，请确认该窗口正在播放，' +
          '或在设置中改为采集「系统全部声音」');
        return;
      }
      void getDefaultOutputDeviceLabel().then((label) => {
        notifyRef.current('warning',
          `持续收到静音音频：请确认视频声音正在播放，且输出到系统默认设备${label ? `「${label}」` : ''}（系统音频捕获只能录到默认输出设备的声音）`);
      });
    });
    return off;
  }, [audioEnabled]);

  // 设备变更自动重启：仅端点环回需要（它绑定系统默认输出设备）
  useEffect(() => {
    if (!audioEnabled || !window.electronAPI || isProcessSource) return;
    const unsubscribe = subscribeDeviceChange(() => {
      console.info('[useAudioRecovery] 检测到音频设备变更，自动重启音频捕获');
      void restartCapture(effectiveSourceRef.current).then((ok) => {
        if (ok) notifyRef.current('warning', '检测到音频输出设备变更，已自动重新绑定音频捕获');
        else notifyRef.current('error', '音频设备变更后重启捕获失败，请停止后重新开始采集');
      });
    });
    return unsubscribe;
  }, [audioEnabled, isProcessSource, restartCapture]);
}
