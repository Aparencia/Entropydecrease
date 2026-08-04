/**
 * 系统音频捕获 & 视频录制 IPC Handler
 *
 * @ai-context: 从 captureHandlers.ts 拆出。音频/视频数据块均由渲染进程
 * 经 ipcMain.on 回传（audio_capture_chunk / video_record_chunk），两处
 * 都有 SEC-005 sender.id 验证——仅接受主窗口数据，防第三方窗口注入；
 * 音频块另有运行时结构断言（audioBuffer/sampleRate/channels/durationMs）。
 * @ai-context: 所有 start 入口均幂等（先 dispose 旧实例再建新）。
 */
import { BrowserWindow, ipcMain } from 'electron';
import { AudioCapture, listAudioSources } from './audioCapture.js';
import { listMicrophoneDevices } from './audio/microphoneProvider.js';
import type { AudioCaptureOptions, AudioChunk } from './audioCapture.js';
import type { AudioSourcePreference } from '../src/lib/capture/audioSourceStrategy.js';
import { VideoRecorder, cleanupOrphanRecordings } from './videoRecorder.js';
import type { VideoRecordOptions } from './videoRecorder.js';
import { safeHandle, getMainWindowId } from './ipcUtils.js';
import { logger } from './logger.js';
import { feedStreamingAsr, isStreamingActive } from './ai/local-asr/streamingAsr.js';

// ================================================================
// 模块级状态
// ================================================================

/** 当前活跃的音频捕获实例 */
let activeAudioCapture: AudioCapture | null = null;

/** @ai-context Path C 全程录制：当前活跃的视频录制实例 */
let activeVideoRecorder: VideoRecorder | null = null;

/** SEC-005 sender 验证：非主窗口来源返回 false 并告警 */
function verifySender(senderId: number, channel: string): boolean {
  const mainId = getMainWindowId();
  if (mainId !== null && senderId !== mainId) {
    logger.warn(
      `[IPC] Sender verification failed for "${channel}": ` +
      `expected sender.id=${mainId}, got ${senderId}`
    );
    return false;
  }
  return true;
}

/**
 * 注册音频捕获与视频录制相关的 IPC handler
 */
export function registerMediaCaptureHandlers(): void {
  // ---- 启动清理（M20）----
  // 崩溃/强杀残留的孤儿录制文件在注册时回收（仅清 24h 前的），防临时目录堆积
  cleanupOrphanRecordings();

  // ---- 系统音频捕获 ----

  safeHandle('audio_list_sources', async () => {
    try {
      return await listAudioSources();
    } catch (err) {
      logger.error('[IPC] audio_list_sources failed:', err);
      return [];
    }
  });

  // 现场课程场景：枚举可用的麦克风设备（渲染进程通过此接口获取设备列表供用户选择）
  safeHandle('audio_list_microphones', async () => {
    try {
      return await listMicrophoneDevices();
    } catch (err) {
      logger.error('[IPC] audio_list_microphones failed:', err);
      return [];
    }
  });

  safeHandle(
    'audio_capture_start',
    async (
      event,
      options?: Partial<AudioCaptureOptions> & {
        sourceId?: string;
        /** 用户在设置页选择的音频源偏好（主进程读不到 localStorage，由渲染进程传入） */
        preference?: AudioSourcePreference;
        /** 现场课程场景：启用麦克风采集（与系统环回互斥） */
        microphone?: boolean;
      },
    ) => {
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
        // 真流式 ASR：激活时把音频块实时喂给 Paraformer 在线识别器
        // （partial/final 结果由 streamingAsr 经事件推回渲染进程）
        if (isStreamingActive()) {
          feedStreamingAsr(chunk.audioBuffer, chunk.sampleRate);
        }
      });

      try {
        await activeAudioCapture.start(senderWin, options?.sourceId, {
          preference: options?.preference,
          // 现场课程场景：麦克风采集标记透传至选源策略与 Provider 工厂
          microphone: options?.microphone,
        });
        const decision = activeAudioCapture.sourceDecision;
        logger.info('[IPC] audio_capture_start 已启动');
        // 回传生效源：渲染进程据此分支诊断文案并写入会话元数据（内测归因）
        return {
          success: true,
          sourceKind: activeAudioCapture.activeSourceKind,
          sourceReason: decision?.reason,
        };
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

  // A2 语音对话互斥保护：启动前先查询是否已有活跃采集（如课堂采集），
  // 避免 audio_capture_start 的幂等 dispose 误伤正在进行的课堂采集
  safeHandle('audio_capture_status', async () => {
    return { active: activeAudioCapture !== null && activeAudioCapture.isCapturing };
  });

  ipcMain.on(
    'audio_capture_chunk',
    (_event, data: unknown) => {
      // SEC-005: sender 验证，仅接受主窗口的音频数据
      if (!verifySender(_event.sender.id, 'audio_capture_chunk')) return;

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
    // 竞态防护：先同步取引用并置空，双停时第二次调用直接返回无活跃录制；
    // 也避免 await 期间新录制启动后被误 dispose
    const recorder = activeVideoRecorder;
    activeVideoRecorder = null;
    try {
      const filePath = await recorder.stopRecording();
      const finalStatus = recorder.status;
      logger.info('[IPC] video_record_stop 已完成');
      recorder.dispose();
      return { success: true, filePath, finalStatus };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[IPC] video_record_stop failed:', message);
      recorder.dispose();
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
    if (!verifySender(_event.sender.id, 'video_record_chunk')) return;
    activeVideoRecorder?.handleRendererChunk(chunkBuffer);
  });

  // 渲染进程上报录制错误
  ipcMain.on('video_record_error', (_event, errorInfo: { message: string }) => {
    if (!verifySender(_event.sender.id, 'video_record_error')) return;
    activeVideoRecorder?.handleRendererError(errorInfo);
  });
}

/**
 * 释放音频/视频采集资源
 */
export function disposeMediaCaptureHandlers(): void {
  if (activeAudioCapture) {
    activeAudioCapture.dispose();
    activeAudioCapture = null;
  }
  if (activeVideoRecorder) {
    activeVideoRecorder.dispose();
    activeVideoRecorder = null;
  }
}
