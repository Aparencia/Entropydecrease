/**
 * Electron 主进程视频录制管理器
 *
 * @ai-context Path C 全程录制模式的核心引擎
 * 架构复用 AudioCapture 的"主进程调度 + 渲染进程执行 + IPC 回传"模式：
 * 1. 主进程管理录制生命周期、写入 WebM 文件到磁盘
 * 2. 渲染进程通过 MediaRecorder 采集桌面视频流
 * 3. 视频数据块通过 IPC video_record_chunk 回传主进程并追加写入文件
 */

import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from './logger.js';

// ================================================================
// 类型定义
// ================================================================

/** 视频录制选项 */
export interface VideoRecordOptions {
  videoBitsPerSecond?: number;
  frameRate?: number;
}

/** 录制状态（主进程 → 渲染进程） */
export interface RecordingStatus {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  fileSizeBytes: number;
  filePath: string | null;
}

// ================================================================
// 默认配置
// ================================================================

/** @ai-context 500kbps 低码率 + 5s 分片，平衡文件体积与录制流畅度 */
const DEFAULT_OPTIONS: Required<VideoRecordOptions> = {
  videoBitsPerSecond: 500_000,
  frameRate: 15,
};

const RECORDINGS_DIR_NAME = 'keban-recordings';

// ================================================================
// 视频录制管理器
// ================================================================

export class VideoRecorder {
  private readonly options: Required<VideoRecordOptions>;
  private recording = false;
  private paused = false;
  private disposed = false;
  private boundWin: BrowserWindow | null = null;

  /** 当前录制输出文件路径 */
  private filePath: string | null = null;
  /** 文件写入流（追加模式） */
  private writeStream: fs.WriteStream | null = null;
  /** 录制开始时间戳 */
  private startTime = 0;
  /** 暂停期间累计的暂停时长 */
  private pausedDurationMs = 0;
  /** 暂停开始时间 */
  private pauseStartedAt = 0;
  /** 已写入字节数 */
  private fileSizeBytes = 0;
  /** 状态推送定时器 */
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: VideoRecordOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** 是否正在录制 */
  get isRecording(): boolean {
    return this.recording;
  }

  /** 当前录制状态快照 */
  get status(): RecordingStatus {
    return {
      isRecording: this.recording,
      isPaused: this.paused,
      duration: this.getDurationMs(),
      fileSizeBytes: this.fileSizeBytes,
      filePath: this.filePath,
    };
  }

  /**
   * 开始视频录制
   * 通知渲染进程启动 MediaRecorder，主进程准备文件写入流
   */
  startRecording(sourceId: string, options?: VideoRecordOptions): void {
    if (this.recording || this.disposed) return;

    const mergedOpts = { ...this.options, ...options };

    // 准备录制目录和文件
    const dir = path.join(app.getPath('temp'), RECORDINGS_DIR_NAME);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.filePath = path.join(dir, `recording-${timestamp}.webm`);
    this.writeStream = fs.createWriteStream(this.filePath, { flags: 'a' });
    this.fileSizeBytes = 0;
    this.startTime = Date.now();
    this.pausedDurationMs = 0;
    this.recording = true;
    this.paused = false;

    logger.info(
      `[VideoRecorder] 开始录制, sourceId=${sourceId}, ` +
      `bitsPerSecond=${mergedOpts.videoBitsPerSecond}, frameRate=${mergedOpts.frameRate}, ` +
      `output=${this.filePath}`,
    );

    // 启动状态推送定时器（每秒一次）
    this.statusTimer = setInterval(() => this.pushStatus(), 1000);

    // 通知渲染进程开始录制
    if (this.boundWin && !this.boundWin.isDestroyed()) {
      this.boundWin.webContents.send('video_record_do_start', {
        sourceId,
        options: mergedOpts,
      });
    }
  }

  /**
   * 停止录制，返回视频文件路径
   */
  async stopRecording(): Promise<string> {
    if (!this.recording) {
      throw new Error('[VideoRecorder] 当前未在录制');
    }

    this.recording = false;
    this.paused = false;
    this.stopStatusTimer();

    // 通知渲染进程停止 MediaRecorder
    if (this.boundWin && !this.boundWin.isDestroyed()) {
      this.boundWin.webContents.send('video_record_do_stop');
    }

    // 等待最后一批 chunk 写入完成（给渲染进程 500ms 缓冲）
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    // 关闭文件流
    const finalPath = this.filePath;
    await new Promise<void>((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => resolve());
      } else {
        resolve();
      }
    });
    this.writeStream = null;

    logger.info(
      `[VideoRecorder] 停止录制, duration=${this.getDurationMs()}ms, ` +
      `size=${this.fileSizeBytes} bytes, file=${finalPath}`,
    );

    return finalPath ?? '';
  }

  /** 暂停录制 */
  pauseRecording(): void {
    if (!this.recording || this.paused) return;
    this.paused = true;
    this.pauseStartedAt = Date.now();
    logger.info('[VideoRecorder] 暂停录制');
  }

  /** 恢复录制 */
  resumeRecording(): void {
    if (!this.recording || !this.paused) return;
    this.pausedDurationMs += Date.now() - this.pauseStartedAt;
    this.paused = false;
    logger.info('[VideoRecorder] 恢复录制');
  }

  /**
   * 接收渲染进程回传的视频数据块，追加写入文件
   * 由 IPC handler 调用
   */
  handleRendererChunk(chunkBuffer: ArrayBuffer): void {
    if (!this.recording || this.paused || !this.writeStream) return;
    const buf = Buffer.from(chunkBuffer);
    this.writeStream.write(buf);
    this.fileSizeBytes += buf.byteLength;
  }

  /**
   * 处理渲染进程上报的录制错误
   * 停止录制并向渲染进程广播错误通知
   */
  handleRendererError(errorInfo: { message: string }): void {
    logger.error('[VideoRecorder] 渲染进程录制错误:', errorInfo.message);
    // 标记录制停止，避免后续操作
    this.recording = false;
    this.paused = false;
    this.stopStatusTimer();
    // 关闭文件流
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
    // 向渲染进程广播错误事件
    if (this.boundWin && !this.boundWin.isDestroyed()) {
      this.boundWin.webContents.send('video_record_error', {
        message: errorInfo.message,
        filePath: this.filePath,
      });
    }
  }

  /** 绑定主窗口（用于 IPC 通信） */
  bindWindow(win: BrowserWindow): void {
    this.boundWin = win;
  }

  /** 销毁实例，释放资源 */
  dispose(): void {
    if (this.recording) {
      this.stopRecording().catch((err) => {
        logger.error('[VideoRecorder] dispose 时停止录制失败:', err);
      });
    }
    this.stopStatusTimer();
    this.disposed = true;
    this.boundWin = null;
    logger.info('[VideoRecorder] 已销毁');
  }

  // ================================================================
  // 私有方法
  // ================================================================

  /** 计算有效录制时长（扣除暂停时间） */
  private getDurationMs(): number {
    if (!this.startTime) return 0;
    const elapsed = Date.now() - this.startTime;
    const pauseOffset = this.paused
      ? this.pausedDurationMs + (Date.now() - this.pauseStartedAt)
      : this.pausedDurationMs;
    return Math.max(0, elapsed - pauseOffset);
  }

  /** 向渲染进程推送录制状态 */
  private pushStatus(): void {
    if (!this.boundWin || this.boundWin.isDestroyed()) return;
    this.boundWin.webContents.send('video_record_status', this.status);
  }

  /** 停止状态推送定时器 */
  private stopStatusTimer(): void {
    if (this.statusTimer !== null) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }
}
