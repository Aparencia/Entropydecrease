/**
 * 麦克风流式采集：getUserMedia → AudioWorklet → 16kHz 单声道 float 回调
 *
 * @ai-context: 录屏/录音期间的实时字幕输入源。WebView 内 AudioWorklet 将
 * 原始音频帧转发主线程，主线程按比例抽取降采样到 16kHz 单声道后按 ~1s
 * 批次回调（与本地 ASR 的 asrFeedPcm 对齐）。需 RECORD_AUDIO 权限
 * （AndroidManifest 已声明，getUserMedia 触发授权弹窗）。
 * @ai-context EN: mic streaming capture for realtime subtitles — Web Audio
 * AudioWorklet → 16kHz mono float batches → asrFeedPcm.
 */

export interface MicStreamHandle {
  stop: () => void;
}

const TARGET_RATE = 16000;
const BATCH_SECONDS = 1;

const WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length > 0) {
      this.port.postMessage(ch.slice(0));
    }
    return true;
  }
}
registerProcessor('entropy-pcm', PcmProcessor);
`;

/**
 * 启动麦克风流式采集，按 ~1s 批次回调 16kHz 单声道 float 采样
 * @param onBatch 每批采样回调（Float32Array）
 */
export async function startMicStream(
  onBatch: (samples: Float32Array) => void,
): Promise<MicStreamHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);

  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const worklet = new AudioWorkletNode(ctx, 'entropy-pcm');
  const ratio = ctx.sampleRate / TARGET_RATE;
  let buffer: number[] = [];
  let acc = 0; // 跨批次累计的抽取余量，保证连续性

  worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const chunk = e.data;
    for (let i = 0; i < chunk.length; i++) {
      acc += 1;
      if (acc >= ratio) {
        buffer.push(chunk[i]);
        acc -= ratio;
      }
    }
    if (buffer.length >= TARGET_RATE * BATCH_SECONDS) {
      onBatch(new Float32Array(buffer.splice(0, TARGET_RATE * BATCH_SECONDS)));
    }
  };

  source.connect(worklet);
  worklet.connect(ctx.destination); // 静音输出，保持音频图活跃
  await ctx.resume();

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      worklet.port.onmessage = null;
      worklet.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
