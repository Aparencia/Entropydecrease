/**
 * Electron 主进程视频录制管理器
 *
 * @ai-context Path C 全程录制模式的核心引擎
 * 架构复用 AudioCapture 的"主进程调度 + 渲染进程执行 + IPC 回传"模式：
 * 1. 主进程管理录制生命周期、写入 WebM 文件到磁盘
 * 2. 渲染进程通过 MediaRecorder 采集桌面视频流
 * 3. 视频数据块通过 IPC video_record_chunk 回传主进程并追加写入文件
 */

import { app, BrowserWindow, ipcMain } from 'electron';
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

/** 孤儿录制文件最大存活时长（ms）——24 小时（M20） */
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 渲染进程停止确认等待时长（ms）——超时后不再等待尾帧（M18） */
const STOP_CONFIRM_TIMEOUT_MS = 500;

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
  /** 录制是否已正常结束（正常停止后置 true；dispose 仅删除未完成的临时文件） */
  private completed = false;

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
    // 写流必须监听 error：WriteStream 的 'error' 事件无默认处理，
    // 磁盘故障/路径失效时会以未捕获异常直接崩溃主进程
    this.writeStream.on('error', (err) => {
      logger.error('[VideoRecorder] 文件写入失败:', err.message);
      this.recording = false;
      this.paused = false;
      this.stopStatusTimer();
      this.writeStream?.destroy();
      this.writeStream = null;
      if (this.boundWin && !this.boundWin.isDestroyed()) {
        this.boundWin.webContents.send('video_record_error', {
          message: `文件写入失败: ${err.message}`,
          filePath: this.filePath,
        });
      }
    });
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
   * M18: 先通知渲染进程停止 MediaRecorder，等待渲染进程确认
   * video_record_stopped（或 500ms 超时兜底）；期间保持 recording=true
   * 使 handleRendererChunk 继续接收尾帧；最后关闭文件流、置 recording=false
   */
  async stopRecording(): Promise<string> {
    if (!this.recording) {
      throw new Error('[VideoRecorder] 当前未在录制');
    }

    // 保存窗口快照（dispose 场景下 boundWin 可能被并发置空）
    const win = this.boundWin;
    this.paused = false;
    this.stopStatusTimer();

    // 1. 通知渲染进程停止 MediaRecorder（触发最后一个 ondataavailable 尾帧）
    if (win && !win.isDestroyed()) {
      win.webContents.send('video_record_do_stop');
    }

    // 2. 等待渲染进程确认 stop 完成（video_record_stopped 事件），超时兜底
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        ipcMain.removeListener('video_record_stopped', onConfirmed);
        resolve();
      }, STOP_CONFIRM_TIMEOUT_MS);
      function onConfirmed(event: Electron.IpcMainEvent): void {
        // CL-L8: 仅接受绑定窗口的确认——非绑定窗口可发送伪造事件提前结束
        // 等待窗口（与 SEC-005 sender 验证策略一致）
        if (win && !win.isDestroyed() && event.sender.id !== win.webContents.id) {
          return;
        }
        clearTimeout(timeoutId);
        resolve();
      }
      ipcMain.once('video_record_stopped', onConfirmed);
    });

    // 3. 关闭文件流（此时尾帧已全部写入）
    const finalPath = this.filePath;
    await new Promise<void>((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => resolve());
      } else {
        resolve();
      }
    });
    this.writeStream = null;

    // 4. 最后置 recording = false（等待期间 handleRendererChunk 仍接收尾帧）
    this.recording = false;
    this.completed = true;

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

  /** 销毁实例，释放资源（M20: 删除未正常完成的临时录制文件） */
  dispose(): void {
    const cleanupFile = () => this.deleteRecordingFile();
    if (this.recording) {
      this.stopRecording().then(cleanupFile).catch((err) => {
        logger.error('[VideoRecorder] dispose 时停止录制失败:', err);
        cleanupFile();
      });
    } else {
      cleanupFile();
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

  /**
   * 删除未正常完成的临时录制文件（M20）
   * 正常停止（completed=true）的文件由渲染进程持有路径，必须保留；
   * 录制被中断/异常/废弃时删除，防止临时目录堆积
   */
  private deleteRecordingFile(): void {
    if (this.completed || !this.filePath) return;
    const target = this.filePath;
    this.filePath = null;
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        logger.info(`[VideoRecorder] 已删除未完成的临时录制文件: ${target}`);
      }
    } catch (err) {
      logger.warn(`[VideoRecorder] 删除录制文件失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ================================================================
// 孤儿录制文件清理（M20）
// ================================================================

/**
 * 清理 keban-recordings/ 目录下超过 maxAgeMs 的孤儿录制文件。
 * 应用启动时调用一次——崩溃/强杀残留的录制分片在此处回收，
 * 防止临时目录无限膨胀；正在进行的录制（mtime 新）不受影响。
 */
export function cleanupOrphanRecordings(maxAgeMs: number = ORPHAN_MAX_AGE_MS): void {
  const dir = path.join(app.getPath('temp'), RECORDINGS_DIR_NAME);
  let removed = 0;
  try {
    if (!fs.existsSync(dir)) return;
    const cutoff = Date.now() - maxAgeMs;
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      try {
        const st = fs.statSync(fullPath);
        if (st.isFile() && st.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
          removed++;
        }
      } catch {
        // 单个文件删除失败不阻塞其余清理
      }
    }
  } catch (err) {
    logger.warn(`[VideoRecorder] 孤儿录制文件清理失败: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (removed > 0) {
    logger.info(`[VideoRecorder] 已清理 ${removed} 个超过 ${Math.round(maxAgeMs / 3600000)}h 的孤儿录制文件`);
  }
}
