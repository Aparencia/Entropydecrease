/**
 * WebCaptureAdapter — PWA/浏览器麦克风采集适配器（课堂助手应急通道）
 *
 * @ai-context: 移动端 PWA 的课堂助手音频源（Spec §3.2 音频源决策 v4 的应急
 * 通道，主力为系统录屏导入）。链路：getUserMedia 麦克风 → MediaRecorder 分段
 * （5s）→ decodeAudioData 解码 → 重采样 16kHz 单声道 → encodeWavBase64 转
 * WAV base64 → 构造 AudioSegment → captureEventBus 广播
 * `smart:audio_segment_ready`，复用 useClassroomEvents 既有云端转写链路
 * （transcribeWithRetry → liveTranscripts）。桌面端（Electron）不走本适配器
 *（走主进程 endpoint loopback）。
 * @ai-context EN: mobile PWA classroom audio source (emergency channel per
 * Spec §3.2 v4; the primary channel is system screen-record import). Pipeline:
 * getUserMedia mic → MediaRecorder 5s slices → decodeAudioData → resample to
 * 16kHz mono → encodeWavBase64 → emit `smart:audio_segment_ready` to reuse the
 * existing cloud-transcription chain. Electron desktop does not use this
 * adapter (it uses the main-process endpoint loopback).
 */
import { captureEventBus } from '@/lib/capture';
import { encodeWavBase64 } from '@/lib/capture/wavEncoder';
import type { AudioSegment } from '@/lib/capture';

/** 分段时长（毫秒）——与 Electron 按段转写的 chunkDurationMs 口径一致 */
const SEGMENT_MS = 5000;
/** 目标采样率（与网关 ASR 端点约定的 sample_rate 一致） */
const TARGET_SAMPLE_RATE = 16000;

export class WebCaptureAdapter {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private segmentStartAt = 0;

  /** 是否正在录制 */
  get active(): boolean {
    return this.recorder?.state === 'recording';
  }

  /**
   * 启动麦克风采集（须在用户手势调用栈中调用，否则 iOS 拒绝 getUserMedia）
   * @param sessionId - 会话 ID（emit 音频段时透传，供下游校验会话一致性）
   */
  async start(sessionId: string): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    this.audioCtx = new AudioContext();
    await this.audioCtx.resume().catch(() => { /* 非手势调用栈下 resume 被拒，静默 */ });
    const mimeType = pickSupportedMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.segmentStartAt = Date.now();
    const sid = sessionId;
    this.recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) void this.handleChunk(ev.data, sid);
    };
    this.recorder.start(SEGMENT_MS);
  }

  /** 停止采集并释放资源（幂等） */
  stop(): void {
    try { this.recorder?.stop(); } catch { /* 已停止 */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close().catch(() => { /* 静默 */ });
    this.recorder = null;
    this.stream = null;
    this.audioCtx = null;
  }

  /** 暂停录制（flush 当前分段后暂停，恢复后继续下一分段） */
  pause(): void {
    try { this.recorder?.pause(); } catch { /* 已停止 */ }
  }

  /** 恢复录制 */
  resume(): void {
    try { this.recorder?.resume(); } catch { /* 已停止 */ }
  }

  /** 解码单个分段 → 重采样 → 编码 → 广播音频段（失败静默，不影响采集）
   * @ai-context: sessionId 由 ondataavailable 闭包捕获传入——stop() 清空
   * 实例字段不影响已在队列中的尾段（修复停止时 <5s 尾段丢失，TD-005）。
   */
  private async handleChunk(blob: Blob, sessionId: string): Promise<void> {
    if (!sessionId || !this.audioCtx) return;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      const pcm = resampleToMono(audioBuffer, TARGET_SAMPLE_RATE);
      if (pcm.length === 0) return;
      const audioBase64 = encodeWavBase64(pcm, TARGET_SAMPLE_RATE, 1);
      const segment: AudioSegment = {
        id: crypto.randomUUID(),
        timestampStart: this.segmentStartAt,
        timestampEnd: Date.now(),
        audioBase64,
        energy: computeRms(pcm),
      };
      this.segmentStartAt = Date.now();
      captureEventBus.emit('smart:audio_segment_ready', { sessionId, segment });
    } catch (err) {
      console.warn('[WebCaptureAdapter] 分段解码失败（已跳过该段）:', err);
    }
  }
}

/** 全局单例（与 captureEventBus 同级的采集通道，供 useSessionControl 直接引用） */
export const webCaptureAdapter = new WebCaptureAdapter();

/** 选择当前浏览器支持的录音容器（iOS 偏好 mp4/aac，Android 偏好 webm/opus） */
function pickSupportedMimeType(): string {
  for (const type of ['audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/**
 * 重采样到目标采样率 + 混为单声道（线性插值，多声道取平均）
 * @ai-context: decodeAudioData 输出采样率/声道数随浏览器而异（常见 44.1k/48k、
 * 1-2 声道），而网关 ASR 约定 16kHz 单声道，故统一重采样混单。
 */
export function resampleToMono(buffer: AudioBuffer, targetRate: number): Float32Array {
  const srcRate = buffer.sampleRate;
  const channels = Math.min(buffer.numberOfChannels, 2);
  const srcLen = buffer.length;
  if (srcLen === 0) return new Float32Array(0);
  const ratio = srcRate / targetRate;
  const outLen = Math.max(0, Math.floor(srcLen / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, srcLen - 1);
    const frac = srcIndex - i0;
    let sample = 0;
    for (let c = 0; c < channels; c++) {
      const ch = buffer.getChannelData(c);
      sample += ch[i0] * (1 - frac) + ch[i1] * frac;
    }
    out[i] = sample / channels;
  }
  return out;
}

/** 计算 PCM 均方根能量（0-1 量级，供 AudioSegment.energy 字段） */
export function computeRms(pcm: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return pcm.length > 0 ? Math.sqrt(sum / pcm.length) : 0;
}
