/**
 * 课堂音频管道与健康监控 hook
 *
 * @ai-context: 从 useClassroomCapture 拆出。渲染端音频管道由主进程
 * audio_capture_do_start/stop 指令驱动（Electron 中系统音频只能在渲染进程取到）。
 * 两处关键修复保留：①AudioContext 在 IPC 回调（非用户手势调用栈）中创建时受
 * Chrome autoplay policy 影响默认 suspended，onaudioprocess 永不触发，必须显式
 * resume()；②createScriptProcessor 的 bufferSize 必须是 [256,16384] 内 2 的幂，
 * 直接传 5s 样本数（80000）会抛 IndexSizeError 中断整条管道，故用 4096 小缓冲
 * 累积到 chunkDurationMs 再整块发送，保证 VAD/ASR 拿到完整音频段。
 * @ai-context: 健康 watchdog 区分两种故障——"开始后 15s 从未收到音频块"
 * （管道未启动）与"曾正常但中断 >10s"（设备变更/被抢占），各自独立提示。
 */
import { useState, useEffect, useRef } from 'react';
import type { AudioChunkData, CaptureMode, SessionStatus, CaptureManager } from '@/lib/capture';

/** ScriptProcessor 合法缓冲大小（2 的幂，位于 [256,16384]） */
const PROCESSOR_BUFFER_SIZE = 4096;
/** 开始采集后多久仍无音频块则判定管道未启动 */
const NEVER_RECEIVED_TIMEOUT_MS = 15000;
/** 音频中断多久判定为异常 */
const CHUNK_GAP_TIMEOUT_MS = 10000;

interface AudioStartPayload {
  sourceId: string;
  options: { sampleRate: number; channels: number; chunkDurationMs: number };
}

export interface AudioHealth {
  lastChunkTime: number;
  chunkCount: number;
  isHealthy: boolean;
}

interface UseClassroomAudioOptions {
  captureManager: CaptureManager;
  status: SessionStatus;
  mode: CaptureMode;
  onNotify: (type: 'warning' | 'error', message: string) => void;
}

