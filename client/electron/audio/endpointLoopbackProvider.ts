/**
 * 端点环回 Provider（Chromium getDisplayMedia 路径）
 *
 * @ai-context: 从 audioCapture.ts 原样迁入（Phase 0 纯重构，行为不变）。
 * Windows 下系统音频只能在渲染进程取到：主进程登记期望源 → 通知渲染进程
 * 调 getDisplayMedia（由 displayMediaHandler 附加 audio:'loopback'）→
 * 渲染进程切片后经 IPC 回传，故本 Provider 实现 handleRendererChunk。
 * @ai-context: 采到的是设备最终混音（含其他应用声音、受主音量影响），
 * 这是它与进程环回的本质差异，见 ADR-001。
 */

import { desktopCapturer, type DesktopCapturerSource } from 'electron';
import { logger } from '../logger.js';
import { setPreferredDisplaySource } from '../displayMediaHandler.js';
import type {
  AudioChunkSink,
  AudioProviderStartContext,
  AudioSourceProvider,
  RendererAudioChunk,
} from './audioSourceProvider.js';
import type { AudioSourceKind } from '../../src/lib/capture/audioSourceStrategy.js';

/** 音频源信息 */
export interface AudioSourceInfo {
  id: string;
  name: string;
}

/**
 * 列出所有可用的系统音频源
 *
 * Electron 中系统音频环回（WASAPI Loopback）通过桌面捕获源实现：
 * 任意 screen/window 源均可配合 getDisplayMedia 捕获系统音频，
 * 因此这里枚举 screen 类型源作为音频采集候选。
 */
export async function listAudioSources(): Promise<AudioSourceInfo[]> {
  const sources: DesktopCapturerSource[] = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1, height: 1 }, // 枚举不需要缩略图
  });

  return sources.map((src) => ({
    id: src.id,
    name: `系统音频 - ${src.name}`,
  }));
}

export class EndpointLoopbackProvider implements AudioSourceProvider {
  readonly kind: AudioSourceKind = 'endpoint_loopback';

  private readonly sink: AudioChunkSink;
  private capturing = false;
  private disposed = false;
  /** 启动中互斥锁：守卫与 capturing 置位间存在 await（listAudioSources）空隙，同步上锁防并发双启动 */
  private starting = false;
  private boundWindow: AudioProviderStartContext['window'] | null = null;

  constructor(sink: AudioChunkSink) {
    this.sink = sink;
  }

  async start(ctx: AudioProviderStartContext): Promise<void> {
    if (this.capturing || this.starting || this.disposed) return;

    // 进入即同步上锁，finally 释放：堵住守卫与状态翻转间的 await 空隙
    this.starting = true;
    try {
      // 解析音频源：未指定时自动取首个屏幕源
      let resolvedSourceId = ctx.sourceId;
      if (!resolvedSourceId) {
        const sources = await listAudioSources();
        if (sources.length === 0) {
          throw new Error('No audio source available');
        }
        resolvedSourceId = sources[0].id;
        logger.info(`[EndpointLoopback] 自动选择音频源: ${sources[0].name} (${resolvedSourceId})`);
      }

      // 登记期望源：渲染进程随后调用 getDisplayMedia，主进程 handler 据此授权
      // 并附加 audio: 'loopback' 才能拿到真实系统音频（详见 displayMediaHandler.ts）
      setPreferredDisplaySource(resolvedSourceId);

      this.capturing = true;
      this.boundWindow = ctx.window;

      logger.info(
        `[EndpointLoopback] 开始捕获, sourceId=${resolvedSourceId}, ` +
        `chunkDurationMs=${ctx.options.chunkDurationMs}, ` +
        `sampleRate=${ctx.options.sampleRate}, channels=${ctx.options.channels}`,
      );

      // 通知渲染进程开始音频采集
      if (!ctx.window.isDestroyed()) {
        ctx.window.webContents.send('audio_capture_do_start', {
          sourceId: resolvedSourceId,
          options: ctx.options,
        });
      }
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    if (!this.capturing) return;

    this.capturing = false;
    logger.info('[EndpointLoopback] 停止捕获');

    // 通知渲染进程停止音频采集
    if (this.boundWindow && !this.boundWindow.isDestroyed()) {
      this.boundWindow.webContents.send('audio_capture_do_stop');
    }
    this.boundWindow = null;
  }

  /** 接收渲染进程回传的音频块，转交编排器补时间戳后分发 */
  handleRendererChunk(data: RendererAudioChunk): void {
    if (!this.capturing || this.disposed) return;
    this.sink(data);
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
  }
}
