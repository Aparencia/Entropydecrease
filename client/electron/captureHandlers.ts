/**
 * 屏幕截图 & 系统音频 & 视频录制 IPC Handler
 *
 * 从 main.ts 拆分而来，管理截图采集、音频捕获和视频录制的生命周期。
 */

import { BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import { ScreenCapture } from './screenCapture.js';
import type { ScreenCaptureOptions, ScreenshotFrameData } from './screenCapture.js';
import { AudioCapture, listAudioSources } from './audioCapture.js';
import type { AudioCaptureOptions, AudioChunk } from './audioCapture.js';
import { VideoRecorder } from './videoRecorder.js';
import type { VideoRecordOptions } from './videoRecorder.js';
import { safeHandle, getMainWindowId } from './ipcUtils.js';
import { logger } from './logger.js';
import { scoreAndFilterWindows } from './windowScorer.js';

// ================================================================
// 模块级状态
// ================================================================

/** 当前活跃的截图采集实例 */
let activeCapture: ScreenCapture | null = null;

/** 当前活跃的音频捕获实例 */
let activeAudioCapture: AudioCapture | null = null;

/** @ai-context Path C 全程录制：当前活跃的视频录制实例 */
let activeVideoRecorder: VideoRecorder | null = null;

/** screen_capture_start 防抖：500ms 内多次调用只响应最后一次 */
let startDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const START_DEBOUNCE_MS = 500;

/** 单调递增会话标识，用于防止 stop 后残留的 debounce 重启采集 */
let captureSessionToken = 0;

/** 窗口监听轮询定时器 */
let windowWatchTimer: ReturnType<typeof setInterval> | null = null;

/** 上一次窗口列表的 id 集合（用于 diff 检测变化） */
let lastWindowIds: Set<string> = new Set();

const WINDOW_WATCH_INTERVAL_MS = 3000;

// ================================================================
// 公共 API
// ================================================================

/**
 * 注册所有截图 & 音频相关的 IPC handler
 */
export function registerCaptureHandlers(): void {
  // ---- 屏幕截图 ----

  safeHandle(
    'screen_capture_start',
    async (event, options: ScreenCaptureOptions) => {
      // 防抖：500ms 内多次调用只响应最后一次
      if (startDebounceTimer) {
        clearTimeout(startDebounceTimer);
        startDebounceTimer = null;
      }

      // 记录本次会话 token，用于 debounce 回调时校验是否仍然有效
      const token = ++captureSessionToken;

      return new Promise<{ success: boolean }>((resolve) => {
        startDebounceTimer = setTimeout(() => {
          startDebounceTimer = null;

          // 如果在 debounce 期间调用了 stop（token 已变），放弃本次启动
          if (token !== captureSessionToken) {
            logger.info('[IPC] screen_capture_start debounce 已过期（stop 后残留），跳过');
            resolve({ success: false });
            return;
          }

          // 幂等：先清理旧实例
          if (activeCapture) {
            activeCapture.dispose();
            activeCapture = null;
          }

          const senderWin = BrowserWindow.fromWebContents(event.sender);

          // 对采集参数做边界校验，防止非法值导致主进程异常
          const safeOptions = options || {};
          if (typeof safeOptions.interval === 'number' && (safeOptions.interval < 100 || safeOptions.interval > 60000)) {
            safeOptions.interval = 5000;
          }

          activeCapture = new ScreenCapture(safeOptions, (frame: ScreenshotFrameData) => {
            if (senderWin && !senderWin.isDestroyed()) {
              senderWin.webContents.send('screen_capture_frame', frame);
            }
          });

          activeCapture.start();
          logger.info('[IPC] screen_capture_start 已启动（防抖后）');
          resolve({ success: true });
        }, START_DEBOUNCE_MS);
      });
    },
  );

  safeHandle('screen_capture_stop', async () => {
    // 递增 token，使残留的 debounce 回调失效
    captureSessionToken++;

    // 清理防抖定时器
    if (startDebounceTimer) {
      clearTimeout(startDebounceTimer);
      startDebounceTimer = null;
    }

    if (activeCapture) {
      activeCapture.dispose();
      activeCapture = null;
      logger.info('[IPC] screen_capture_stop 已停止');
    }
    return { success: true };
  });

  safeHandle('screen_list_windows', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 240, height: 135 },
      });

      const rawWindows = sources.map((src) => {
        const thumb = src.thumbnail.isEmpty() ? src.thumbnail : src.thumbnail.resize({ width: 120 });
        return {
          id: src.id,
          title: src.name,
          thumbnail: thumb.toDataURL(),
        };
      });

      // 智能评分、过滤与排序
      return scoreAndFilterWindows(rawWindows);
    } catch (err) {
      logger.error('[IPC] screen_list_windows failed:', err);
      return [];
    }
  });

  // ---- 窗口变化监听（轮询） ----

  safeHandle('screen_watch_windows_start', async () => {
    if (windowWatchTimer) return { success: true }; // 已在监听

    logger.info('[IPC] 窗口监听已启动, interval=' + WINDOW_WATCH_INTERVAL_MS + 'ms');

    windowWatchTimer = setInterval(async () => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 240, height: 135 },
        });

        const currentIds = new Set(sources.map((s) => s.id));

        // 检测是否有变化（新增或关闭窗口）
        const hasChanged =
          currentIds.size !== lastWindowIds.size ||
          [...currentIds].some((id) => !lastWindowIds.has(id));

        if (hasChanged) {
          lastWindowIds = currentIds;

          const rawWindows = sources.map((src) => {
            const thumb = src.thumbnail.isEmpty() ? src.thumbnail : src.thumbnail.resize({ width: 120 });
            return { id: src.id, title: src.name, thumbnail: thumb.toDataURL() };
          });

          const scored = scoreAndFilterWindows(rawWindows);

          // 推送到渲染进程
          const mainWindowId = getMainWindowId();
          if (mainWindowId) {
            const win = BrowserWindow.fromId(mainWindowId);
            if (win && !win.isDestroyed()) {
              win.webContents.send('screen_windows_changed', scored);
            }
          }
        }
      } catch (err) {
        logger.error('[IPC] window watch poll error:', err);
      }
    }, WINDOW_WATCH_INTERVAL_MS);

    return { success: true };
  });

  safeHandle('screen_watch_windows_stop', async () => {
    if (windowWatchTimer) {
      clearInterval(windowWatchTimer);
      windowWatchTimer = null;
      lastWindowIds = new Set();
      logger.info('[IPC] 窗口监听已停止');
    }
    return { success: true };
  });

  // ---- 系统音频捕获 ----

  safeHandle('audio_list_sources', async () => {
    try {
      return await listAudioSources();
    } catch (err) {
      logger.error('[IPC] audio_list_sources failed:', err);
      return [];
    }
  });

  safeHandle(
    'audio_capture_start',
    async (event, options?: Partial<AudioCaptureOptions> & { sourceId?: string }) => {
      if (activeAudioCapture) {
        activeAudioCapture.dispose();
        activeAudioCapture = null;
      }

      const senderWin = BrowserWindow.fromWebContents(event.sender);
      if (!senderWin || senderWin.isDestroyed()) {
        return { success: false, error: 'No valid window' };
      }

      const captureOptions: Partial<AudioCaptureOptions> = {
        chunkDurationMs: options?.chunkDurationMs,
        sampleRate: options?.sampleRate,
        channels: options?.channels,
      };

      activeAudioCapture = new AudioCapture(captureOptions, (chunk: AudioChunk) => {
        if (senderWin && !senderWin.isDestroyed()) {
          senderWin.webContents.send('audio_capture_chunk', chunk);
        }
      });

      try {
        await activeAudioCapture.start(senderWin, options?.sourceId);
        logger.info('[IPC] audio_capture_start 已启动');
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[IPC] audio_capture_start failed:', message);
        activeAudioCapture.dispose();
        activeAudioCapture = null;
        return { success: false, error: message };
      }
    },
  );

  safeHandle('audio_capture_stop', async () => {
    if (activeAudioCapture) {
      activeAudioCapture.dispose();
      activeAudioCapture = null;
      logger.info('[IPC] audio_capture_stop 已停止');
    }
    return { success: true };
  });

  ipcMain.on(
    'audio_capture_chunk',
    (_event, data: unknown) => {
      // SEC-005: sender 验证，仅接受主窗口的音频数据
      const mainId = getMainWindowId();
      if (mainId !== null && _event.sender.id !== mainId) {
        logger.warn(
          `[IPC] Sender verification failed for "audio_capture_chunk": ` +
          `expected sender.id=${mainId}, got ${_event.sender.id}`
        );
        return;
      }

      // SEC: 运行时类型断言 — 防止恶意或格式错误的数据
      if (
        !data ||
        typeof data !== 'object' ||
        !('audioBuffer' in data) ||
        typeof (data as Record<string, unknown>).sampleRate !== 'number' ||
        typeof (data as Record<string, unknown>).channels !== 'number' ||
        typeof (data as Record<string, unknown>).durationMs !== 'number'
      ) {
        logger.warn('[IPC] audio_capture_chunk: invalid data format, dropping chunk');
        return;
      }

      const chunk = data as { audioBuffer: ArrayBuffer; sampleRate: number; channels: number; durationMs: number };
      if (activeAudioCapture && activeAudioCapture.isCapturing) {
        activeAudioCapture.handleRendererChunk(chunk);
      }
    },
  );

  // ---- Path C 视频录制 ----

  safeHandle(
    'video_record_start',
    async (event, sourceId: string, options?: VideoRecordOptions) => {
      // 幂等：先清理旧实例
      if (activeVideoRecorder) {
        activeVideoRecorder.dispose();
        activeVideoRecorder = null;
      }

      const senderWin = BrowserWindow.fromWebContents(event.sender);
      if (!senderWin || senderWin.isDestroyed()) {
        return { success: false, error: 'No valid window' };
      }

      activeVideoRecorder = new VideoRecorder(options);
      activeVideoRecorder.bindWindow(senderWin);

      try {
        activeVideoRecorder.startRecording(sourceId, options);
        logger.info('[IPC] video_record_start 已启动');
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[IPC] video_record_start failed:', message);
        activeVideoRecorder.dispose();
        activeVideoRecorder = null;
        return { success: false, error: message };
      }
    },
  );

  safeHandle('video_record_stop', async () => {
    if (!activeVideoRecorder) {
      return { success: false, error: 'No active recording' };
    }
    try {
      const filePath = await activeVideoRecorder.stopRecording();
      const finalStatus = activeVideoRecorder.status;
      logger.info('[IPC] video_record_stop 已完成');
      activeVideoRecorder.dispose();
      activeVideoRecorder = null;
      return { success: true, filePath, finalStatus };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[IPC] video_record_stop failed:', message);
      activeVideoRecorder?.dispose();
      activeVideoRecorder = null;
      return { success: false, error: message };
    }
  });

  safeHandle('video_record_pause', async () => {
    activeVideoRecorder?.pauseRecording();
    return { success: true };
  });

  safeHandle('video_record_resume', async () => {
    activeVideoRecorder?.resumeRecording();
    return { success: true };
  });

  safeHandle('video_record_status', async () => {
    return activeVideoRecorder?.status ?? {
      isRecording: false, isPaused: false, duration: 0, fileSizeBytes: 0, filePath: null,
    };
  });

  // 渲染进程回传视频数据块
  ipcMain.on('video_record_chunk', (_event, chunkBuffer: ArrayBuffer) => {
    // SEC-005: sender 验证
    const mainId = getMainWindowId();
    if (mainId !== null && _event.sender.id !== mainId) {
      logger.warn(
        `[IPC] Sender verification failed for "video_record_chunk": ` +
        `expected sender.id=${mainId}, got ${_event.sender.id}`
      );
      return;
    }
    activeVideoRecorder?.handleRendererChunk(chunkBuffer);
  });

  // 渲染进程上报录制错误
  ipcMain.on('video_record_error', (_event, errorInfo: { message: string }) => {
    const mainId = getMainWindowId();
    if (mainId !== null && _event.sender.id !== mainId) {
      logger.warn(
        `[IPC] Sender verification failed for "video_record_error": ` +
        `expected sender.id=${mainId}, got ${_event.sender.id}`
      );
      return;
    }
    activeVideoRecorder?.handleRendererError(errorInfo);
  });
}

// ================================================================
// 清理
// ================================================================

/**
 * 释放所有活跃的采集实例
 */
export function disposeCaptureHandlers(): void {
  // 清理防抖定时器
  if (startDebounceTimer) {
    clearTimeout(startDebounceTimer);
    startDebounceTimer = null;
  }
  if (activeCapture) {
    activeCapture.dispose();
    activeCapture = null;
  }
  if (activeAudioCapture) {
    activeAudioCapture.dispose();
    activeAudioCapture = null;
  }
  if (activeVideoRecorder) {
    activeVideoRecorder.dispose();
    activeVideoRecorder = null;
  }
}
