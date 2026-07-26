/**
 * VAD 音频标记器 — Path B 语音段检测与分段
 *
 * @ai-context
 * Path B 通过 RMS 能量检测将连续语音切段，
 * 每段完成后立即触发 onSegmentReady 回调，支持流式 ASR 转写。
 */

import type { AudioChunkData, AudioSegment, TimelineEntry } from './captureTypes';

// ================================================================
// 配置类型
// ================================================================

export interface VADMarkerConfig {
  /** RMS 能量阈值，超过视为有语音，默认 0.02 */
  energyThreshold: number;
  /** 静音持续超过此时长视为语音段结束（ms），默认 1500 */
  silenceDurationMs: number;
  /** 最短语音时长（ms），低于则丢弃，默认 500 */
  minSpeechDurationMs: number;
}

const DEFAULT_VAD_MARKER_CONFIG: VADMarkerConfig = {
  energyThreshold: 0.02,
  silenceDurationMs: 1500,
  minSpeechDurationMs: 500,
};

// ================================================================
// VADMarker
// ================================================================

export class VADMarker {
  private readonly config: VADMarkerConfig;
  private segments: AudioSegment[] = [];
  private timeline: TimelineEntry[] = [];

  /** 语音段完成回调（流式 ASR 触发点） */
  onSegmentReady: ((segment: AudioSegment) => void) | null = null;

  // 当前语音段状态
  private isSpeaking = false;
  private speechStartTime = 0;
  private lastVoiceTime = 0;
  /** 累积当前语音段的 Float32 PCM 样本 */
  private speechBuffer: Float32Array[] = [];
  /** 当前语音段平均能量累加器 */
  private energyAccumulator = 0;
  private energySampleCount = 0;

  // 最近一次音频块的格式参数（用于 WAV 编码）
  private lastSampleRate = 16_000;
  private lastChannels = 1;

  constructor(config?: Partial<VADMarkerConfig>) {
    this.config = { ...DEFAULT_VAD_MARKER_CONFIG, ...config };
  }

  /**
   * 处理一个音频块，检测语音活动并分段
   */
  processChunk(audioData: AudioChunkData): void {
    const samples = new Float32Array(audioData.audioBuffer);
    if (samples.length === 0) return;

    // 缓存格式参数供 WAV 编码使用
    this.lastSampleRate = audioData.sampleRate;
    this.lastChannels = audioData.channels;

    // RMS 能量计算
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rmsEnergy = Math.sqrt(sumSquares / samples.length);

    const now = Date.now();
    const hasVoice = rmsEnergy >= this.config.energyThreshold;

    if (hasVoice) {
      if (!this.isSpeaking) {
        // 语音段开始
        this.isSpeaking = true;
        this.speechStartTime = now;
        this.speechBuffer = [];
        this.energyAccumulator = 0;
        this.energySampleCount = 0;
        this.timeline.push({ timestamp: now, type: 'voice_start' });
      }
      this.lastVoiceTime = now;
      this.speechBuffer.push(new Float32Array(samples));
      this.energyAccumulator += rmsEnergy;
      this.energySampleCount++;
    } else if (this.isSpeaking) {
      // 静音中，判断是否超过静音阈值
      const silenceElapsed = now - this.lastVoiceTime;
      // 静音期间仍然暂存样本，保证过渡段音频连续性
      this.speechBuffer.push(new Float32Array(samples));

      if (silenceElapsed >= this.config.silenceDurationMs) {
        this.finalizeSpeechSegment(now);
      }
    }

    // 时间轴：每块都记录能量值
    this.timeline.push({ timestamp: now, type: 'silence', energy: rmsEnergy });
  }

  /** 返回所有已完成的语音段（只读副本） */
  getSegments(): AudioSegment[] {
    return [...this.segments];
  }

  /** 返回时间轴（只读副本） */
  getTimeline(): TimelineEntry[] {
    return [...this.timeline];
  }

  /** 清空所有状态 */
  reset(): void {
    this.segments = [];
    this.timeline = [];
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastVoiceTime = 0;
    this.speechBuffer = [];
    this.energyAccumulator = 0;
    this.energySampleCount = 0;
  }

  // ================================================================
  // 私有方法
  // ================================================================

  /**
   * 语音段结束：校验最小时长，合并 PCM，编码 WAV，存入 segments
   */
  private finalizeSpeechSegment(endTime: number): void {
    this.isSpeaking = false;
    const duration = endTime - this.speechStartTime;

    this.timeline.push({ timestamp: endTime, type: 'voice_end' });

    if (duration < this.config.minSpeechDurationMs) {
      // 过短的语音段丢弃
      this.speechBuffer = [];
      return;
    }

    // 合并所有暂存的 Float32 PCM 片段
    const totalSamples = this.speechBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const mergedPcm = new Float32Array(totalSamples);
    let offset = 0;
    for (const buf of this.speechBuffer) {
      mergedPcm.set(buf, offset);
      offset += buf.length;
    }
    this.speechBuffer = [];

    const avgEnergy = this.energySampleCount > 0
      ? this.energyAccumulator / this.energySampleCount
      : 0;

    const audioBase64 = encodeWavBase64(
      mergedPcm,
      this.lastSampleRate,
      this.lastChannels,
    );

    this.segments.push({
      id: crypto.randomUUID(),
      timestampStart: this.speechStartTime,
      timestampEnd: endTime,
      audioBase64,
      energy: Math.round(avgEnergy * 10000) / 10000,
    });

    // 流式触发：语音段完成后立即通知外部进行 ASR 转写
    const newSegment = this.segments[this.segments.length - 1];
    if (this.onSegmentReady) {
      this.onSegmentReady(newSegment);
    }
  }
}

// ================================================================
// WAV 编码工具
// ================================================================

/**
 * 将 Float32 PCM 样本编码为 16-bit WAV base64 字符串
 *
 * @ai-context
 * 44 字节标准 WAV 头 + Int16 PCM 数据，
 * 无需第三方库，保证纯前端环境可用。
 */
function encodeWavBase64(
  floatSamples: Float32Array,
  sampleRate: number,
  channels: number,
): string {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const pcmBytes = floatSamples.length * (bitsPerSample / 8);
  const totalBytes = 44 + pcmBytes;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // RIFF 头
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalBytes - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt 子块
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                    // 子块大小
  view.setUint16(20, 1, true);                     // PCM 格式
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data 子块
  writeString(view, 36, 'data');
  view.setUint32(40, pcmBytes, true);

  // Float32 → Int16 转换并写入
  let offset = 44;
  for (let i = 0; i < floatSamples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return arrayBufferToBase64(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
