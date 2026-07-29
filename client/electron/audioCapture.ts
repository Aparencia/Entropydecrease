/**
 * Electron 主进程系统音频捕获模块
 *
 * 架构：
 * 1. 主进程使用 desktopCapturer.getSources({ types: ['screen'] }) 枚举屏幕源作为音频环回候选
 * 2. 将音频 sourceId 传递给渲染进程
 * 3. 渲染进程通过 getUserMedia + chromeMediaSource: 'desktop' 获取 MediaStream
 * 4. 渲染进程使用 Web Audio API (AudioContext + ScriptProcessor) 切片
 * 5. PCM 数据块通过 IPC 回传主进程，添加单调时间戳后推送给消费者
 *
 * @ai-context: 系统音频捕获：渲染进程 getDisplayMedia 采集、主进程聚合分块。
 */

import { desktopCapturer, DesktopCapturerSource, BrowserWindow } from 'electron';
import { logger } from './logger';

// ================================================================
// 类型定义
// ================================================================

/** 音频源信息 */
export interface AudioSourceInfo {
  id: string;
  name: string;
}

/** 音频捕获配置 */
export interface AudioCaptureOptions {
  chunkDurationMs: number;    // 音频块时长(ms)，默认 5000
  sampleRate: number;         // 采样率，默认 16000
  channels: number;           // 声道数，默认 1（单声道）
}

/** 音频块数据（主进程 → 渲染进程） */
export interface AudioChunk {
  audioBuffer: ArrayBuffer;   // PCM Float32 数据
  sampleRate: number;
  channels: number;
  durationMs: number;
  timestamp: number;          // 单调递增时间戳 (ms)
}

/** 渲染进程上报的原始音频块 */
interface RendererAudioChunk {
  audioBuffer: ArrayBuffer;
  sampleRate: number;
  channels: number;
  durationMs: number;
}

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

// ================================================================
// 音频源枚举
// ================================================================

/**
 * 列出所有可用的系统音频源
 *
 * Electron 中系统音频环回（WASAPI Loopback）通过桌面捕获源实现：
 * 任意 screen/window 源均可配合 getUserMedia({ chromeMediaSource: 'desktop' })
 * 捕获系统音频。因此这里枚举 screen 类型源作为音频采集候选。
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

// ================================================================
// 音频捕获管理器
// ================================================================

export class AudioCapture {
  private readonly options: AudioCaptureOptions;
  private readonly onChunk: (chunk: AudioChunk) => void;
  private capturing = false;
  private disposed = false;
  private boundWin: BrowserWindow | null = null;

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

  /**
   * 开始音频捕获
   *
   * 1. 如果未指定 sourceId，自动选择第一个可用的系统音频源
   * 2. 向渲染进程发送启动指令（含 sourceId + 配置）
   * 3. 渲染进程负责 getUserMedia 和音频切片
   */
  async start(win: BrowserWindow, sourceId?: string): Promise<void> {
    if (this.capturing || this.disposed) return;

    // 解析音频源
    let resolvedSourceId = sourceId ?? null;
    if (!resolvedSourceId) {
      const sources = await listAudioSources();
      if (sources.length === 0) {
        console.warn('[AudioCapture] 未找到可用的系统音频源');
        throw new Error('No audio source available');
      }
      resolvedSourceId = sources[0].id;
      logger.info(`[AudioCapture] 自动选择音频源: ${sources[0].name} (${resolvedSourceId})`);
    }

    this.capturing = true;
    this.boundWin = win;

    logger.info(
      `[AudioCapture] 开始捕获, sourceId=${resolvedSourceId}, ` +
      `chunkDurationMs=${this.options.chunkDurationMs}, ` +
      `sampleRate=${this.options.sampleRate}, channels=${this.options.channels}`,
    );

    // 通知渲染进程开始音频采集
    if (!win.isDestroyed()) {
      win.webContents.send('audio_capture_do_start', {
        sourceId: resolvedSourceId,
        options: this.options,
      });
    }
  }

  /**
   * 停止音频捕获
   */
  stop(): void {
    if (!this.capturing) return;

    this.capturing = false;
    logger.info('[AudioCapture] 停止捕获');

    // 通知渲染进程停止音频采集
    if (this.boundWin && !this.boundWin.isDestroyed()) {
      this.boundWin.webContents.send('audio_capture_do_stop');
    }
    this.boundWin = null;
  }

  /**
   * 接收来自渲染进程的音频块数据
   * 由 IPC handler 调用，添加单调时间戳后通过回调发出
   */
  handleRendererChunk(data: RendererAudioChunk): void {
    if (!this.capturing || this.disposed) return;

    const chunk: AudioChunk = {
      audioBuffer: data.audioBuffer,
      sampleRate: data.sampleRate,
      channels: data.channels,
      durationMs: data.durationMs,
      timestamp: monotonicTimestamp(),
    };

    this.onChunk(chunk);
  }

  /**
   * 销毁实例，释放所有资源
   */
  dispose(): void {
    this.stop();
    this.disposed = true;
    logger.info('[AudioCapture] 已销毁');
  }
}
