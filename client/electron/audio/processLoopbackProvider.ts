/**
 * 进程环回 Provider（Windows 原生 WASAPI 路径）
 *
 * @ai-context: 见 ADR-001。与端点环回的关键差异：采集完全在主进程完成
 * （原生采集线程 → ThreadSafeFunction → 主进程 JS），不经渲染进程，
 * 故不实现 handleRendererChunk；产出的块直接交 sink。
 * @ai-context: 目标 PID 解析——desktopCapturer 的 window id 形如
 * `window:<HWND>:0`，取 HWND 匹配原生枚举结果得到进程树根。Chromium 顶层
 * 窗口本身即归属 browser process，故 rootPid 通常等于 pid；仍走 rootPid
 * 以覆盖窗口归属子进程的应用。
 * @ai-context: 启动期失败（目标不可采/激活失败）经 onFatal 异步上报，
 * 由编排器触发降级到端点环回。
 */

import { logger } from '../logger.js';
import { loadProcessAudioNative, type NativeWindowInfo } from './processAudioNative.js';
import type {
  AudioChunkSink,
  AudioProviderStartContext,
  AudioSourceProvider,
} from './audioSourceProvider.js';
import type { AudioSourceKind } from '../../src/lib/capture/audioSourceStrategy.js';

/** 从 desktopCapturer 的 window id 中解析 HWND；失败返回 null */
export function parseHwndFromSourceId(sourceId: string | null): string | null {
  if (!sourceId || !sourceId.startsWith('window:')) return null;
  const parts = sourceId.split(':');
  if (parts.length < 2 || !parts[1]) return null;
  // id 形如 window:395794:0，中间段为十进制 HWND
  return parts[1];
}

export class ProcessLoopbackProvider implements AudioSourceProvider {
  readonly kind: AudioSourceKind = 'process_loopback';

  private readonly sink: AudioChunkSink;
  /** 致命错误上报（编排器据此降级） */
  private readonly onFatal: (message: string) => void;
  private capturing = false;
  private disposed = false;

  constructor(sink: AudioChunkSink, onFatal: (message: string) => void) {
    this.sink = sink;
    this.onFatal = onFatal;
  }

  async start(ctx: AudioProviderStartContext): Promise<void> {
    if (this.capturing || this.disposed) return;

    const native = loadProcessAudioNative();
    if (!native) throw new Error('进程环回原生模块不可用');

    const targetPid = this.resolveTargetPid(native.listAudioWindows(), ctx.sourceId);
    if (targetPid === null) {
      throw new Error('无法解析目标窗口所属进程，请改用系统音频采集');
    }

    const result = native.startCapture(
      {
        pid: targetPid,
        sampleRate: ctx.options.sampleRate,
        channels: ctx.options.channels,
        chunkDurationMs: ctx.options.chunkDurationMs,
      },
      (payload) => {
        if (this.disposed) return;
        if (payload.error) {
          logger.warn(`[ProcessLoopback] 采集错误: ${payload.error}`);
          this.onFatal(payload.error);
          return;
        }
        if (!payload.audioBuffer) return;
        this.sink({
          audioBuffer: payload.audioBuffer,
          sampleRate: payload.sampleRate ?? ctx.options.sampleRate,
          channels: payload.channels ?? ctx.options.channels,
          durationMs: payload.durationMs ?? ctx.options.chunkDurationMs,
        });
      },
    );

    if (!result.ok) throw new Error(result.error || '进程环回启动失败');

    this.capturing = true;
    logger.info(
      `[ProcessLoopback] 开始捕获, targetPid=${targetPid}, ` +
      `chunkDurationMs=${ctx.options.chunkDurationMs}, ` +
      `sampleRate=${ctx.options.sampleRate}, channels=${ctx.options.channels}`,
    );
  }

  /** 由窗口源 ID 定位进程树根 PID */
  private resolveTargetPid(windows: NativeWindowInfo[], sourceId: string | null): number | null {
    const hwnd = parseHwndFromSourceId(sourceId);
    if (!hwnd) return null;
    const matched = windows.find((w) => w.hwnd === hwnd);
    if (!matched) {
      logger.warn(`[ProcessLoopback] 未在窗口列表中找到 HWND=${hwnd}`);
      return null;
    }
    logger.info(
      `[ProcessLoopback] 目标窗口="${matched.title}" pid=${matched.pid} ` +
      `rootPid=${matched.rootPid} (${matched.rootProcessName})`,
    );
    return matched.rootPid;
  }

  stop(): void {
    if (!this.capturing) return;
    this.capturing = false;
    const native = loadProcessAudioNative();
    try {
      native?.stopCapture();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[ProcessLoopback] stopCapture 异常: ${message}`);
    }
    logger.info('[ProcessLoopback] 停止捕获');
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
  }
}
