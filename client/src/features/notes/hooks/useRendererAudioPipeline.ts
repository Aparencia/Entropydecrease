/**
 * 渲染端音频采集管道 hook（getUserMedia + Web Audio 切片）
 *
 * @ai-context: 从 CaptureSidebar 拆出。主进程通过 audio_capture_do_start/stop
 * 指令驱动渲染端建立/销毁音频管道（Electron 中系统音频只能在渲染进程取到）。
 * 两处关键修复保留：①AudioContext 在 IPC 回调（非用户手势）中创建默认
 * suspended，必须显式 resume() 否则 onaudioprocess 永不触发；②
 * createScriptProcessor 的 bufferSize 必须是 [256,16384] 内 2 的幂，
 * 故用 4096 小缓冲切片累积到 chunkDurationMs 再整块回传。
 */
import { useRef, useEffect } from 'react';

interface AudioStartPayload {
  sourceId: string;
  options: { sampleRate: number; channels: number; chunkDurationMs: number };
}

/** ScriptProcessor 合法缓冲大小（2 的幂，位于 [256,16384]） */
const PROCESSOR_BUFFER_SIZE = 4096;

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
            // ScriptProcessor.onaudioprocess 永不触发，必须显式 resume()。
            if (audioCtx.state !== 'running') {
              await audioCtx.resume();
            }
            const sourceNode = audioCtx.createMediaStreamSource(stream);
            // 根因修复：createScriptProcessor 的 bufferSize 必须是 [256, 16384] 内 2 的幂，
            // 直接传 chunkDurationMs 对应样本数（80000）会抛 IndexSizeError 中断管道。
            // 用合法小缓冲切片，累积到 chunkDurationMs 再整块发送。
            const processor = audioCtx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, payload.options.channels, 1);
            const targetSamples = Math.ceil(
              (payload.options.sampleRate * payload.options.chunkDurationMs) / 1000,
            );
            let pending = new Float32Array(targetSamples);
            let pendingOffset = 0;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let srcOffset = 0;
              while (srcOffset < inputData.length) {
                const take = Math.min(targetSamples - pendingOffset, inputData.length - srcOffset);
                pending.set(inputData.subarray(srcOffset, srcOffset + take), pendingOffset);
                pendingOffset += take;
                srcOffset += take;
                if (pendingOffset >= targetSamples) {
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
