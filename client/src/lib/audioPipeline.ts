/**
 * 音频切片管道工具函数（AudioWorklet + ScriptProcessor 降级）
 *
 * @ai-context: 从 useClassroomAudio.ts 和 useRendererAudioPipeline.ts 提取的公共逻辑。
 * ScriptProcessor 已被 Web Audio API 规范标记为 deprecated，未来 Chromium 可能移除。
 * 本模块封装两种实现路径，供各 hook 按需调用：
 *   - startAudioWorkletPipeline: 推荐路径，音频处理在独立渲染线程执行
 *   - startScriptProcessorPipeline: 降级路径，AudioWorklet 不可用时回退
 *
 * AudioWorklet 架构说明：
 *   1. 主线程通过 audioContext.audioWorklet.addModule() 加载 worklet 文件
 *   2. 创建 AudioWorkletNode 连接音频源，替代 ScriptProcessorNode
 *   3. worklet 以 128 样本/render quantum 调用 process()，累积到 targetSamples 后
 *      通过 MessagePort 发送完整块给主线程
 *   4. 主线程通过 port.onmessage 接收数据，负责 IPC 转发
 */

/**
 * AudioWorklet processor 文件路径（位于 public/ 目录，Vite 开发和生产构建
 * 均会将其复制到根路径，故使用相对路径 ./audio-chunk-processor.js）
 */
const WORKLET_URL = './audio-chunk-processor.js';

/** ScriptProcessor 降级时的合法缓冲大小（2 的幂，位于 [256,16384]） */
const FALLBACK_BUFFER_SIZE = 4096;

/** 音频管道选项 */
export interface AudioPipelineOptions {
  sampleRate: number;
  channels: number;
  chunkDurationMs: number;
}

/** 音频块回调参数 */
export type AudioChunkCallback = (buffer: ArrayBuffer, durationMs: number) => void;

/**
 * 检测当前环境是否支持 AudioWorklet API
 * AudioWorklet 需要 AudioContext.prototype.audioWorklet 存在
 */
export function isAudioWorkletSupported(): boolean {
  return typeof AudioContext !== 'undefined' &&
    'audioWorklet' in AudioContext.prototype;
}

/**
 * 通过 AudioWorklet 建立音频切片管道（推荐路径）
 *
 * 架构：MediaStreamSource → AudioWorkletNode → destination
 * worklet 在渲染线程累积样本，满 targetSamples 后通过 MessagePort 发回主线程。
 *
 * @returns 清理函数，调用后断开所有连接并释放资源
 */
export async function startAudioWorkletPipeline(
  audioCtx: AudioContext,
  stream: MediaStream,
  options: AudioPipelineOptions,
  onChunk: AudioChunkCallback,
): Promise<() => Promise<void>> {
  // 加载 worklet processor 文件到 AudioWorkletGlobalScope
  await audioCtx.audioWorklet.addModule(WORKLET_URL);

  const sourceNode = audioCtx.createMediaStreamSource(stream);
  // 创建 AudioWorkletNode，引用 worklet 中 registerProcessor 注册的名称
  const workletNode = new AudioWorkletNode(audioCtx, 'audio-chunk-processor', {
    // numberOfOutputs=0 表示纯消费者，不产生音频输出到 destination
    numberOfOutputs: 0,
  });

  // 计算每个完整音频块的目标样本数
  const targetSamples = Math.ceil((options.sampleRate * options.chunkDurationMs) / 1000);
  let sentChunks = 0;

  // 通过 MessagePort 接收 worklet 发来的完整音频块
  workletNode.port.onmessage = (event: MessageEvent) => {
    const msg = event.data;
    if (msg.type === 'audioChunk') {
      sentChunks++;
      if (sentChunks === 1) {
        console.info(
          `[audioPipeline] 首个完整音频块已发送 (${targetSamples} 样本 / ${options.chunkDurationMs}ms)，采集管道正常`,
        );
      }
      onChunk(msg.audioBuffer, msg.durationMs);
    }
  };

  // 向 worklet 发送初始化配置（必须在 node 创建之后发送）
  workletNode.port.postMessage({
    type: 'init',
    targetSamples,
    sampleRate: options.sampleRate,
    channels: options.channels,
    chunkDurationMs: options.chunkDurationMs,
  });

  // 连接音频图：源 → worklet → destination
  // destination 连接在某些 Chromium 版本中是 AudioWorkletNode 保持活跃的必要条件
  sourceNode.connect(workletNode);
  workletNode.connect(audioCtx.destination);

  return async () => {
    workletNode.port.onmessage = null;
    workletNode.disconnect();
    sourceNode.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    await audioCtx.close();
  };
}

/**
 * 通过 ScriptProcessor 建立音频切片管道（降级路径）
 *
 * 当 AudioWorklet API 不可用时回退到此实现。
 * ScriptProcessor 在主线程运行 onaudioprocess，用小缓冲（4096 样本）切片，
 * 累积到 chunkDurationMs 对应样本数后整块发送。
 *
 * @returns 清理函数，调用后断开所有连接并释放资源
 */
export function startScriptProcessorPipeline(
  audioCtx: AudioContext,
  stream: MediaStream,
  options: AudioPipelineOptions,
  onChunk: AudioChunkCallback,
): () => Promise<void> {
  console.warn(
    '[audioPipeline] AudioWorklet 不可用，降级到 ScriptProcessor（已废弃，请升级浏览器）',
  );

  const sourceNode = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(FALLBACK_BUFFER_SIZE, options.channels, 1);
  const targetSamples = Math.ceil((options.sampleRate * options.chunkDurationMs) / 1000);
  let pending = new Float32Array(targetSamples);
  let pendingOffset = 0;
  let sentChunks = 0;

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    let srcOffset = 0;
    while (srcOffset < inputData.length) {
      const take = Math.min(targetSamples - pendingOffset, inputData.length - srcOffset);
      pending.set(inputData.subarray(srcOffset, srcOffset + take), pendingOffset);
      pendingOffset += take;
      srcOffset += take;
      if (pendingOffset >= targetSamples) {
        sentChunks++;
        if (sentChunks === 1) {
          console.info(
            `[audioPipeline] 首个完整音频块已发送 (${targetSamples} 样本 / ${options.chunkDurationMs}ms)，采集管道正常`,
          );
        }
        onChunk(pending.buffer, options.chunkDurationMs);
        pending = new Float32Array(targetSamples);
        pendingOffset = 0;
      }
    }
  };

  sourceNode.connect(processor);
  processor.connect(audioCtx.destination);

  return async () => {
    processor.onaudioprocess = null;
    processor.disconnect();
    sourceNode.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    await audioCtx.close();
  };
}