export function useClassroomAudio({ captureManager, status, mode, onNotify }: UseClassroomAudioOptions) {
  const [audioHealth, setAudioHealth] = useState<AudioHealth>({
    lastChunkTime: 0, chunkCount: 0, isHealthy: true,
  });
  const healthRef = useRef({ lastChunkTime: 0, chunkCount: 0 });
  const audioCleanupRef = useRef<(() => void | Promise<void>) | null>(null);

  // onNotify 的稳定引用：音频生命周期 effect 依赖数组为 []，
  // 直接闭包会随渲染变化而过期，故用 ref 桥接。
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;

  // 监听音频块（带健康跟踪）
  useEffect(() => {
    if (!window.electronAPI || status !== 'capturing') return;
    const off = window.electronAPI.on('audio_capture_chunk', (...args: unknown[]) => {
      const chunk = args[0] as AudioChunkData;
      captureManager.pushAudioChunk(chunk);
      // 更新音频健康状态：收到音频块即视为健康
      healthRef.current = {
        lastChunkTime: Date.now(),
        chunkCount: healthRef.current.chunkCount + 1,
      };
      setAudioHealth({
        lastChunkTime: healthRef.current.lastChunkTime,
        chunkCount: healthRef.current.chunkCount,
        isHealthy: true,
      });
    });
    return off;
  }, [status, captureManager]);

  // 健康 watchdog：检测"从未收到音频块"与"音频中断"两种故障
  useEffect(() => {
    if (status !== 'capturing') {
      setAudioHealth({ lastChunkTime: 0, chunkCount: 0, isHealthy: true });
      healthRef.current = { lastChunkTime: 0, chunkCount: 0 };
      return;
    }
    const audioEnabled = mode === 'audio' || mode === 'mixed';
    if (!audioEnabled) return;

    const capturingStartedAt = Date.now();
    let warnedNever = false;
    let warnedStopped = false;
    const timer = setInterval(() => {
      const { lastChunkTime } = healthRef.current;
      if (lastChunkTime === 0) {
        // 场景一：开始采集后从未收到任何音频块（音频管道未启动/被挂起）
        if (Date.now() - capturingStartedAt > NEVER_RECEIVED_TIMEOUT_MS) {
          setAudioHealth((prev) => (prev.isHealthy ? { ...prev, isHealthy: false } : prev));
          if (!warnedNever) {
            warnedNever = true;
            onNotify('error', '未检测到音频输入，音频采集可能未启动，请停止后重新开始采集');
          }
        }
      } else if (Date.now() - lastChunkTime > CHUNK_GAP_TIMEOUT_MS) {
        // 场景二：音频曾正常但中断超过 10s
        setAudioHealth((prev) => ({ ...prev, isHealthy: false }));
        if (!warnedStopped) {
          warnedStopped = true;
          onNotify('warning', '音频输入中断超过 10s，请检查系统音频设置');
        }
      } else {
        // 恢复正常
        setAudioHealth((prev) => (prev.isHealthy ? prev : { ...prev, isHealthy: true }));
        warnedNever = false;
        warnedStopped = false;
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [status, mode, onNotify]);

  // 监听音频采集生命周期指令
  useEffect(() => {
    if (!window.electronAPI) return;

    const offStart = window.electronAPI.on('audio_capture_do_start', (...args: unknown[]) => {
      if (audioCleanupRef.current) return;
      const payload = args[0] as AudioStartPayload;
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: payload.sourceId,
            } as MediaTrackConstraintSet,
          });
          const audioCtx = new AudioContext({ sampleRate: payload.options.sampleRate });
          // 关键修复：非用户手势调用栈中创建的 AudioContext 默认 suspended，
          // 必须显式 resume()，否则 onaudioprocess 永不触发（0 音频块）。
          if (audioCtx.state !== 'running') {
            await audioCtx.resume();
          }
          console.info(`[useClassroomCapture] 音频管道已启动, AudioContext state=${audioCtx.state}, sampleRate=${audioCtx.sampleRate}`);
          const sourceNode = audioCtx.createMediaStreamSource(stream);
          // 根因修复：bufferSize 必须是 [256,16384] 内 2 的幂，用小缓冲切片后累积整块发送。
          const processor = audioCtx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, payload.options.channels, 1);
          const targetSamples = Math.ceil((payload.options.sampleRate * payload.options.chunkDurationMs) / 1000);
          let pending = new Float32Array(targetSamples);
          let pendingOffset = 0;
          let sentChunks = 0;
          // TODO: ScriptProcessor 已被 Web Audio API 标记为废弃，
          // 后续应迁移至 AudioWorklet（需单独 worklet 文件经 audioWorklet.addModule 加载）。
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            let srcOffset = 0;
            // 将本次回调的样本填入 pending，满 targetSamples 即发送一个完整块
            while (srcOffset < inputData.length) {
              const take = Math.min(targetSamples - pendingOffset, inputData.length - srcOffset);
              pending.set(inputData.subarray(srcOffset, srcOffset + take), pendingOffset);
              pendingOffset += take;
              srcOffset += take;
              if (pendingOffset >= targetSamples) {
                sentChunks++;
                if (sentChunks === 1) {
                  console.info(`[useClassroomCapture] 首个完整音频块已发送 (${targetSamples} 样本 / ${payload.options.chunkDurationMs}ms)，采集管道正常`);
                }
                window.electronAPI?.send('audio_capture_chunk', {
                  audioBuffer: pending.buffer,
                  sampleRate: payload.options.sampleRate,
                  channels: payload.options.channels,
                  durationMs: payload.options.chunkDurationMs,
                });
                pending = new Float32Array(targetSamples);
                pendingOffset = 0;
              }
            }
          };
          sourceNode.connect(processor);
          processor.connect(audioCtx.destination);
          audioCleanupRef.current = async () => {
            processor.onaudioprocess = null;
            processor.disconnect();
            sourceNode.disconnect();
            stream.getTracks().forEach((t) => t.stop());
            await audioCtx.close();
          };
        } catch (err) {
          console.error('[useClassroomCapture] Audio pipeline start failed:', err);
          notifyRef.current('error', '音频采集启动失败，无法获取系统音频，请检查音频输出设备');
        }
      })();
    });

    const offStop = window.electronAPI.on('audio_capture_do_stop', () => {
      void audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    });

    return () => {
      offStart();
      offStop();
      void audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    };
  }, []);

  return { audioHealth, audioCleanupRef };
}
