/**
 * 本地 ASR — IPC Handler 注册（sherpa-onnx 版）
 *
 * @ai-context: 注册本地 ASR 相关的全部 IPC 通道：
 * - local_asr_transcribe: 执行本地转写（渲染进程课堂助手调用）
 * - local_asr_get_config / local_asr_update_config: 配置读写
 * - local_asr_check_available: 检测本地 ASR 可用性
 * - local_asr_download_model / local_asr_delete_model: 模型管理
 * - local_asr_get_models: 获取模型列表与状态
 * @ai-context: IPC 接口契约与 whisper.cpp 版完全一致，
 * 渲染进程 asrTranscriber.ts 无需任何改动即可切换引擎。
 */

import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../logger.js';
import {
  getLocalAsrConfig,
  updateLocalAsrConfig,
  isLocalAsrEnabled,
  isModelReady,
  type LocalAsrConfig,
  type AsrEngine,
} from './config.js';
import {
  transcribeLocal,
  checkLocalAsrAvailable,
  isStreamingAsrAvailable,
} from './SherpaAsrService.js';
import {
  startStreamingAsr,
  stopStreamingAsr,
} from './streamingAsr.js';
import {
  downloadModel,
  deleteModel,
  getModelsStatus,
  getDownloadStatus,
} from './modelManager.js';

export function registerLocalAsrHandlers(): void {
  // ── 转写（核心接口，渲染进程 asrTranscriber.ts 调用） ──
  ipcMain.handle(
    'local_asr_transcribe',
    async (_event, args: {
      audioBase64: string;
      language?: string;
      sampleRate?: number;
      channels?: number;
      isWav?: boolean;
    }) => {
      if (!isLocalAsrEnabled()) {
        throw new Error('本地 ASR 未启用或模型未下载');
      }
      return transcribeLocal(args.audioBase64, {
        language: args.language,
        sampleRate: args.sampleRate,
        channels: args.channels,
      });
    },
  );

  // ── 配置 ──
  ipcMain.handle('local_asr_get_config', () => {
    return getLocalAsrConfig();
  });

  ipcMain.handle('local_asr_update_config', async (_event, partial: Partial<LocalAsrConfig>) => {
    return updateLocalAsrConfig(partial);
  });

  // ── 可用性检测 ──
  ipcMain.handle('local_asr_check_available', async () => {
    const available = await checkLocalAsrAvailable();
    const config = getLocalAsrConfig();
    return {
      available,
      enabled: config.enabled,
      engine: config.engine,
      modelDownloaded: isModelReady(config.engine),
    };
  });

  // ── 真流式 ASR（Paraformer 在线，课堂 smart 采集实时转录） ──
  // 渲染进程据此决定是否走真流式链路（否则回退按段转写）
  ipcMain.handle('local_asr_stream_available', () => {
    return { available: isStreamingAsrAvailable() };
  });

  // 启动真流式：创建在线流，后续音频块经 mediaCaptureHandlers 喂入，
  // partial/final 结果经 asr_stream_partial / asr_stream_final 事件推回渲染进程
  ipcMain.handle(
    'local_asr_stream_start',
    async (event, args: { sampleRate?: number }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) {
        return { success: false, error: 'No valid window' };
      }
      return startStreamingAsr(win, args?.sampleRate ?? 16000);
    },
  );

  ipcMain.handle('local_asr_stream_stop', async () => {
    stopStreamingAsr();
    return { success: true };
  });

  // ── 模型管理 ──
  ipcMain.handle('local_asr_get_models', () => {
    return {
      models: getModelsStatus(),
      download: getDownloadStatus(),
    };
  });

  ipcMain.handle(
    'local_asr_download_model',
    async (_event, args: { engine: AsrEngine }) => {
      logger.info(`[LocalASR] IPC download request: engine=${args.engine}`);
      const modelPath = await downloadModel(args.engine);
      return { success: true, modelPath };
    },
  );

  ipcMain.handle(
    'local_asr_delete_model',
    async (_event, args: { engine: AsrEngine }) => {
      await deleteModel(args.engine);
      return { success: true };
    },
  );

  logger.info('[LocalASR] IPC handlers registered (sherpa-onnx)');
}
