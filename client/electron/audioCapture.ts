/**
 * 音频采集编排器
 *
 * @ai-context: Phase 0 重构（见 ADR-001）——本文件由"直接驱动渲染进程采集"
 * 改为「按策略选源 + 降级 + 统一补时间戳」的编排器，具体采集实现下沉到
 * audio/*Provider。对外 API（AudioCapture 的 start/stop/dispose/
 * handleRendererChunk/isCapturing/config）保持不变，故 mediaCaptureHandlers
 * 无需改动，行为与重构前一致。
 * @ai-context: 时间戳统一在编排器补，保证不同源切换（含降级）后时间基准连续。
 *
 * TODO(现场课程): 麦克风 Provider（MicrophoneProvider）待补，届时经
 * selectAudioSource 的 microphone 分支进入，VADMarker 以
 * sourceType:'microphone' 构造启用背景噪声校准。
 */

import type { BrowserWindow } from 'electron';
import { logger } from './logger.js';
import { EndpointLoopbackProvider, listAudioSources } from './audio/endpointLoopbackProvider.js';
import type {
  AudioCaptureOptions,
  AudioChunk,
  AudioSourceProvider,
  RendererAudioChunk,
} from './audio/audioSourceProvider.js';
import {
  selectAudioSource,
  type AudioSourceDecision,
  type AudioSourceKind,
  type AudioSourcePreference,
} from '../src/lib/capture/audioSourceStrategy.js';

// 保持既有导出路径不变（mediaCaptureHandlers 等调用方无需改动）
export { listAudioSources };
export type { AudioCaptureOptions, AudioChunk } from './audio/audioSourceProvider.js';
export type { AudioSourceInfo } from './audio/endpointLoopbackProvider.js';

// ================================================================
// 默认配置
// ================================================================

const DEFAULT_OPTIONS: AudioCaptureOptions = {
  chunkDurationMs: 5000,
  sampleRate: 16000,
  channels: 1,
};

/** 单调递增时间戳生成器 */
let lastTimestamp = 0;
function monotonicTimestamp(): number {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return lastTimestamp;
}

/** 额外的启动参数（选源相关，均可选以保持向后兼容） */
export interface AudioCaptureStartExtras {
  /** 设置页的源偏好，默认 auto */
  preference?: AudioSourcePreference;
  /** 线下课堂（麦克风）场景 */
  microphone?: boolean;
}

// ================================================================
// 音频采集编排器
// ================================================================

export class AudioCapture {
  private readonly options: AudioCaptureOptions;
  private readonly onChunk: (chunk: AudioChunk) => void;
  private capturing = false;
  private disposed = false;

  /** 当前活跃的 Provider */
  private provider: AudioSourceProvider | null = null;
  /** 本次采集的选源决策（供日志/会话元数据归因） */
  private decision: AudioSourceDecision | null = null;

  constructor(
    options: Partial<AudioCaptureOptions>,
    onChunk: (chunk: AudioChunk) => void,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onChunk = onChunk;
  }

  /** 是否正在捕获 */
  get isCapturing(): boolean {
    return this.capturing;
  }

  /** 当前配置（只读） */
  get config(): Readonly<AudioCaptureOptions> {
    return this.options;
  }

  /** 本次生效的音频源类型（未启动时为 null） */
  get activeSourceKind(): AudioSourceKind | null {
    return this.provider?.kind ?? null;
  }

  /** 本次选源决策（含理由，供会话元数据记录） */
  get sourceDecision(): AudioSourceDecision | null {
    return this.decision;
  }

  /**
   * 开始音频捕获。
   *
   * 按 selectAudioSource 的决策创建 Provider；若首选源启动失败且存在降级目标，
   * 自动降级重试一次（降级事实通过 decision.reason 与日志暴露）。
   */
  async start(
    win: BrowserWindow,
    sourceId?: string,
    extras?: AudioCaptureStartExtras,
  ): Promise<void> {
    if (this.capturing || this.disposed) return;

    const resolvedSourceId = sourceId ?? null;
    this.decision = selectAudioSource({
      // Phase 0：进程环回尚未接入，能力探测恒为不可用（行为与重构前一致）
      capabilities: { processLoopbackAvailable: false },
      sourceId: resolvedSourceId,
      preference: extras?.preference,
      microphone: extras?.microphone,
    });

    logger.info(
      `[AudioCapture] 选源: ${this.decision.kind}（${this.decision.reason}）` +
      `${this.decision.fallback ? `, 降级目标=${this.decision.fallback}` : ''}`,
    );

    try {
      await this.startWithKind(this.decision.kind, win, resolvedSourceId);
    } catch (err) {
      const fallback = this.decision.fallback;
      if (!fallback) throw err;

      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[AudioCapture] ${this.decision.kind} 启动失败（${message}），降级到 ${fallback}`);
      this.decision = {
        kind: fallback,
        reason: `${this.decision.kind} 启动失败后降级：${message}`,
        fallback: null,
      };
      await this.startWithKind(fallback, win, resolvedSourceId);
    }

    this.capturing = true;
  }

  /** 按源类型创建并启动 Provider */
  private async startWithKind(
    kind: AudioSourceKind,
    win: BrowserWindow,
    sourceId: string | null,
  ): Promise<void> {
    this.provider?.dispose();
    this.provider = this.createProvider(kind);
    await this.provider.start({ window: win, sourceId, options: this.options });
  }

  /** Provider 工厂 */
  private createProvider(kind: AudioSourceKind): AudioSourceProvider {
    const sink = (data: RendererAudioChunk) => this.emitChunk(data);
    switch (kind) {
      case 'endpoint_loopback':
        return new EndpointLoopbackProvider(sink);
      case 'process_loopback':
        // Phase 2 接入；Phase 0 阶段选源不会产生该分支
        throw new Error('进程环回 Provider 尚未接入');
      case 'microphone':
        // TODO(现场课程): MicrophoneProvider 待实现
        throw new Error('麦克风 Provider 尚未实现');
    }
  }

  /** 统一补时间戳后向消费者分发 */
  private emitChunk(data: RendererAudioChunk): void {
    if (this.disposed) return;
    this.onChunk({
      audioBuffer: data.audioBuffer,
      sampleRate: data.sampleRate,
      channels: data.channels,
      durationMs: data.durationMs,
      timestamp: monotonicTimestamp(),
    });
  }

  /** 停止音频捕获 */
  stop(): void {
    if (!this.capturing) return;
    this.capturing = false;
    this.provider?.stop();
  }

  /**
   * 接收来自渲染进程的音频块数据（由 IPC handler 调用）。
   * 仅当前 Provider 为渲染进程侧采集时有效。
   */
  handleRendererChunk(data: RendererAudioChunk): void {
    if (!this.capturing || this.disposed) return;
    this.provider?.handleRendererChunk?.(data);
  }

  /** 销毁实例，释放所有资源 */
  dispose(): void {
    this.stop();
    this.provider?.dispose();
    this.provider = null;
    this.disposed = true;
    logger.info('[AudioCapture] 已销毁');
  }
}
