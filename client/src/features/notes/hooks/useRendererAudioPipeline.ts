/**
 * 渲染端音频采集管道 hook（getUserMedia + AudioWorklet 切片）
 *
 * @ai-context: 从 CaptureSidebar 拆出。主进程通过 audio_capture_do_start/stop
 * 指令驱动渲染端建立/销毁音频管道（Electron 中系统音频只能在渲染进程取到）。
 * 两处关键修复保留：①AudioContext 在 IPC 回调（非用户手势）中创建默认
 * suspended，必须显式 resume() 否则音频回调永不触发；②原 ScriptProcessor
 * 的 bufferSize 限制（仅降级路径需要，详见 lib/audioPipeline.ts）。
 *
 * @ai-context: AudioWorklet 迁移说明（2025）
 *   原 ScriptProcessor（已废弃）迁移至 AudioWorklet，音频处理移至独立渲染线程。
 *   管道逻辑已提取到 lib/audioPipeline.ts，本 hook 仅负责生命周期管理。
 *   优先使用 AudioWorklet，不可用时降级到 ScriptProcessor。
 */
import { useRef, useEffect } from 'react';
import { startAudioPipeline } from '@/lib/audioPipeline';

interface AudioStartPayload {
  sourceId: string;
  options: { sampleRate: number; channels: number; chunkDurationMs: number };
}

export function useRendererAudioPipeline() {
  // 渲染端音频资源引用（getUserMedia stream + AudioContext）
  const audioCleanupRef = useRef<(() => void | Promise<void>) | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    const offStart = window.electronAPI.on(
      'audio_capture_do_start',
      (...args: unknown[]) => {
        // 如果渲染端已主动启动了音频管道，忽略重复指令
        if (audioCleanupRef.current) return;

        const payload = args[0] as AudioStartPayload;

        (async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                // Electron 扩展约束：从 desktopCapturer source 捕获系统音频
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: payload.sourceId,
              } as MediaTrackConstraintSet,
            });

            const audioCtx = new AudioContext({ sampleRate: payload.options.sampleRate });
            // 关键修复：AudioContext 在 IPC 回调（非用户手势）中创建时默认 suspended，
            // 音频处理回调永不触发，必须显式 resume()。
            if (audioCtx.state !== 'running') {
              await audioCtx.resume();
            }

            // IPC 转发回调：收到完整音频块后通过 Electron IPC 发送给主进程
            const onChunk = (buffer: ArrayBuffer, durationMs: number) => {
              window.electronAPI?.send('audio_capture_chunk', {
                audioBuffer: buffer,
                sampleRate: payload.options.sampleRate,
                channels: payload.options.channels,
                durationMs,
              });
            };

            // 统一入口：优先 AudioWorklet，模块加载失败自动降级 ScriptProcessor
            audioCleanupRef.current = await startAudioPipeline(
              audioCtx, stream, payload.options, onChunk,
            );
          } catch (err) {
            // eslint-disable-next-line no-console -- 音频管道启动失败
            console.error('[CaptureSidebar] Renderer audio pipeline start failed:', err);
          }
        })();
      },
    );

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

  return { audioCleanupRef };
}
