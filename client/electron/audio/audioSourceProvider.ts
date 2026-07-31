/**
 * 音频源 Provider 接口（主进程侧）
 *
 * @ai-context: 见 ADR-001。采集层抽象的目的是让"如何拿到 PCM"可替换，
 * 而下游（VAD / ASR / 幻觉过滤 / 交叉融合）只依赖 AudioChunk 契约不受影响。
 * 两类 Provider 的数据流方向相反：端点环回由渲染进程采集后回传主进程
 * （需 handleRendererChunk），进程环回在主进程原生采集后直接产出。
 */

import type { BrowserWindow } from 'electron';
import type { AudioSourceKind } from '../../src/lib/capture/audioSourceStrategy.js';

/** 音频采集配置 */
export interface AudioCaptureOptions {
  /** 音频块时长(ms)，默认 5000 */
  chunkDurationMs: number;
  /** 采样率，默认 16000 */
  sampleRate: number;
  /** 声道数，默认 1（单声道） */
  channels: number;
}

/** 音频块（Provider → 消费者） */
export interface AudioChunk {
  /** PCM Float32 数据 */
  audioBuffer: ArrayBuffer;
  sampleRate: number;
  channels: number;
  durationMs: number;
  /** 单调递增时间戳 (ms) */
  timestamp: number;
}

/** 渲染进程上报的原始音频块（无时间戳，由编排器统一补） */
export interface RendererAudioChunk {
  audioBuffer: ArrayBuffer;
  sampleRate: number;
  channels: number;
  durationMs: number;
}

/** Provider 启动上下文 */
export interface AudioProviderStartContext {
  /** 绑定的窗口（端点环回需向其下发采集指令） */
  window: BrowserWindow;
  /** 用户选定的采集源 ID（desktopCapturer 格式），null 表示自动 */
  sourceId: string | null;
  options: AudioCaptureOptions;
}

/**
 * 音频源 Provider。
 *
 * 实现约定：
 * - start 失败必须抛错，由编排器决定是否降级
 * - stop / dispose 必须幂等
 * - 产出的 chunk 不带时间戳，统一由编排器补（保证跨源时间基准一致）
 */
export interface AudioSourceProvider {
  readonly kind: AudioSourceKind;
  /** 启动采集；失败抛错 */
  start(ctx: AudioProviderStartContext): Promise<void>;
  /** 停止采集（幂等） */
  stop(): void;
  /** 释放资源（幂等） */
  dispose(): void;
  /**
   * 接收渲染进程回传的音频块。
   * 仅渲染进程侧采集的 Provider（端点环回 / 麦克风）实现此方法。
   */
  handleRendererChunk?(data: RendererAudioChunk): void;
}

/** Provider 产出音频块的回调 */
export type AudioChunkSink = (chunk: RendererAudioChunk) => void;
